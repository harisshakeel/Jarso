import "server-only";
import {
  NOTICED_MAX_DETAIL,
  type NoticedLine,
  type NoticedPayload,
  type NoticedSignal,
  noticedLines,
  pickSignal,
} from "@jarso/core/guide";
import { pushAfterNotices } from "@/features/notifications/server";
import { logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { guideBreaker } from "./breaker";
import { budgetSpent } from "./budget";
import { getGuideProvider } from "./config";
import { addFact, describeFacts, type Facts, fillFacts } from "./facts";
import type { GuideProvider } from "./provider";
import { listNoticedInputs, type NoticedRow, recordNoticed } from "./repository";

/**
 * Jarso noticed (demo 3, ADR 0011): the weekly job. For each approved child it picks at most one
 * signal (worked out in code, `pickSignal`), builds the fixed lines, and records the nudge, which
 * writes one notice to the child and one to each parent. Where Jarso is on for the child and the
 * guide is up and within budget, Claude Haiku may reword the child's line; the reworded line is
 * kept only if it carries exactly the fixed line's `{{refs}}` and passes the output screen.
 * Otherwise, and always where a parent turned Jarso off, the fixed line goes out and nothing is
 * sent to Anthropic. Logs counts only, never a child or a line.
 */

/** Children handled at once: each may wait on Claude for a few seconds. */
const CONCURRENCY = 4;
/** A bound on one run; the pilot has a few dozen children. */
const MAX_CHILDREN = 1000;
/** Rewording one line and screening it, together. */
const WORD_TIMEOUT_MS = 15_000;
/** The database allows one nudge in 6 days; skip such a child before any model call. */
const RECENT_MS = 6 * 24 * 60 * 60 * 1000;

/** What the output screen reads in place of a child's message. */
const NO_MESSAGE = "(No message: this is Jarso's weekly note. The child did not ask anything.)";
const NOTE_CONTEXT =
  "Context from the app: a short weekly note Jarso sends a child about their own money.";

export type NoticedRunResult = {
  children: number;
  nudged: number;
  notices: number;
  worded: number;
  quiet: number;
  failed: number;
  timedOut: boolean;
};

type ChildOutcome = { notices: number; worded: boolean } | null;

const REF = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** The refs in a line, as a sorted list of keys. */
function refsIn(line: string): string[] {
  return [...line.matchAll(REF)].map((match) => match[1] ?? "").sort();
}

function sameRefs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref === b[i]);
}

/** A fixed line with its figures in. The core copy only uses refs it has facts for. */
function filled(detail: string, facts: Facts): string {
  const result = fillFacts(detail, facts);
  if (result.unknown.length > 0) throw new Error("A fixed line used a figure it doesn't have");
  return result.text;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * The child's line reworded by Claude with its figures in, or null to send the fixed line: the
 * model refused, dropped or added a ref, wrote something too long or with an exclamation mark,
 * or the output screen held it back.
 */
async function wordChildLine(
  provider: GuideProvider,
  template: string,
  facts: Facts,
): Promise<string | null> {
  const signal = AbortSignal.timeout(WORD_TIMEOUT_MS);
  try {
    const { line } = await provider.wordNotice({ line: template, signal });
    if (!line || !sameRefs(refsIn(line), refsIn(template))) return null;
    const result = fillFacts(line, facts);
    const text = result.text.trim();
    if (
      result.unknown.length > 0 ||
      !text ||
      text.length > NOTICED_MAX_DETAIL ||
      text.includes("!")
    ) {
      return null;
    }
    const verdict = await provider.screenOutput({
      reply: text,
      childText: NO_MESSAGE,
      context: `${NOTE_CONTEXT}\n${describeFacts(facts)}`,
      signal,
    });
    guideBreaker.recordSuccess();
    if (!verdict.pass) {
      logger.info("Jarso noticed line held back by the output screen", {
        problem: verdict.problem,
      });
      return null;
    }
    return text;
  } catch (error) {
    // An infrastructure failure (HTTP, network, timeout): the fixed line goes out.
    guideBreaker.recordFailure();
    logger.warn("Jarso noticed wording failed", { error: errorName(error) });
    return null;
  }
}

function payload(
  signal: NoticedSignal,
  line: NoticedLine,
  detail: string,
  worded: boolean,
): NoticedPayload {
  return { signal: signal.kind, title: line.title, detail, open: line.open, worded };
}

/**
 * One child's week: the signal, the lines, the nudge. `provider` is null when no line may be
 * reworded this run. Returns null when there was nothing to say, or it was said already.
 */
export async function noticeChild(
  admin: ReturnType<typeof createAdminClient>,
  row: NoticedRow,
  provider: GuideProvider | null,
  now: Date = new Date(),
): Promise<ChildOutcome> {
  if (row.lastNoticedAt && now.getTime() - new Date(row.lastNoticedAt).getTime() < RECENT_MS) {
    return null;
  }
  const signal = pickSignal(row.input);
  if (!signal) return null;
  const lines = noticedLines(signal, {
    nickname: row.nickname,
    currency: row.currency,
    guideOn: row.guideOn,
  });
  const facts: Facts = new Map();
  for (const [key, shown] of lines.facts) addFact(facts, key, shown);

  let child: NoticedPayload | null = null;
  if (lines.child) {
    // Only where the parent left Jarso on is anything about the child sent to Anthropic.
    const worded =
      row.guideOn && provider ? await wordChildLine(provider, lines.child.detail, facts) : null;
    child = payload(
      signal,
      lines.child,
      worded ?? filled(lines.child.detail, facts),
      worded !== null,
    );
  }
  const parent = payload(signal, lines.parent, filled(lines.parent.detail, facts), false);

  const notices = await recordNoticed(admin, {
    childId: row.childId,
    signalKey: signal.key,
    child,
    parent,
  });
  return notices > 0 ? { notices, worded: child?.worded ?? false } : null;
}

/** Runs `tasks` with at most CONCURRENCY in flight. */
async function runLimited(tasks: Array<() => Promise<void>>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (task) await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
}

/**
 * The weekly run (`/api/cron/guide/noticed`). Safe to repeat: the database sends a signal once
 * and a child at most one nudge in 6 days. Stops starting new children once `budgetMs` is used.
 */
export async function runGuideNoticed({
  budgetMs,
  now = new Date(),
}: {
  budgetMs: number;
  now?: Date;
}): Promise<NoticedRunResult> {
  const started = Date.now();
  const admin = createAdminClient();
  const rows = (await listNoticedInputs(admin, now.toISOString())).slice(0, MAX_CHILDREN);
  const result: NoticedRunResult = {
    children: rows.length,
    nudged: 0,
    notices: 0,
    worded: 0,
    quiet: 0,
    failed: 0,
    timedOut: false,
  };

  // Claude rewords lines only while the guide runs on this deployment, its breaker is closed and
  // today's and this month's budget have room. Checked once per run.
  const provider = getGuideProvider();
  const canWord =
    provider !== null &&
    !guideBreaker.isOpen() &&
    !(provider.name === "anthropic" && (await budgetSpent().catch(() => true)));

  await runLimited(
    rows.map((row) => async () => {
      if (Date.now() - started >= budgetMs) {
        result.timedOut = true;
        return;
      }
      try {
        const outcome = await noticeChild(admin, row, canWord ? provider : null, now);
        if (!outcome) {
          result.quiet += 1;
          return;
        }
        result.nudged += 1;
        result.notices += outcome.notices;
        if (outcome.worded) result.worded += 1;
      } catch (error) {
        result.failed += 1;
        logger.warn("Jarso noticed failed for a child", { error: errorName(error) });
      }
    }),
  );

  if (result.notices > 0) pushAfterNotices();
  logger.info("Jarso noticed run", result);
  return result;
}

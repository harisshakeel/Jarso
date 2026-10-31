import "server-only";
import { describeCadence } from "@/features/allowance";
import { getSchedule, listDueForChild } from "@/features/allowance/server";
import { type NextStep, skillLevelLabels, skills } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { getHistoryPage, getJars, type HistoryPage } from "@/features/ledger/server";
import { getChildRules } from "@/features/rules/server";
import {
  addDays,
  familyToday,
  formatMoney,
  logger,
  MAX_AMOUNT_MINOR,
  parseMoney,
  startOfWeek,
} from "@/lib";
import { guideCopy } from "../copy";
import { addFact, type Facts } from "./facts";
import type { TurnTools } from "./provider";
import { looksUnsafe } from "./safety-net";
import { scrub } from "./scrub";
import {
  isToolName,
  MAX_TOOL_CALLS,
  type Period,
  type ToolCall,
  type ToolInput,
  type ToolName,
  toolInputs,
  toolNames,
  toolSpecs,
} from "./tool-specs";

/**
 * Jarso's look-ups (ADR 0011). Every runner reads through the feature services as the signed-in
 * child, so RLS applies and the child's id comes from the session, never from the model. Each
 * returns plain data for the model, with every figure as a `{ ref, value }` pair from `fact`.
 * A tool's second call in a turn gets its own refs (`history2.spent`), so "this week or last
 * week?" can't mix two figures up. Nothing here writes.
 */

/** Lines of money history the model sees at most. */
const HISTORY_LINES = 10;
/** A label typed by a person, as the model sees it. */
const LABEL_CHARS = 40;

export type ToolContext = { childId: string; currency: string; timezone: string };

/** Records one figure under this call's refs. */
type Fact = (key: string, shown: string) => { ref: string; value: string };

type Run<N extends ToolName> = (
  input: ToolInput<N>,
  ctx: ToolContext & { today: string },
  fact: Fact,
) => Promise<unknown>;

/** "Fri 6 Nov" for an ISO date. Dates are calendar days, so format them in UTC. */
function showDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Labels that read like instructions to the model. They never pass the input screen. */
const INSTRUCTION_LIKE =
  /\b(ignore|forget|disregard)\b.{0,30}\b(rules|instructions|prompt)\b|\bpretend\b|\bsystem prompt\b|\byou are (now|a)\b/i;

/**
 * A label someone typed (a purchase, a gift note): contact details removed, no braces (so it
 * can't fake a ref), short. Labels skip the input screen, so one that trips the safety keyword
 * net or reads like an instruction is not shown to the model at all.
 */
function cleanLabel(label: string): string {
  const text = scrub(label).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  if (looksUnsafe(text) || INSTRUCTION_LIKE.test(text)) return "(label not shown)";
  return text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text;
}

function money(fact: Fact, key: string, minor: number, currency: string) {
  return fact(key, formatMoney(minor, currency, { showMinor: "nonzero" }));
}

function periodRange(period: Period, today: string): { from: string; to: string; text: string } {
  // The same Monday-to-Sunday week as "learning days this week".
  const monday = startOfWeek(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (period) {
    case "this_week":
      return { from: monday, to: today, text: "this week (from Monday)" };
    case "last_week":
      return { from: addDays(monday, -7), to: addDays(monday, -1), text: "last week" };
    case "this_month":
      return { from: monthStart, to: today, text: "this month" };
    case "last_month": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay, text: "last month" };
    }
    case "latest":
      return { from: "0000-01-01", to: today, text: "the newest lines" };
  }
}

/** Whether a page reaches back past `from`, so totals for the range are complete. */
function coversRange(page: HistoryPage, from: string): boolean {
  if (!page.olderBefore) return true;
  const oldest = page.items.at(-1);
  return !!oldest && oldest.occurredOn < from;
}

function nextStepText(step: NextStep): string {
  switch (step.kind) {
    case "resume":
      return `Finish the mission "${step.title}"`;
    case "check-in":
      return "Do the starting check-in";
    case "practice":
      return "Answer the practice questions that are waiting";
    case "mission":
      return `Start the mission "${step.title}"`;
    case "done":
      return "Every mission is done for now";
  }
}

const runners: { [N in ToolName]: Run<N> } = {
  async get_jars(_input, { childId, currency }, fact) {
    const [jars, due] = await Promise.all([getJars(childId), listDueForChild(childId)]);
    return {
      spend: money(fact, "jars.spend", jars.spend, currency),
      save: money(fact, "jars.save", jars.save, currency),
      both_jars: money(fact, "jars.total", jars.spend + jars.save, currency),
      allowance_waiting:
        due.count > 0
          ? {
              amount: money(fact, "jars.waiting", due.totalMinor, currency),
              note: "Due but not handed over yet, so not in a jar.",
            }
          : null,
    };
  },

  async get_allowance(_input, { childId, currency }, fact) {
    const [schedule, due] = await Promise.all([getSchedule(childId), listDueForChild(childId)]);
    if (!schedule) return { has_allowance: false };
    return {
      has_allowance: true,
      status: schedule.status,
      amount: money(fact, "allowance.amount", schedule.amountMinor, currency),
      how_often: describeCadence(schedule.frequency, schedule.anchorOn),
      next_due: schedule.nextDueOn
        ? fact("allowance.next_date", showDate(schedule.nextDueOn))
        : null,
      waiting:
        due.count > 0
          ? {
              amount: money(fact, "allowance.waiting", due.totalMinor, currency),
              note: "Due but not handed over yet.",
            }
          : null,
    };
  },

  async get_money_history({ period }, { childId, currency, today }, fact) {
    const page = await getHistoryPage(childId);
    const range = periodRange(period, today);
    const items = page.items.filter(
      (item) => item.occurredOn >= range.from && item.occurredOn <= range.to,
    );
    let moneyIn = 0;
    let spent = 0;
    let purchases = 0;
    for (const item of items) {
      if (item.undone || item.amountMinor === null) continue;
      if (item.kind === "purchase") {
        spent += item.amountMinor;
        purchases += 1;
      } else if (item.kind === "allowance" || item.kind === "gift") {
        moneyIn += item.amountMinor;
      }
    }
    const lines = items.slice(0, HISTORY_LINES).map((item, index) => {
      const n = index + 1;
      return {
        date: fact(`history.${n}.date`, showDate(item.occurredOn)),
        what:
          item.kind === "skipped"
            ? "allowance not given"
            : item.undone
              ? "purchase (undone)"
              : item.kind,
        label: cleanLabel(item.label),
        amount:
          item.amountMinor === null
            ? null
            : money(fact, `history.${n}.amount`, item.amountMinor, currency),
      };
    });
    return {
      period: range.text,
      money_in: money(fact, "history.money_in", moneyIn, currency),
      spent: money(fact, "history.spent", spent, currency),
      purchases: fact("history.purchases", String(purchases)),
      lines,
      more_lines_not_shown: Math.max(0, items.length - lines.length),
      complete:
        period === "latest" || coversRange(page, range.from)
          ? true
          : "No: older history was not read, so these totals may be too low.",
    };
  },

  async get_money_rules(_input, { childId, currency }, fact) {
    const { allowNegativeSpend, rules } = await getChildRules(childId);
    const limits = rules
      .filter((rule) => rule.kind === "spend_limit")
      .map((rule) => ({
        rule:
          rule.period === "item"
            ? "Spending limit for one purchase"
            : `Spending limit per ${rule.period}`,
        amount: money(fact, `rules.spend_limit_${rule.period}`, rule.amountMinor, currency),
      }));
    return {
      spend_can_go_below_zero: allowNegativeSpend,
      spending_limits: limits,
      note: "A limit never stops a purchase: going over it sends the parent a notice.",
    };
  },

  async get_learning(_input, { childId }, fact) {
    const overview = await getLearningOverview(childId);
    const levels = new Map(overview.skills.map((skill) => [skill.skillKey, skill.level]));
    return {
      next_step: nextStepText(overview.nextStep),
      skills: skills.map((skill) => ({
        skill: skill.label,
        level: skillLevelLabels[levels.get(skill.key) ?? 0],
      })),
      practice_waiting: fact("learning.practice_due", String(overview.practiceDue)),
      learning_days_this_week: fact("learning.days_this_week", String(overview.daysThisWeek)),
      missions_finished: fact("learning.missions_done", String(overview.completed.length)),
    };
  },

  async plan_saving({ price, save_each }, { childId, currency }, fact) {
    const priceMinor = parseMoney(price, currency);
    if (!priceMinor || priceMinor > MAX_AMOUNT_MINOR) {
      return { error: "The price must be a plain amount like 120 or 12.50." };
    }
    const eachMinor = save_each === null ? null : parseMoney(save_each, currency);
    if (save_each !== null && (!eachMinor || eachMinor > MAX_AMOUNT_MINOR)) {
      return { error: "save_each must be a plain amount like 5, or null." };
    }
    const [jars, schedule] = await Promise.all([getJars(childId), getSchedule(childId)]);
    const needed = Math.max(0, priceMinor - jars.save);
    const allowance =
      schedule && schedule.status !== "stopped"
        ? {
            amount: money(fact, "plan.allowance_amount", schedule.amountMinor, currency),
            how_often: describeCadence(schedule.frequency, schedule.anchorOn),
            next_due: schedule.nextDueOn
              ? fact("plan.next_date", showDate(schedule.nextDueOn))
              : null,
          }
        : null;
    return {
      price: money(fact, "plan.price", priceMinor, currency),
      in_spend: money(fact, "plan.in_spend", jars.spend, currency),
      spend_covers_it: jars.spend >= priceMinor,
      in_save: money(fact, "plan.in_save", jars.save, currency),
      still_needed: money(fact, "plan.still_needed", needed, currency),
      already_enough: needed === 0,
      save_each: eachMinor ? money(fact, "plan.save_each", eachMinor, currency) : null,
      allowances_needed:
        eachMinor && needed > 0
          ? fact("plan.allowances", String(Math.ceil(needed / eachMinor)))
          : null,
      allowance,
      note: "Only the Save jar counts toward a price. Money that is due is not counted until it is handed over.",
    };
  },
};

/**
 * The toolbox for one turn. Unknown names, bad arguments and failed reads come back to the model
 * as errors it can recover from; the child sees a status line for each look-up.
 */
export function createTurnTools(
  ctx: ToolContext,
  onStatus: (text: string) => void = () => {},
): TurnTools {
  const facts: Facts = new Map();
  const calls: ToolCall[] = [];
  const timesCalled = new Map<ToolName, number>();
  const today = familyToday(ctx.timezone);
  const error = (message: string) => ({
    content: JSON.stringify({ error: message }),
    isError: true,
  });

  return {
    specs: toolSpecs,
    facts,
    calls,
    async run(name, input) {
      if (!isToolName(name)) {
        return error(`There is no tool called ${name}. Use one of: ${toolNames.join(", ")}.`);
      }
      if (calls.length >= MAX_TOOL_CALLS) {
        return error("That's enough look-ups for this question. Answer with what you have.");
      }
      const parsed = toolInputs[name].safeParse(input ?? {});
      if (!parsed.success) return error(`The arguments for ${name} don't match its schema.`);
      calls.push({ name, input: parsed.data });
      const n = (timesCalled.get(name) ?? 0) + 1;
      timesCalled.set(name, n);
      // A second call's refs get a number: `jars.spend`, then `jars2.spend`.
      const fact: Fact = (key, shown) =>
        addFact(facts, n === 1 ? key : key.replace(/^([a-z_]+)\./, `$1${n}.`), shown);
      try {
        onStatus(guideCopy.status[name]);
      } catch {
        // A status line that can't be sent (the child closed the page) never fails a look-up.
      }
      try {
        const run = runners[name] as Run<typeof name>;
        const data = await run(parsed.data as never, { ...ctx, today }, fact);
        // A runner returns `{ error }` for arguments the model can fix (a price it can't read).
        const failed = typeof data === "object" && data !== null && "error" in data;
        return { content: JSON.stringify(data), isError: failed };
      } catch (cause) {
        // Name only: an error message can echo data.
        logger.warn("Guide tool failed", {
          tool: name,
          error: cause instanceof Error ? cause.name : typeof cause,
        });
        return error(`${name} couldn't be read just now. Say so plainly; don't guess.`);
      }
    },
  };
}

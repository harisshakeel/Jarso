import "server-only";
import { describeCadence } from "@/features/allowance";
import { getSchedule, listDueForChild } from "@/features/allowance/server";
import { getGoalView } from "@/features/goals/server";
import { type NextStep, skillLevelLabels, skills } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { getHistoryPage, type HistoryPage } from "@/features/ledger/server";
import type { RequestStatus } from "@/features/requests";
import { getAvailability, listRequests } from "@/features/requests/server";
import { getChildRules } from "@/features/rules/server";
import {
  addDays,
  familyToday,
  formatMoney,
  localDateOf,
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
/** Requests the model sees at most. */
const REQUEST_LINES = 5;
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

const REQUEST_STATUS: Record<RequestStatus, string> = {
  pending: "waiting for a parent",
  approved: "parent said yes; the hand-over is next",
  handed_over: "done: handed over",
  confirmed: "done: parent confirmed",
  rejected: "parent said no",
  cancelled: "cancelled",
};

const HISTORY_KIND: Record<string, string> = {
  skipped: "allowance not given",
  withdrawal: "taken out of Save into Spend (not new money)",
  deposit: "put from Spend into Save (not new money)",
  extra: "extra money from their parent, into Spend",
};

function nextStepText(step: NextStep): string {
  switch (step.kind) {
    case "resume":
      return `Finish the mission "${step.title}"`;
    case "check-in":
      return "Do the starting check-in";
    case "practice":
      return "Answer the practice questions that are waiting";
    case "comeback":
      return "Answer one fresh question to ease back in after a few days away";
    case "mission":
      return `Start the mission "${step.title}"`;
    case "done":
      return "Every mission is done for now";
  }
}

const runners: { [N in ToolName]: Run<N> } = {
  async get_jars(_input, { childId, currency }, fact) {
    const [jars, due] = await Promise.all([getAvailability(childId), listDueForChild(childId)]);
    return {
      spend: money(fact, "jars.spend", jars.spendMinor, currency),
      save: money(fact, "jars.save", jars.saveMinor, currency),
      both_jars: money(fact, "jars.total", jars.spendMinor + jars.saveMinor, currency),
      waiting_to_come_out_of_save:
        jars.reservedSaveMinor > 0
          ? {
              amount: money(fact, "jars.reserved", jars.reservedSaveMinor, currency),
              note: "Asked to take out and not handed over yet: still in Save, but not free.",
            }
          : null,
      waiting_to_go_into_save:
        jars.heldSpendMinor > 0
          ? {
              amount: money(fact, "jars.held", jars.heldSpendMinor, currency),
              note: "Asked to put in and not confirmed yet: still in Spend, but held.",
            }
          : null,
      free_to_use: {
        spend: money(fact, "jars.free_spend", jars.availableSpendMinor, currency),
        save: money(fact, "jars.free_save", jars.availableSaveMinor, currency),
      },
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
        what: item.undone ? "purchase (undone)" : (HISTORY_KIND[item.kind] ?? item.kind),
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

  async get_goal(_input, { childId, currency }, fact) {
    const view = await getGoalView(childId);
    if (!view) {
      return { has_goal: false, note: "No goal yet. The child can set one from their Save jar." };
    }
    const { goal, progress } = view;
    return {
      has_goal: true,
      goal: cleanLabel(goal.name),
      price: money(fact, "goal.price", goal.targetMinor, currency),
      counts_toward_it: money(fact, "goal.saved", progress.countedMinor, currency),
      still_needed: money(fact, "goal.still_needed", progress.remainingMinor, currency),
      reached: progress.reached,
      plan_per_allowance: goal.planMinor
        ? money(fact, "goal.plan", goal.planMinor, currency)
        : null,
      allowances_left:
        progress.paymentsLeft !== null && !progress.reached
          ? fact("goal.allowances", String(progress.paymentsLeft))
          : null,
      how_full: fact("goal.percent", `${Math.floor(progress.fillRatio * 100)}%`),
      note: "Only Save counts, less money waiting to come out. Due and pending money doesn't count.",
    };
  },

  async get_requests(_input, { childId, currency, timezone }, fact) {
    const requests = await listRequests(childId);
    const shown = requests.slice(0, REQUEST_LINES);
    return {
      requests: shown.map((request, index) => {
        const n = index + 1;
        return {
          what:
            request.kind === "withdrawal"
              ? "take out of Save"
              : request.kind === "deposit"
                ? "put into Save"
                : "extra money from their parent (goes into Spend when handed over)",
          status: REQUEST_STATUS[request.status],
          amount: money(fact, `requests.${n}.amount`, request.amountMinor, currency),
          date: fact(`requests.${n}.date`, showDate(localDateOf(request.occurredAt, timezone))),
          reason: request.reason ? cleanLabel(request.reason) : null,
          automatic: request.auto,
        };
      }),
      more_not_shown: Math.max(0, requests.length - shown.length),
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
    const [jars, schedule] = await Promise.all([getAvailability(childId), getSchedule(childId)]);
    // Like the goal: only free money counts, never money waiting to come out or go in.
    const needed = Math.max(0, priceMinor - jars.availableSaveMinor);
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
      in_spend: money(fact, "plan.in_spend", jars.availableSpendMinor, currency),
      spend_covers_it: jars.availableSpendMinor >= priceMinor,
      in_save: money(fact, "plan.in_save", jars.availableSaveMinor, currency),
      still_needed: money(fact, "plan.still_needed", needed, currency),
      already_enough: needed === 0,
      save_each: eachMinor ? money(fact, "plan.save_each", eachMinor, currency) : null,
      allowances_needed:
        eachMinor && needed > 0
          ? fact("plan.allowances", String(Math.ceil(needed / eachMinor)))
          : null,
      allowance,
      note: "Only free money counts: Save less money waiting to come out, Spend less money waiting to go in. Money that is due is not counted until it is handed over.",
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

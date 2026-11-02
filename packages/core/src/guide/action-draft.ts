import {
  changeAllowanceSchema,
  frequencies,
  giftSchema,
  handoverSchema,
} from "@jarso/core/allowance";
import {
  purchaseSchema,
  receivedCategorySchema,
  receivedSchema,
  spendCategorySchema,
} from "@jarso/core/diary";
import { categoryOf, RECEIVED_CATEGORIES, SPEND_CATEGORIES } from "@jarso/core/ledger";
import { formatMoney, MAX_AMOUNT_MINOR, parseMoney, toMajorString } from "@jarso/core/lib";
import {
  completeSchema,
  decideSchema,
  depositSchema,
  emergencySchema,
  rejectDepositSchema,
  withdrawalSchema,
} from "@jarso/core/requests";
import { z } from "zod";

/**
 * "Jarso does tasks" (demo 3): Jarso fills a typed draft of something the child or parent could
 * do in the app, asks for anything missing, and the app shows a card. Only the user's tap runs
 * the action, through the same feature service as the app's own form, under their own session.
 * Every draft is checked against that form's schema, so a draft can never hold something the
 * form would refuse. Money is integer minor units; practice money never appears here.
 */

export const childActionKinds = [
  "money_received",
  "purchase",
  "jar_move",
  "savings_request",
] as const;
export const parentActionKinds = [
  "hand_over_allowance",
  "record_gift",
  "change_allowance",
  "decide_request",
] as const;
export const actionKinds = [...childActionKinds, ...parentActionKinds] as const;
export type ActionKind = (typeof actionKinds)[number];
export type ChildActionKind = (typeof childActionKinds)[number];
export type ParentActionKind = (typeof parentActionKinds)[number];

export function isActionKindFor(kind: ActionKind, asker: "child" | "parent"): boolean {
  return (asker === "child" ? childActionKinds : parentActionKinds).includes(kind as never);
}

// ---------------------------------------------------------------------------
// What the model fills: plain text fields, every one optional
// ---------------------------------------------------------------------------

export const actionFieldNames = [
  "amount",
  "jar",
  "from",
  "to",
  "label",
  "category",
  "request",
  "reason",
  "cash",
  "saved",
  "frequency",
  "request_id",
  "decision",
] as const;
export type ActionFieldName = (typeof actionFieldNames)[number];

const field = z.string().trim().max(160).nullable().optional();
export const actionFieldsSchema = z.strictObject(
  Object.fromEntries(actionFieldNames.map((name) => [name, field])) as Record<
    ActionFieldName,
    typeof field
  >,
);
export type ActionFields = Partial<Record<ActionFieldName, string | null>>;

/**
 * What each kind needs before a card can show. `split` (hand-over) means cash, saved or both.
 * Everything else has a default: a category is Other, a jar move goes to the other jar, a new
 * allowance keeps how often it comes.
 */
export const requiredActionFields: Record<ActionKind, readonly string[]> = {
  money_received: ["amount", "jar"],
  purchase: ["amount", "label"],
  jar_move: ["amount", "from"],
  savings_request: ["request", "amount"],
  hand_over_allowance: ["split"],
  record_gift: ["amount", "jar"],
  change_allowance: ["amount"],
  decide_request: ["request_id", "decision"],
};

/** Plain words for each missing field, for the one follow-up question. */
export const actionFieldWords: Record<string, string> = {
  amount: "how much",
  jar: "which jar (Spend or Save)",
  from: "which jar it comes from",
  label: "what it was",
  request: "whether to take money out of Save, put money in, or ask for extra",
  reason: "what it's for",
  split: "how much as cash and how much into Save",
  request_id: "which request",
  decision: "yes or no",
};

const present = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** The fields this draft still needs, in order. An emergency ask also needs its reason. */
export function missingActionFields(kind: ActionKind, fields: ActionFields): string[] {
  const missing = requiredActionFields[kind].filter((name) =>
    name === "split"
      ? !present(fields.cash) && !present(fields.saved)
      : !present(fields[name as ActionFieldName]),
  );
  if (
    kind === "savings_request" &&
    readRequestKind(fields.request) === "emergency" &&
    !present(fields.reason)
  ) {
    missing.push("reason");
  }
  return missing;
}

// ---------------------------------------------------------------------------
// The typed draft the card shows and the confirm action takes
// ---------------------------------------------------------------------------

const jar = z.enum(["spend", "save"]);
const minor = z.number().int().positive().max(MAX_AMOUNT_MINOR);
const minorOrZero = z.number().int().min(0).max(MAX_AMOUNT_MINOR);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max).nullable();
const requestKind = z.enum(["withdrawal", "deposit", "emergency"]);

/** Labels and reasons are shorter than the forms allow, so a stored draft stays small. */
export const DRAFT_LABEL_CHARS = 40;
export const DRAFT_REASON_CHARS = 80;

export const actionDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("money_received"),
    id: z.uuid(),
    amountMinor: minor,
    jar,
    category: receivedCategorySchema,
    label: text(DRAFT_LABEL_CHARS),
  }),
  z.strictObject({
    kind: z.literal("purchase"),
    id: z.uuid(),
    amountMinor: minor,
    category: spendCategorySchema,
    label: text(DRAFT_LABEL_CHARS),
  }),
  z
    .strictObject({
      kind: z.literal("jar_move"),
      id: z.uuid(),
      amountMinor: minor,
      from: jar,
      to: jar,
    })
    .refine((draft) => draft.from !== draft.to, "Money moves between two different jars."),
  z
    .strictObject({
      kind: z.literal("savings_request"),
      id: z.uuid(),
      request: requestKind,
      amountMinor: minor,
      reason: text(DRAFT_REASON_CHARS),
    })
    .refine(
      (draft) => draft.request !== "emergency" || draft.reason !== null,
      "Say what it's for.",
    ),
  z
    .strictObject({
      kind: z.literal("hand_over_allowance"),
      id: z.uuid(),
      childId: z.uuid(),
      occurrenceId: z.uuid(),
      cashMinor: minorOrZero,
      savedMinor: minorOrZero,
    })
    .refine((draft) => draft.cashMinor + draft.savedMinor > 0, "Enter what you handed over."),
  z.strictObject({
    kind: z.literal("record_gift"),
    id: z.uuid(),
    childId: z.uuid(),
    amountMinor: minor,
    jar,
    note: text(DRAFT_LABEL_CHARS),
  }),
  z.strictObject({
    kind: z.literal("change_allowance"),
    id: z.uuid(),
    childId: z.uuid(),
    scheduleId: z.uuid(),
    amountMinor: minor,
    frequency: z.enum(frequencies),
    nextOn: isoDate,
  }),
  z.strictObject({
    kind: z.literal("decide_request"),
    id: z.uuid(),
    childId: z.uuid(),
    requestId: z.uuid(),
    request: requestKind,
    amountMinor: minor,
    approve: z.boolean(),
  }),
]);
export type ActionDraft = z.infer<typeof actionDraftSchema>;

export const confirmActionDraftSchema = z.object({ draft: actionDraftSchema });

// ---------------------------------------------------------------------------
// From the model's fields to a draft
// ---------------------------------------------------------------------------

function readJar(value: string | null | undefined): "spend" | "save" | null {
  const word = value?.toLowerCase() ?? "";
  if (/\bsave\b|\bsaving/.test(word)) return "save";
  if (/\bspend\b|\bcash\b/.test(word)) return "spend";
  return null;
}

function readRequestKind(
  value: string | null | undefined,
): "withdrawal" | "deposit" | "emergency" | null {
  const word = value?.toLowerCase() ?? "";
  if (/withdraw|take out|out of save/.test(word)) return "withdrawal";
  if (/deposit|put in|into save/.test(word)) return "deposit";
  if (/emergency|extra/.test(word)) return "emergency";
  return null;
}

function readFrequency(value: string | null | undefined): (typeof frequencies)[number] | null {
  const word = value?.toLowerCase() ?? "";
  if (/week/.test(word)) return "weekly";
  if (/quarter|3 months|three months/.test(word)) return "quarterly";
  if (/month/.test(word)) return "monthly";
  if (/year|annual/.test(word)) return "annual";
  return null;
}

function readDecision(value: string | null | undefined): boolean | null {
  const word = value?.toLowerCase().trim() ?? "";
  if (/^(approve|approved|yes|accept|ok|okay|allow)\b/.test(word)) return true;
  if (/^(decline|declined|no|reject|refuse|deny)\b/.test(word)) return false;
  return null;
}

/** A category key from a key or its label ("Snacks"), or Other. */
function readCategory<K extends string>(
  value: string | null | undefined,
  list: readonly { key: K; label: string }[],
): K {
  const word = value?.toLowerCase().trim() ?? "";
  const match = list.find((c) => c.key === word || c.label.toLowerCase() === word);
  return match?.key ?? ("other" as K);
}

function readAmount(value: string | null | undefined, currency: string): number | null {
  if (!present(value)) return null;
  const parsed = parseMoney(value, currency);
  return parsed && parsed <= MAX_AMOUNT_MINOR ? parsed : null;
}

const short = (value: string | null | undefined, max: number): string | null =>
  present(value) ? value.trim().slice(0, max).trim() || null : null;

/** What the server looked up for a parent's draft (and every draft's id and today). */
export type DraftContext = {
  currency: string;
  /** A fresh uuid: the draft's idempotency key, so a double tap records once. */
  id: string;
  /** The family's today, ISO. */
  today: string;
  /** The child a parent's draft is about. */
  childId?: string;
  /** The oldest allowance waiting to be handed over. */
  due?: { id: string; amountMinor: number };
  /** The child's allowance schedule, for a change. */
  schedule?: { id: string; frequency: (typeof frequencies)[number]; nextDueOn: string | null };
  /** The request a parent is deciding, read from the child's own list. */
  request?: { id: string; kind: "withdrawal" | "deposit" | "emergency"; amountMinor: number };
};

export type DraftResult =
  | { ok: true; draft: ActionDraft }
  | { ok: false; missing: string[] }
  | { ok: false; problem: string };

const needs = (...missing: string[]): DraftResult => ({ ok: false, missing });
const problem = (text: string): DraftResult => ({ ok: false, problem: text });

/**
 * The draft for `kind` from the model's fields, parsed in code. Labels and reasons must already
 * be cleaned by the server (`cleanLabel`). A field that can't be read counts as missing, so
 * Jarso asks again instead of guessing.
 */
export function draftFromFields(
  kind: ActionKind,
  fields: ActionFields,
  ctx: DraftContext,
): DraftResult {
  const missing = missingActionFields(kind, fields);
  if (missing.length > 0) return needs(...missing);
  const { currency, id } = ctx;
  const amount = () => readAmount(fields.amount, currency);

  switch (kind) {
    case "money_received": {
      const amountMinor = amount();
      const into = readJar(fields.jar);
      if (!amountMinor) return needs("amount");
      if (!into) return needs("jar");
      return valid({
        kind,
        id,
        amountMinor,
        jar: into,
        category: readCategory(fields.category ?? fields.from, RECEIVED_CATEGORIES),
        label: short(fields.label ?? fields.from, DRAFT_LABEL_CHARS),
      });
    }
    case "purchase": {
      const amountMinor = amount();
      if (!amountMinor) return needs("amount");
      return valid({
        kind,
        id,
        amountMinor,
        category: readCategory(fields.category, SPEND_CATEGORIES),
        label: short(fields.label, DRAFT_LABEL_CHARS),
      });
    }
    case "jar_move": {
      const amountMinor = amount();
      const from = readJar(fields.from);
      if (!amountMinor) return needs("amount");
      if (!from) return needs("from");
      const to = readJar(fields.to) ?? (from === "save" ? "spend" : "save");
      if (to === from) return problem("Money moves between two different jars.");
      return valid({ kind, id, amountMinor, from, to });
    }
    case "savings_request": {
      const amountMinor = amount();
      const request = readRequestKind(fields.request);
      if (!request) return needs("request");
      if (!amountMinor) return needs("amount");
      const reason = short(fields.reason, DRAFT_REASON_CHARS);
      if (request === "emergency" && !reason) return needs("reason");
      return valid({ kind, id, request, amountMinor, reason });
    }
    case "hand_over_allowance": {
      if (!ctx.childId || !ctx.due) return problem("Nothing is waiting to be handed over.");
      const due = ctx.due.amountMinor;
      const cashGiven = present(fields.cash) ? readMinorOrZero(fields.cash, currency) : null;
      const savedGiven = present(fields.saved) ? readMinorOrZero(fields.saved, currency) : null;
      if (present(fields.cash) && cashGiven === null) return needs("split");
      if (present(fields.saved) && savedGiven === null) return needs("split");
      const cashMinor = cashGiven ?? Math.max(0, due - (savedGiven ?? 0));
      const savedMinor = savedGiven ?? Math.max(0, due - cashMinor);
      return valid({
        kind,
        id,
        childId: ctx.childId,
        occurrenceId: ctx.due.id,
        cashMinor,
        savedMinor,
      });
    }
    case "record_gift": {
      const amountMinor = amount();
      const into = readJar(fields.jar);
      if (!ctx.childId) return problem("Pick which child first.");
      if (!amountMinor) return needs("amount");
      if (!into) return needs("jar");
      return valid({
        kind,
        id,
        childId: ctx.childId,
        amountMinor,
        jar: into,
        note: short(fields.label ?? fields.from, DRAFT_LABEL_CHARS),
      });
    }
    case "change_allowance": {
      const amountMinor = amount();
      if (!ctx.childId || !ctx.schedule) {
        return problem("There's no allowance to change yet. Set one up from their page.");
      }
      if (!amountMinor) return needs("amount");
      const frequency = present(fields.frequency)
        ? readFrequency(fields.frequency)
        : ctx.schedule.frequency;
      if (!frequency) return needs("frequency");
      const next = ctx.schedule.nextDueOn;
      return valid({
        kind,
        id,
        childId: ctx.childId,
        scheduleId: ctx.schedule.id,
        amountMinor,
        frequency,
        nextOn: next && next >= ctx.today ? next : ctx.today,
      });
    }
    case "decide_request": {
      const approve = readDecision(fields.decision);
      if (approve === null) return needs("decision");
      if (!ctx.childId || !ctx.request) {
        return problem("That request isn't waiting for a decision. Look at the requests again.");
      }
      return valid({
        kind,
        id,
        childId: ctx.childId,
        requestId: ctx.request.id,
        request: ctx.request.kind,
        amountMinor: ctx.request.amountMinor,
        approve,
      });
    }
  }
}

function readMinorOrZero(value: string, currency: string): number | null {
  const trimmed = value.trim();
  if (/^0+(\.0+)?$/.test(trimmed.replace(/[^\d.]/g, ""))) return 0;
  return readAmount(trimmed, currency);
}

function valid(draft: ActionDraft): DraftResult {
  const parsed = actionDraftSchema.safeParse(draft);
  return parsed.success
    ? { ok: true, draft: parsed.data }
    : problem(parsed.error.issues[0]?.message ?? "Something in that doesn't look right.");
}

// ---------------------------------------------------------------------------
// The real forms' own checks
// ---------------------------------------------------------------------------

/**
 * The first problem the app's own form for this action would find with the draft, or null.
 * The draft is turned into exactly what that form sends and run through the form's schema.
 */
export function formProblem(draft: ActionDraft, currency: string, today: string): string | null {
  const amount = (value: number) => toMajorString(value, currency);
  const key = draft.id;
  const check = (schema: z.ZodType, input: unknown) => {
    const parsed = schema.safeParse(input);
    return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Please check that.");
  };
  switch (draft.kind) {
    case "money_received":
      return check(receivedSchema(currency), {
        amount: amount(draft.amountMinor),
        jar: draft.jar,
        category: draft.category,
        label: draft.label ?? "",
        idempotencyKey: key,
      });
    case "purchase":
      return check(purchaseSchema(currency), {
        amount: amount(draft.amountMinor),
        category: draft.category,
        label: draft.label ?? "",
        idempotencyKey: key,
      });
    case "jar_move":
      return draft.from === "save"
        ? check(withdrawalSchema(currency), {
            amount: amount(draft.amountMinor),
            idempotencyKey: key,
          })
        : check(depositSchema(currency), {
            amount: amount(draft.amountMinor),
            idempotencyKey: key,
          });
    case "savings_request": {
      const input = {
        amount: amount(draft.amountMinor),
        reason: draft.reason ?? "",
        idempotencyKey: key,
      };
      if (draft.request === "withdrawal") return check(withdrawalSchema(currency), input);
      if (draft.request === "emergency") return check(emergencySchema(currency), input);
      return check(depositSchema(currency), { amount: input.amount, idempotencyKey: key });
    }
    case "hand_over_allowance":
      return check(handoverSchema(currency), {
        kind: "allowance",
        id: draft.occurrenceId,
        cash: amount(draft.cashMinor),
        saved: amount(draft.savedMinor),
        idempotencyKey: key,
      });
    case "record_gift":
      return check(giftSchema(currency, today), {
        childId: draft.childId,
        amount: amount(draft.amountMinor),
        giveOn: today,
        note: draft.note ?? "",
        idempotencyKey: key,
      });
    case "change_allowance":
      return check(changeAllowanceSchema(currency, today), {
        scheduleId: draft.scheduleId,
        amount: amount(draft.amountMinor),
        frequency: draft.frequency,
        nextOn: draft.nextOn,
      });
    case "decide_request":
      if (draft.request !== "deposit") {
        return check(decideSchema, { requestId: draft.requestId, approve: draft.approve });
      }
      return draft.approve
        ? check(completeSchema, { requestId: draft.requestId, idempotencyKey: key })
        : check(rejectDepositSchema, { requestId: draft.requestId });
  }
}

// ---------------------------------------------------------------------------
// What the card shows
// ---------------------------------------------------------------------------

/** One line on the card: "Amount" "£5". */
export type DraftLine = { label: string; value: string };

/** A prepared action as the card shows it. */
export type ActionProposal = {
  kind: "action";
  draft: ActionDraft;
  title: string;
  lines: DraftLine[];
};

const JAR_NAMES = { spend: "Spend", save: "Save" } as const;
const HOW_OFTEN: Record<(typeof frequencies)[number], string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
  annual: "Every year",
};
const REQUEST_WORDS = {
  withdrawal: "Take money out of Save",
  deposit: "Put money into Save",
  emergency: "Extra money",
} as const;

function showDate(isoDay: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDay}T00:00:00Z`));
}

/**
 * The card for a draft: a title and every field in plain words, so the user sees exactly what a
 * tap will do. `childName` names the child on a parent's card when it is known.
 */
export function describeDraft(
  draft: ActionDraft,
  currency: string,
  childName?: string | null,
): ActionProposal {
  const money = (value: number) => formatMoney(value, currency, { showMinor: "nonzero" });
  const forChild = childName ? ` for ${childName}` : "";
  const line = (label: string, value: string): DraftLine => ({ label, value });
  const { title, lines } = ((): { title: string; lines: DraftLine[] } => {
    switch (draft.kind) {
      case "money_received":
        return {
          title: "Write down money you got",
          lines: [
            line("Amount", money(draft.amountMinor)),
            line("Into", JAR_NAMES[draft.jar]),
            line("Kind", categoryOf(draft.category, "received").label),
            ...(draft.label ? [line("From", draft.label)] : []),
          ],
        };
      case "purchase":
        return {
          title: "Record something you bought",
          lines: [
            line("Amount", money(draft.amountMinor)),
            ...(draft.label ? [line("What", draft.label)] : []),
            line("Kind", categoryOf(draft.category, "purchase").label),
            line("Paid from", "Spend"),
          ],
        };
      case "jar_move":
        return {
          title: draft.from === "save" ? "Move money out of Save" : "Move money into Save",
          lines: [
            line("Amount", money(draft.amountMinor)),
            line("From", JAR_NAMES[draft.from]),
            line("To", JAR_NAMES[draft.to]),
          ],
        };
      case "savings_request":
        return {
          title:
            draft.request === "emergency"
              ? "Ask for extra money"
              : draft.request === "withdrawal"
                ? "Ask to take money out of Save"
                : "Ask to put money into Save",
          lines: [
            line("Amount", money(draft.amountMinor)),
            ...(draft.reason ? [line("What it's for", draft.reason)] : []),
          ],
        };
      case "hand_over_allowance":
        return {
          title: `Hand over the allowance${forChild}`,
          lines: [
            line("Cash to Spend", money(draft.cashMinor)),
            line("Into Save", money(draft.savedMinor)),
          ],
        };
      case "record_gift":
        return {
          title: `Give a gift now${forChild}`,
          lines: [
            line("Amount", money(draft.amountMinor)),
            line("Into", JAR_NAMES[draft.jar]),
            ...(draft.note ? [line("Note", draft.note)] : []),
          ],
        };
      case "change_allowance":
        return {
          title: `Change the allowance${forChild}`,
          lines: [
            line("Amount", money(draft.amountMinor)),
            line("How often", HOW_OFTEN[draft.frequency]),
            line("Next one on", showDate(draft.nextOn)),
          ],
        };
      case "decide_request":
        return {
          title: draft.approve
            ? `Say yes to a request${forChild}`
            : `Say no to a request${forChild}`,
          lines: [
            line("Request", REQUEST_WORDS[draft.request]),
            line("Amount", money(draft.amountMinor)),
            line("Answer", draft.approve ? "Yes" : "No"),
          ],
        };
    }
  })();
  return { kind: "action", draft, title, lines };
}

/** What happened when the user tapped "Do it", from the action's own result. */
export type ActionOutcome = {
  status: "done" | "waiting" | "declined";
  /** One plain line, from the app: "Done: £5 is written down in Save." */
  text: string;
  /** The child's jars after it, when they could be read. */
  figures: { spend: string; save: string } | null;
};

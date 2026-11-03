import "server-only";
import { randomUUID } from "node:crypto";
import {
  type ActionDraft,
  type ActionOutcome,
  formProblem,
  guideCopy,
  isActionKindFor,
} from "@jarso/core/guide";
import {
  changeAllowance,
  confirmHandover,
  createGift,
  getFamilyContext,
} from "@/features/allowance/server";
import { notEnoughSpendMessage } from "@/features/diary";
import { recordMoneyReceived, recordPurchase } from "@/features/diary/server";
import { assertRole } from "@/features/family/server";
import type { DepositResult, WithdrawalResult } from "@/features/requests";
import {
  completeRequest,
  createDeposit,
  createEmergency,
  createWithdrawal,
  decideWithdrawal,
  getAvailability,
  rejectDeposit,
} from "@/features/requests/server";
import { AppError, formatMoney, logger } from "@/lib";

/**
 * "Jarso does tasks" (demo 3): what happens when the user taps "Do it" on a card Jarso prepared.
 * The draft runs through the same feature service as the app's own form, as the signed-in user,
 * so RLS, the parent-of checks, the parent's jar-move setting and every request flow apply
 * exactly as they would from the form. The draft's id is the idempotency key, so a double tap
 * records once. The outcome line is written here from what the service returned, never by
 * the model.
 */

/** Formats minor units in the family's currency, and knows the currency. */
type Money = ((minor: number) => string) & { currency: string };

const JAR = { spend: "Spend", save: "Save" } as const;
const HOW_OFTEN = {
  weekly: "every week",
  monthly: "every month",
  quarterly: "every 3 months",
  annual: "every year",
} as const;

const done = (text: string) => ({ status: "done" as const, text });
const waiting = (text: string) => ({ status: "waiting" as const, text });
const declined = (text: string) => ({ status: "declined" as const, text });

function withdrawalLine(result: WithdrawalResult, amount: string, money: Money) {
  switch (result.status) {
    case "done":
      return done(`Done: ${amount} moved from Save to Spend.`);
    case "pending":
      return waiting(`Sent: your parent will look at taking ${amount} out of Save.`);
    case "approved":
      return waiting(`Your parent's rules said yes. They'll hand over ${amount} next.`);
    case "already_sent":
      return waiting(guideCopy.action.already);
    case "over_available":
      return declined(
        `That's more than you have free in Save (${money(result.availableMinor)}), so nothing was sent.`,
      );
    case "over_cap":
      return declined(
        `That's over the limit for taking money out (${money(result.capMinor)} a ${result.period === "item" ? "time" : result.period}), so nothing was sent.`,
      );
  }
}

function depositLine(result: DepositResult, amount: string, money: Money) {
  switch (result.status) {
    case "done":
    case "confirmed":
      return done(`Done: ${amount} moved from Spend to Save.`);
    case "pending":
      return waiting(`Sent: your parent will confirm putting ${amount} into Save.`);
    case "already_sent":
      return waiting(guideCopy.action.already);
    case "over_available":
      return declined(
        `That's more than you have free in Spend (${money(result.availableMinor)}), so nothing was sent.`,
      );
  }
}

/** Runs one draft and says what happened. A refusal a form would show is a declined outcome. */
async function run(
  draft: ActionDraft,
  money: Money,
  today: string,
): Promise<Omit<ActionOutcome, "figures">> {
  const amount = "amountMinor" in draft ? money(draft.amountMinor) : "";
  const key = draft.id;
  switch (draft.kind) {
    case "money_received": {
      await recordMoneyReceived({
        amountMinor: draft.amountMinor,
        jar: draft.jar,
        category: draft.category,
        label: draft.label ?? undefined,
        idempotencyKey: key,
      });
      return done(`Done: ${amount} is written down in ${JAR[draft.jar]}.`);
    }
    case "purchase": {
      const result = await recordPurchase({
        amountMinor: draft.amountMinor,
        category: draft.category,
        label: draft.label ?? undefined,
        idempotencyKey: key,
      });
      if (result.status === "not_enough_spend") {
        return declined(notEnoughSpendMessage(result.freeMinor, money.currency));
      }
      return done(`Done: ${amount}${draft.label ? ` for ${draft.label}` : ""} is in your diary.`);
    }
    case "jar_move":
      return draft.from === "save"
        ? withdrawalLine(
            await createWithdrawal({ amountMinor: draft.amountMinor, idempotencyKey: key }),
            amount,
            money,
          )
        : depositLine(
            await createDeposit({ amountMinor: draft.amountMinor, idempotencyKey: key }),
            amount,
            money,
          );
    case "savings_request": {
      if (draft.request === "withdrawal") {
        return withdrawalLine(
          await createWithdrawal({
            amountMinor: draft.amountMinor,
            reason: draft.reason ?? undefined,
            idempotencyKey: key,
          }),
          amount,
          money,
        );
      }
      if (draft.request === "deposit") {
        return depositLine(
          await createDeposit({ amountMinor: draft.amountMinor, idempotencyKey: key }),
          amount,
          money,
        );
      }
      const result = await createEmergency({
        amountMinor: draft.amountMinor,
        reason: draft.reason ?? "",
        idempotencyKey: key,
      });
      return result.status === "already_sent"
        ? waiting(guideCopy.action.already)
        : waiting(`Sent: your parent will see your ask for ${amount}.`);
    }
    case "hand_over_allowance": {
      await confirmHandover({
        kind: "allowance",
        id: draft.occurrenceId,
        cashMinor: draft.cashMinor,
        savedMinor: draft.savedMinor,
        idempotencyKey: key,
      });
      return done(
        `Done: handed over. ${money(draft.cashMinor)} to Spend and ${money(draft.savedMinor)} to Save.`,
      );
    }
    case "record_gift": {
      // A gift for today, then its hand-over: the gift's key makes a second tap find the same
      // gift, and a second hand-over of it is "already confirmed".
      const giftId = await createGift({
        childId: draft.childId,
        amountMinor: draft.amountMinor,
        giveOn: today,
        note: draft.note,
        idempotencyKey: key,
      });
      await confirmHandover({
        kind: "gift",
        id: giftId,
        cashMinor: draft.jar === "spend" ? draft.amountMinor : 0,
        savedMinor: draft.jar === "save" ? draft.amountMinor : 0,
        idempotencyKey: randomUUID(),
      });
      return done(`Done: the ${amount} gift is in ${JAR[draft.jar]}.`);
    }
    case "change_allowance": {
      await changeAllowance({
        scheduleId: draft.scheduleId,
        amountMinor: draft.amountMinor,
        frequency: draft.frequency,
        nextOn: draft.nextOn,
      });
      return done(`Done: the allowance is now ${amount} ${HOW_OFTEN[draft.frequency]}.`);
    }
    case "decide_request": {
      if (draft.request === "deposit") {
        if (draft.approve) {
          await completeRequest({ requestId: draft.requestId, idempotencyKey: key });
          return done(`Done: you confirmed it. ${amount} is in Save.`);
        }
        const result = await rejectDeposit({ requestId: draft.requestId });
        return result === "already_decided"
          ? declined("Someone already decided this one.")
          : done("Done: you said no.");
      }
      const result = await decideWithdrawal({ requestId: draft.requestId, approve: draft.approve });
      switch (result) {
        case "approved":
          return done(`Done: you said yes. Hand over ${amount} next, from their page.`);
        case "rejected":
          return done("Done: you said no.");
        case "already_decided":
          return declined("Someone already decided this one.");
        case "over_available":
          return declined("They don't have that much free in Save any more, so nothing changed.");
      }
    }
  }
}

/**
 * The user tapped "Do it". Children may run only children's kinds and parents only parents';
 * each service checks the rest (whose child, which request). An AppError a form would show
 * (a stopped allowance, a gift already handed over) reaches the card as its safe message.
 */
export async function confirmActionDraft(draft: ActionDraft): Promise<ActionOutcome> {
  const parentKind = isActionKindFor(draft.kind, "parent");
  const { user } = await assertRole(parentKind ? "parent" : "child");
  const { currency, today } = await getFamilyContext();
  // Checked again against the app's own form: the draft came back from the browser.
  const refused = formProblem(draft, currency, today);
  if (refused) throw new AppError("VALIDATION", refused);

  const money = Object.assign(
    (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" }),
    { currency },
  );
  const outcome = await run(draft, money, today);
  // Kind and status only: never amounts, labels or reasons.
  logger.info("Guide action confirmed", { kind: draft.kind, status: outcome.status });

  // The child's jars after it, read fresh. Optional: the outcome stands without them.
  const childId = "childId" in draft ? draft.childId : user.id;
  const figures = await getAvailability(childId).then(
    (jars) => ({
      spend: money(jars.availableSpendMinor),
      save: money(jars.availableSaveMinor),
    }),
    () => null,
  );
  return { ...outcome, figures };
}

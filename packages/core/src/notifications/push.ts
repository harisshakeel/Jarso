// What a push carries and how a claimed batch becomes pushes. Pure, shared by the web dispatcher
// (which sends) and the phone (which parses the payload on a tap).
import { summaryPushCopy } from "./copy";
import { type NoticeTarget, noticeTarget } from "./links";
import type { NoticeRole } from "./text";
import type { ClaimedNotice, DevicePushPrefs, NoticeKind, PushGroup } from "./types";

/**
 * The `data` of a phone push. `notice`: one notice, opened at its target and marked read on tap.
 * `summary`: a child's notices held overnight, opened in Updates and left unread.
 */
export type PushData =
  | {
      kind: "notice";
      noticeId: string;
      recipientId: string;
      role: NoticeRole;
      target: NoticeTarget;
    }
  | { kind: "summary"; recipientId: string; role: "child"; count: number };

/** One push to send: a notice as itself, or a summary of one child's overnight notices. */
export type PushPlan =
  | { kind: "notice"; claimed: ClaimedNotice }
  | { kind: "summary"; recipientId: string; currency: string; notices: ClaimedNotice[] };

export function pushData(claimed: ClaimedNotice): PushData {
  return {
    kind: "notice",
    noticeId: claimed.notice.id,
    recipientId: claimed.recipientId,
    role: claimed.role,
    target: noticeTarget(claimed.notice, claimed.role),
  };
}

export function summaryPushData(recipientId: string, count: number): PushData {
  return { kind: "summary", recipientId, role: "child", count };
}

export function summaryPushText(count: number): { title: string; detail: string } {
  return { title: summaryPushCopy.title(count), detail: summaryPushCopy.detail };
}

/**
 * Turns a claimed batch into pushes. Two or more overnight notices for one recipient become one
 * summary (where the first of them was); a single overnight notice and every other notice is
 * pushed as itself. Order is otherwise kept.
 */
export function planPushes(batch: ClaimedNotice[]): PushPlan[] {
  const overnight = new Map<string, ClaimedNotice[]>();
  for (const claimed of batch) {
    if (!claimed.overnight) continue;
    const list = overnight.get(claimed.recipientId);
    if (list) list.push(claimed);
    else overnight.set(claimed.recipientId, [claimed]);
  }

  const plans: PushPlan[] = [];
  const summarised = new Set<string>();
  for (const claimed of batch) {
    const group = claimed.overnight ? overnight.get(claimed.recipientId) : undefined;
    if (!group || group.length < 2) {
      plans.push({ kind: "notice", claimed });
      continue;
    }
    if (summarised.has(claimed.recipientId)) continue;
    summarised.add(claimed.recipientId);
    plans.push({
      kind: "summary",
      recipientId: claimed.recipientId,
      currency: claimed.currency,
      notices: group,
    });
  }
  return plans;
}

/**
 * The settings group a notice kind belongs to. Exhaustive: a new kind fails typecheck until it
 * is placed.
 */
export function noticeGroup(kind: NoticeKind): PushGroup {
  switch (kind) {
    case "limit_exceeded":
    case "withdrawal_requested":
    case "withdrawal_decided":
    case "deposit_requested":
    case "deposit_decided":
    case "emergency_requested":
    case "emergency_decided":
      return "requests";
    case "allowance_due":
    case "handover_reminder":
    case "card_charge_failed":
    case "money_received":
    case "entry_corrected":
    case "jar_moved":
      return "money";
    case "guide_noticed":
      return "learning";
    case "parent_note":
      return "notes";
    default: {
      const unplaced: never = kind;
      return unplaced;
    }
  }
}

/**
 * What one phone gets of a plan under its own settings: nothing while paused or for a muted
 * group; a summary keeps only its unmuted notices (one left is pushed as itself).
 */
export function planForDevice(plan: PushPlan, prefs: DevicePushPrefs): PushPlan | null {
  if (prefs.paused) return null;
  const muted = (claimed: ClaimedNotice) =>
    prefs.mutedGroups.includes(noticeGroup(claimed.notice.kind));
  if (plan.kind === "notice") return muted(plan.claimed) ? null : plan;

  const kept = plan.notices.filter((claimed) => !muted(claimed));
  if (kept.length === plan.notices.length) return plan;
  const [only] = kept;
  if (!only) return null;
  if (kept.length === 1) return { kind: "notice", claimed: only };
  return { ...plan, notices: kept };
}

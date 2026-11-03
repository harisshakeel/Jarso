// What a push carries and how a claimed batch becomes pushes. Pure, shared by the web dispatcher
// (which sends) and the phone (which parses the payload on a tap).
import { summaryPushCopy } from "./copy";
import { type NoticeTarget, noticeTarget } from "./links";
import type { NoticeRole } from "./text";
import type { ClaimedNotice } from "./types";

/**
 * The `data` of a phone push. `notice`: one notice, opened at its target and marked read on tap.
 * `summary`: a child's notices held overnight, opened in News and left unread.
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

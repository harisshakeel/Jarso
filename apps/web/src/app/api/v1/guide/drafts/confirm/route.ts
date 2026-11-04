import { assertRole } from "@/features/family/server";
import { confirmActionDraftSchema, isActionKindFor } from "@/features/guide";
import { confirmActionDraft } from "@/features/guide/server";
import { pushAfterNotices } from "@/features/notifications/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: the user tapped "Do it" on a draft Jarso offered, as the web's
 * `confirmActionDraftAction`. Drafts are not stored, so the draft is the body (its `id` is the
 * idempotency key). Children may run only children's kinds and parents only parents'; the role is
 * checked here before anything runs, and again by the service.
 */
export const POST = withApi(
  async (request: Request) => {
    const { draft } = await parseBody(request, confirmActionDraftSchema);
    await assertRole(isActionKindFor(draft.kind, "parent") ? "parent" : "child");
    const outcome = await confirmActionDraft(draft);
    pushAfterNotices();
    return json(outcome);
  },
  { bearer: true },
);

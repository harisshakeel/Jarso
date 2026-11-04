import { removeChildSchema } from "@/features/family";
import { assertRole, removeChild } from "@/features/family/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: a parent removes a child, as the web's `removeChildAction` (ADR 0007). Needs the
 * admin client (sign-out and identity delete). No parent-of check here: remove_child authorises
 * in the database, so a retry after a half removal still succeeds.
 */
export const DELETE = withApi(
  async (_request: Request, ctx: RouteContext<"/api/v1/children/[childId]">) => {
    await assertRole("parent");
    const input = removeChildSchema.parse(await ctx.params);
    await removeChild(input);
    return json({ ok: true });
  },
  { bearer: true },
);

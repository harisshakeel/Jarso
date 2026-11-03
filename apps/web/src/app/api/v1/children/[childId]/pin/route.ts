import { z } from "zod";
import { setChildPinSchema } from "@/features/family";
import { assertRole, setChildPin } from "@/features/family/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: a parent resets a child's PIN, as the web's `setChildPinAction`. Needs the admin
 * client (every device of the child is signed out). The child is the path's, never the body's;
 * the service checks the parent is theirs.
 */
export const PATCH = withApi(
  async (request: Request, ctx: RouteContext<"/api/v1/children/[childId]/pin">) => {
    await assertRole("parent");
    const body = await parseBody(request, z.record(z.string(), z.unknown()));
    const input = setChildPinSchema.parse({ ...body, childId: (await ctx.params).childId });
    await setChildPin(input);
    return json({ ok: true });
  },
  { bearer: true },
);

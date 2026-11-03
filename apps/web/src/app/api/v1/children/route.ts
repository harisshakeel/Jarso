import { addChildSchema } from "@/features/family";
import { addChild, assertRole, withNicknameConflict } from "@/features/family/server";
import { AppError } from "@/lib";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: a parent adds a child to their own family, as the web's `addChildAction`. Needs
 * the admin client (the child's auth user), so it is not a direct call. The family is always the
 * parent's own membership, never one from the body.
 */
export const POST = withApi(
  async (request: Request) => {
    const { membership } = await assertRole("parent");
    if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");
    const body = await parseBody(request, addChildSchema);
    const child = await withNicknameConflict(addChild({ ...body, familyId: membership.familyId }));
    return json(child, { status: 201 });
  },
  { bearer: true },
);

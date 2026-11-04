import { z } from "zod";
import { acceptInvitationSchema } from "@/features/family";
import { assertRole, findInvitation, INVITATION_GONE } from "@/features/family/server";
import { AppError } from "@/lib";
import { json, parseBody, withApi } from "@/lib/api";

const bodySchema = z.object({ invite: acceptInvitationSchema.shape.invite });

/**
 * For the phone: the child's nickname behind a pasted link or code, before the parent accepts.
 * find_invitation is service-role only; the service rate-limits (10 an hour per parent). Only
 * the nickname comes back: the invitation's id stays on the server.
 */
export const POST = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const { invite } = await parseBody(request, bodySchema);
    const invitation = await findInvitation(invite);
    if (!invitation) throw new AppError("NOT_FOUND", INVITATION_GONE);
    return json({ nickname: invitation.nickname });
  },
  { bearer: true },
);

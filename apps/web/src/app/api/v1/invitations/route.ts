import { acceptInvitationSchema, acceptListedInvitationSchema } from "@/features/family";
import {
  acceptInvitation,
  acceptListedInvitation,
  assertRole,
  withNicknameConflict,
} from "@/features/family/server";
import { json, parseBody, withApi } from "@/lib/api";

const bodySchema = acceptInvitationSchema.or(acceptListedInvitationSchema);

/**
 * For the phone: a parent accepts a child's invitation, by pasted link or code (`invite`) or from
 * their own list (`invitationId`), as the web's accept actions. Needs the admin client.
 */
export const POST = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const input = await parseBody(request, bodySchema);
    const child = await withNicknameConflict(
      "invite" in input ? acceptInvitation(input) : acceptListedInvitation(input),
    );
    return json(child);
  },
  { bearer: true },
);

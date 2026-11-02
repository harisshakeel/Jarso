import { assertUser } from "@/features/auth/server";
import { updateProfileSchema } from "@/features/profiles";
import { getProfile, updateProfile } from "@/features/profiles/server";
import { json, parseBody, withApi } from "@/lib/api";

export const GET = withApi(async () => {
  const user = await assertUser();
  return json(await getProfile(user.id));
});

export const PATCH = withApi(async (request: Request) => {
  const user = await assertUser();
  const input = await parseBody(request, updateProfileSchema);
  return json(await updateProfile(user.id, input));
});

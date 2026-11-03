import { assertRole } from "@/features/family/server";
import { getGuideState } from "@/features/guide/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: whether the signed-in child sees Jarso, and whether the intro comes first
 * (`{ available, introNeeded }`). Needs the server's guide switch, so it is not a direct read.
 */
export const GET = withApi(
  // The request must be the first argument: `bearer` reads its Authorization header.
  async (_request: Request) => {
    const { user } = await assertRole("child");
    return json(await getGuideState(user.id));
  },
  { bearer: true },
);

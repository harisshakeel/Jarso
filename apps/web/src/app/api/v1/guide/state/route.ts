import { assertRole, currentRole } from "@/features/family/server";
import { getGuideState, getParentGuideState } from "@/features/guide/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";

/**
 * For the phone, which cannot read the server's guide switch. A child gets whether they see
 * Jarso and whether the intro comes first (`{ available, introNeeded }`); a parent gets the
 * switch and which of their children have Jarso on (`{ configured, enabledChildIds }`).
 */
export const GET = withApi(
  // The request must be the first argument: `bearer` reads its Authorization header.
  async (_request: Request) => {
    const role = await currentRole();
    if (role === null) throw new AppError("UNAUTHORIZED", "You must be signed in");
    if (role === "parent") {
      await assertRole("parent");
      return json(await getParentGuideState());
    }
    const { user } = await assertRole("child");
    return json(await getGuideState(user.id));
  },
  { bearer: true },
);

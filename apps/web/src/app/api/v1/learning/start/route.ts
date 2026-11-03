import { startMissionSchema } from "@/features/learning";
import { startMission } from "@/features/learning/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: starts a mission or resumes its open attempt, as the web's `startMissionAction`.
 * The service checks the mission exists and is unlocked, which the database cannot.
 */
export const POST = withApi(
  async (request: Request) => {
    const { missionKey } = await parseBody(request, startMissionSchema);
    return json(await startMission(missionKey));
  },
  { bearer: true },
);

import type { StepResult } from "@jarso/core/learning";
import { buildJourney, canOpenMission } from "@jarso/core/learning";
import { findMission, missions } from "@jarso/core/learning/content";
import * as repo from "./repository";

export type MissionSession = {
  attemptId: string | null;
  results: StepResult[];
};

/**
 * For the mission screen: the open attempt (of the current content version) and its results, or
 * nothing yet. Null when the mission is unknown or locked. Whether a mission is open depends on
 * the child's attempts only, so `now` and `timezone` change nothing here.
 */
export async function getMissionSession(
  db: repo.Client,
  childId: string,
  missionKey: string,
  opts: { now?: Date; timezone?: string } = {},
): Promise<MissionSession | null> {
  const mission = findMission(missionKey);
  if (!mission) return null;
  const attempts = await repo.listAttempts(db, childId);
  const journey = buildJourney(missions, attempts, opts.timezone ?? "UTC");
  if (!canOpenMission(journey, missionKey)) return null;
  const open = attempts.find(
    (a) =>
      a.missionKey === missionKey && a.status === "started" && a.contentVersion === mission.version,
  );
  if (!open) return { attemptId: null, results: [] };
  const results = await repo.listStepResults(db, [open.id]);
  return { attemptId: open.id, results: results.get(open.id) ?? [] };
}

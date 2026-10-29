"use server";

import { refresh } from "next/cache";
import { createAction } from "@/lib";
import {
  completeCheckInSchema,
  completeMissionSchema,
  recordPracticeSchema,
  recordStepSchema,
  startMissionSchema,
} from "../schemas";
import {
  completeCheckIn,
  completeMission,
  recordPractice,
  recordStep,
  startMission,
} from "./service";

/**
 * The mission player calls these with plain objects. Recording a step does not refresh the route:
 * the player holds its own state, and refreshing mid-mission would only cost a round trip.
 * Finishing a mission, practice or the check-in refreshes so Learn and Home show the change.
 */

export const startMissionAction = createAction(startMissionSchema, ({ missionKey }) =>
  startMission(missionKey),
);

export const recordStepAction = createAction(recordStepSchema, (input) => recordStep(input));

export const completeMissionAction = createAction(completeMissionSchema, async ({ attemptId }) => {
  const summary = await completeMission(attemptId);
  refresh();
  return summary;
});

export const recordPracticeAction = createAction(recordPracticeSchema, async (input) => {
  const result = await recordPractice(input);
  return result;
});

export const completeCheckInAction = createAction(completeCheckInSchema, async ({ answers }) => {
  const result = await completeCheckIn(answers);
  refresh();
  return result;
});

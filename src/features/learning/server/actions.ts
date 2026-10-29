"use server";

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
 * The mission player calls these with plain objects and keeps its own state, so none of them
 * refreshes the route: a refresh would re-render the page under the player (the check-in page
 * swaps to "done" and hides the result). Learn and Home are request-time pages, so they show the
 * change on the next visit.
 */

export const startMissionAction = createAction(startMissionSchema, ({ missionKey }) =>
  startMission(missionKey),
);

export const recordStepAction = createAction(recordStepSchema, (input) => recordStep(input));

export const completeMissionAction = createAction(completeMissionSchema, ({ attemptId }) =>
  completeMission(attemptId),
);

export const recordPracticeAction = createAction(recordPracticeSchema, recordPractice);

export const completeCheckInAction = createAction(completeCheckInSchema, ({ answers }) =>
  completeCheckIn(answers),
);

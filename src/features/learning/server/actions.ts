"use server";

import { createAction } from "@/lib";
import { startMissionSchema } from "../schemas";
import { startMission } from "./service";

/**
 * Starting a mission needs the server (it creates the attempt), so it stays an online action.
 * Step, practice, check-in and completion results go through the device outbox
 * (`POST /api/v1/outbox`). It doesn't refresh the route: the player keeps its own state.
 */
export const startMissionAction = createAction(startMissionSchema, ({ missionKey }) =>
  startMission(missionKey),
);

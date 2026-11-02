// Server-only API of the goals feature. Never import from Client Components.
import "server-only";

export { archiveGoal, getGoalView, markCelebrated, saveGoal } from "./service";

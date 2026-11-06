/** Whether the intro shows now: wait for what is still loading, never block on a failure. */
export type OnboardingGate = "wait" | "show" | "skip";

/**
 * The intro shows once per child, on whichever device comes first: while the child's tour row
 * (`child_tours.finished_at`, shared with the web tour) is unfinished. `localDone` is the phone's
 * cached "done" (null while it is read), so a returning child needs no network read. A tour that
 * can't be read skips the intro for this run.
 */
export function onboardingGate(input: {
  localDone: boolean | null;
  tour: { finishedAt: string | null } | "loading" | "error";
}): OnboardingGate {
  const { localDone, tour } = input;
  if (localDone === null) return "wait";
  if (localDone) return "skip";
  if (tour === "loading") return "wait";
  if (tour === "error") return "skip";
  return tour.finishedAt ? "skip" : "show";
}

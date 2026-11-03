import type { ReactNode } from "react";
import { StepHelp, useGuideState } from "@/features/guide";

/** Helpers beside each step: the guide's "Help me" / "Why?" once the guide is on. */
export function useStepAside(): ReactNode | undefined {
  const guide = useGuideState();
  return guide.data?.available === true ? <StepHelp /> : undefined;
}

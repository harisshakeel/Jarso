import type { z } from "zod";
import type {
  answerableStepSchema,
  checkInSchema,
  missionSchema,
  stepAnswerSchema,
  stepSchema,
  topicSchema,
} from "./schemas";
import type { MissionTopic, SkillKey, SkillLevel } from "./skills";

export type Mission = z.infer<typeof missionSchema>;
export type Step = z.infer<typeof stepSchema>;
export type AnswerableStep = z.infer<typeof answerableStepSchema>;
/** `Omit` that keeps a union's members apart, so narrowing on `type` still works. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A step without its key and replay: what the player shows and grades. */
export type StepBody = DistributiveOmit<AnswerableStep, "key" | "replay">;
export type InfoStep = Extract<Step, { type: "info" }>;
export type Topic = z.infer<typeof topicSchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type StepAnswer = z.infer<typeof stepAnswerSchema>;
export type Phase = "main" | "replay";

export type Grade = { correct: boolean; feedback: string };

/** One recorded step result, as the player needs it to resume. */
export type StepResult = {
  stepKey: string;
  phase: Phase;
  correct: boolean;
  hintsUsed: number;
  tries: number;
};

export type MissionAttempt = {
  id: string;
  missionKey: string;
  status: "started" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  results: StepResult[];
};

export type SkillProgress = {
  skillKey: SkillKey;
  level: SkillLevel;
  firstTryCorrect: number;
  correctWithHints: number;
  reasonsCorrect: number;
  reviewsPassed: number;
  /** When the row last changed; a level only ever goes up, so this dates the last step up. */
  updatedAt?: string;
};

export type ReviewItem = { skillKey: SkillKey; box: number; dueOn: string };

export type CheckInResult = { completedAt: string; correctCount: number };

export type MissionStatus = "done" | "current" | "locked";

export type JourneyMission = {
  key: string;
  day: number;
  title: string;
  topic: MissionTopic;
  summary: string;
  status: MissionStatus;
  /** An attempt is open: the child can pick up where they left off. */
  inProgress: boolean;
  completedOn: string | null;
};

/** The next thing to do, in FR12 order. */
export type NextStep =
  | { kind: "resume"; missionKey: string; title: string }
  | { kind: "check-in" }
  | { kind: "practice"; count: number }
  /** FR12: back after a few days away, one small question eases the child in. */
  | { kind: "comeback" }
  | { kind: "mission"; missionKey: string; title: string; day: number }
  | { kind: "done" };

/** Everything the child's Learn page and the parent's learning page show. */
export type LearningOverview = {
  journey: JourneyMission[];
  skills: SkillProgress[];
  checkIn: CheckInResult | null;
  practiceDue: number;
  daysThisWeek: number;
  /** The family-local day of the most recent learning, or null before any. */
  lastLearnedOn: string | null;
  nextStep: NextStep;
  /** Completed attempts, newest first, with their first-try and hint counts. */
  completed: {
    attemptId: string;
    missionKey: string;
    title: string;
    completedOn: string;
    firstTry: number;
    answerable: number;
    hints: number;
  }[];
};

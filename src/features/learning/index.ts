// Public, client-safe API of the learning feature. Server-only API: "@/features/learning/server".
// Content (missions, topics, reviews) is NOT exported here: it is parsed on the server
// (./content) and passed to the player as props, so it never ships in a shared bundle.
export * from "./components/current-step";
export * from "./components/learning-summary";
export * from "./components/mission-player";
export * from "./components/next-step-card";
export * from "./components/path-map";
export * from "./components/skill-list";
export * from "./components/topic-view";
export * from "./grade";
export * from "./journey";
export * from "./schemas";
export {
  type MissionTopic,
  type Skill,
  type SkillKey,
  type SkillLevel,
  skillKeys,
  skillLevelLabels,
  skills,
  type TopicKey,
  topicKeys,
  topicTitles,
} from "./skills";
export * from "./steps";
export * from "./text";
export type * from "./types";

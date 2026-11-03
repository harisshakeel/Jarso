import type { Href } from "expo-router";

export type Role = "child" | "parent";

/** Each role's home. Group-qualified: `/` exists in both groups. */
export function homeFor(role: Role): Href {
  return role === "parent" ? "/(parent)/(tabs)" : "/(child)/(tabs)";
}

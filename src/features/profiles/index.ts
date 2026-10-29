// Public, client-safe API of the profiles feature. Server-only API: "@/features/profiles/server".
export * from "./age";
export * from "./components/display-name-form";
export * from "./components/parent-details-form";
export * from "./components/profile-card";
export * from "./components/profile-completion-dialog";
export * from "./schemas";
export { completeParentProfileAction, updateProfileAction } from "./server/actions";
export type * from "./types";

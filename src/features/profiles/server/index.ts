// Server-only API of the profiles feature. Never import from Client Components.
import "server-only";

export { getProfile, updateProfile } from "./service";

// Server-only API of the dashboard feature. Never import from Client Components.
import "server-only";

export { type FamilyDashboard, getFamilyDashboard } from "./service";

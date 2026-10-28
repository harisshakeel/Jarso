// Server-only API of the family feature (services + DAL). Never import from Client Components.
import "server-only";

export { getClientIp } from "./client-ip";
export { assertParentOf, assertRole, getMembership, requireRole } from "./dal";
export {
  acceptInvitation,
  addChild,
  childSignIn,
  createFamily,
  findInvitation,
  getFamily,
  INVITATION_GONE,
  listChildren,
  setChildPin,
  startChildOnboarding,
} from "./service";

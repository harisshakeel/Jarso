// Server-only API of the family feature (services + DAL). Never import from Client Components.
import "server-only";

export { getClientIp } from "./client-ip";
export {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  currentRole,
  getMembership,
  requireRole,
} from "./dal";
export {
  acceptInvitation,
  acceptListedInvitation,
  addChild,
  childSignIn,
  createFamily,
  findInvitation,
  findMyInvitation,
  getChildNickname,
  getFamily,
  INVITATION_GONE,
  listChildren,
  listMyInvitations,
  removeChild,
  renameChild,
  setChildPin,
  startChildOnboarding,
  updateFamilySettings,
} from "./service";

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
  advanceFamilyClock,
  childSignIn,
  createFamily,
  demoClockEnabled,
  findInvitation,
  findMyInvitation,
  getChildNickname,
  getFamily,
  getFamilyNow,
  INVITATION_GONE,
  listChildren,
  listMyInvitations,
  removeChild,
  renameChild,
  setChildPin,
  startChildOnboarding,
  updateFamilySettings,
} from "./service";

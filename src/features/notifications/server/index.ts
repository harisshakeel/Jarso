// Server-only API of the notifications feature. Never import from Client Components.
import "server-only";

export { sendEmail } from "./email";
export { dispatchPush, drainPush, isPushConfigured, pushAfterNotices } from "./push";
export {
  getUnreadCount,
  listNotices,
  listUnreadNotices,
  markRead,
  ownsPushEndpoint,
  subscribePush,
  unsubscribePush,
} from "./service";

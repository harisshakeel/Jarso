// Server-only API of the profiles feature. Never import from Client Components.
import "server-only";

export {
  completeParentProfile,
  getParentDetails,
  getProfile,
  isParentProfileComplete,
  updateProfile,
} from "./service";

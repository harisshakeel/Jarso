import "server-only";

// Profile reads and writes are shared with the phone (`@jarso/data/profiles`).
export {
  findParentDetails,
  findProfileById,
  updateProfileById,
  upsertParentDetails,
} from "@jarso/data/profiles";

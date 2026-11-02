// Server-only API of the diary feature. Never import from Client Components.
import "server-only";

export {
  correctDiaryEntry,
  listEntryVersions,
  recordMoneyReceived,
  recordPurchase,
  undoDiaryEntry,
} from "./service";

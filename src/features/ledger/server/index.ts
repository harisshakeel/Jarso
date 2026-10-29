// Server-only API of the ledger feature. Never import from Client Components.
import "server-only";

export { getHistory, getHistoryPage, getJars, type HistoryPage } from "./service";

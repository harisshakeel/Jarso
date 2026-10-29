// Server-only API of the diary feature. Never import from Client Components.
import "server-only";

export { recordPurchase, undoPurchase } from "./service";

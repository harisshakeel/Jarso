// Public, client-safe API of the offline feature. Nothing here is server-only.
export {
  type OutboxItem,
  type OutboxKind,
  type OutboxPlatform,
  type OutboxStore,
  offlineCopy,
  type SendOutcome,
  type SubmitResult,
  showsAsPending,
  /** A random uuid for a client-minted key; works where `crypto.randomUUID` is missing. */
  uuid as newId,
} from "@jarso/core/offline";
export * from "./components/offline-banner";
export * from "./components/outbox-sync";
export * from "./online-action";
export { flushOutbox, sendToServer, submitToOutbox, webOutboxPlatform } from "./outbox/platform";
export { removeOutboxItem } from "./outbox/store";
export { useOutbox } from "./outbox/use-outbox";
export {
  onNetworkSuccess,
  reportNetworkFailure,
  reportNetworkSuccess,
  useOnline,
} from "./use-online";

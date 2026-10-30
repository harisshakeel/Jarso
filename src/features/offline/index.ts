// Public, client-safe API of the offline feature. Nothing here is server-only.
export * from "./components/offline-banner";
export * from "./components/outbox-sync";
export * from "./copy";
export * from "./online-action";
export { flushOutbox } from "./outbox/flush";
export { sendToServer } from "./outbox/send";
export { showsAsPending } from "./outbox/state";
export { removeOutboxItem } from "./outbox/store";
export { submitToOutbox } from "./outbox/submit";
export type { OutboxItem, OutboxKind, SendOutcome, SubmitResult } from "./outbox/types";
export { useOutbox } from "./outbox/use-outbox";
/** A random uuid for a client-minted key; works where `crypto.randomUUID` is missing. */
export { uuid as newId } from "./outbox/uuid";
export {
  onNetworkSuccess,
  reportNetworkFailure,
  reportNetworkSuccess,
  useOnline,
} from "./use-online";

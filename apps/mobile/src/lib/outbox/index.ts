// The phone's outbox (core's engine on AsyncStorage). A direct import, not in `@/lib`: it binds
// the Supabase client and AsyncStorage at load.
export {
  flush,
  isOnline,
  onPurchaseSent,
  outboxPlatform,
  removeItem,
  sendItem,
  setOnline,
  submit,
} from "./platform";
export { createOutboxStore, type KeyValueStorage } from "./store";
export { OutboxSync, useOnline, useOutboxItems } from "./sync";

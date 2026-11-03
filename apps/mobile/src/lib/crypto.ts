// Web Crypto for Hermes. Core's outbox (`@jarso/core/offline` uuid) calls the global
// `crypto.randomUUID` / `crypto.getRandomValues`, which Hermes does not provide. expo-crypto
// supplies both natively; install them only where the engine falls short.
import { getRandomValues, randomUUID } from "expo-crypto";

const g = globalThis as { crypto?: Partial<Crypto> };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = randomUUID as Crypto["randomUUID"];
}
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = getRandomValues as Crypto["getRandomValues"];
}

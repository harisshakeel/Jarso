import * as SecureStore from "expo-secure-store";

/** SecureStore warns above ~2 KB per value; a Supabase session is larger, so it is split. */
export const CHUNK_BYTES = 1800;

function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** Splits on whole characters so no chunk exceeds CHUNK_BYTES of UTF-8. */
function split(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of value) {
    const size = utf8Length(char);
    if (bytes + size > CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks;
}

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function storedCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const count = raw === null ? 0 : Number(raw);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/**
 * supabase-js storage over the Keychain / Keystore. A value lives in `<key>.0..n-1`, with the
 * chunk count under `<key>.n`; the count is written last and removed first, so a half-written
 * value reads as missing rather than corrupt.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedCount(key);
    if (count === 0) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    return parts.every((part) => part !== null) ? parts.join("") : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await storedCount(key);
    const chunks = split(value);
    await SecureStore.deleteItemAsync(countKey(key));
    for (const [i, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunk);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    for (let i = chunks.length; i < previous; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
  },

  async removeItem(key: string): Promise<void> {
    const count = await storedCount(key);
    try {
      await SecureStore.deleteItemAsync(countKey(key));
    } finally {
      // Token-bearing chunks go even if the count could not be deleted.
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i));
      }
    }
  },
};

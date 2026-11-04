// The lesson film's voice files (the web's animated mission intros). Each spoken line is one
// small audio file, generated once by `scripts/lesson-voice.py` and served from the web app's
// public folder. The name carries a hash of the words, so a changed line never plays an old
// recording: the file is simply missing and the player falls back to the browser's own voice.

/** FNV-1a, 32 bit, as 8 hex digits. The voice script computes the same hash in Python. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Where line `index` (0-based) of a mission's film is served: /lessons/voice/<key>-<n>-<hash>.mp3 */
export function filmVoicePath(missionKey: string, index: number, line: string): string {
  return `/lessons/voice/${missionKey}-${index + 1}-${textHash(line)}.mp3`;
}

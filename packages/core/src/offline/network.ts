/**
 * Whether a rejection is the browser failing to reach the server: a fetch `TypeError` ("Failed to
 * fetch" in Chrome, "NetworkError…" in Firefox, "Load failed" in Safari, "fetch failed" in Node).
 * Any other throw, a `TypeError` from a bug included, is not a sign of being offline.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("Failed to fetch")) return true;
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

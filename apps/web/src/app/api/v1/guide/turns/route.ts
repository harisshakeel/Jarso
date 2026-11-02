import { askGuideSchema } from "@/features/guide";
import { prepareGuideTurn, streamGuideTurn } from "@/features/guide/server";
import { parseBody, withApi } from "@/lib/api";

// A full Jarso turn (45 s deadline) plus storing it.
export const maxDuration = 60;

/**
 * One message to Jarso from the signed-in child (ADR 0011). Checks (auth, switch, limits) fail
 * as a JSON error before anything streams; then NDJSON: a status line per look-up, then the
 * screened reply. See docs/api.md.
 */
export const POST = withApi(async (request: Request) => {
  const input = await parseBody(request, askGuideSchema);
  return streamGuideTurn(await prepareGuideTurn(input));
});

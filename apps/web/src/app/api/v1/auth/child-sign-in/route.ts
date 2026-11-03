import { childSignInSchema } from "@/features/family";
import { childSignInForTokens, getClientIp } from "@/features/family/server";
import { json, parseBody, withApi } from "@/lib/api";

export const maxDuration = 30;

/** Public: child PIN sign-in for the mobile app. Same checks as the web, tokens instead of cookies. */
export const POST = withApi(async (request: Request) => {
  const input = await parseBody(request, childSignInSchema);
  return json(await childSignInForTokens(input, await getClientIp()));
});

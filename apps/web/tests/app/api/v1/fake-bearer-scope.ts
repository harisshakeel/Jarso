import { AppError } from "@/lib";

/** The token the fake verifier accepts; any other header is a 401. */
export const PHONE_TOKEN = "phone-token";
export const PHONE_HEADERS = { authorization: `Bearer ${PHONE_TOKEN}` };

type User = { id: string; email: string | null };

/**
 * A stand-in for `@/lib/supabase/request-scope` in route tests: `runInBearerScope` sets
 * `scope.user` while the handler runs, so mocked services can read "who the scope says" the way
 * the real `getCurrentUser()` does. Use with
 * `vi.mock("@/lib/supabase/request-scope", () => import("../fake-bearer-scope"))`.
 */
export const scope: { phoneUser: User | null; user: User | null; entered: number } = {
  phoneUser: null,
  user: null,
  entered: 0,
};

export async function runInBearerScope<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const header = request.headers.get("authorization");
  if (header === null) return fn();
  if (header !== `Bearer ${PHONE_TOKEN}` || !scope.phoneUser) {
    throw new AppError("UNAUTHORIZED", "You must be signed in");
  }
  scope.entered += 1;
  scope.user = scope.phoneUser;
  try {
    return await fn();
  } finally {
    scope.user = null;
  }
}

export function currentScope() {
  return undefined;
}

export async function verifyBearer(): Promise<never> {
  throw new Error("not used by route tests");
}

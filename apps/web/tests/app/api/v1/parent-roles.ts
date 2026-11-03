import { nicknameTaken } from "@jarso/core/family";
import { AppError, isAppError } from "@/lib";
import { scope } from "./fake-bearer-scope";

export const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
export const PARENT_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
export const FAMILY_ID = "3c2b1a0f-9e8d-4c7b-8a69-5f4e3d2c1b0a";
export const membership = { familyId: FAMILY_ID, role: "parent", status: "approved" };

/** Who the scope's user is: the fixed child id is a child, anyone else a parent. */
export function roleOf(id: string): "child" | "parent" {
  return id === CHILD_ID ? "child" : "parent";
}

/** Set `noFamily` for a parent who has not created a family yet; reset it in `beforeEach`. */
export const family = { noFamily: false };

/**
 * As the real `assertRole`: the scope's user, refused unless they have that role. A parent
 * comes back with `membership` unless `family.noFamily` is set. Use as a mock implementation.
 */
export async function fakeAssertRole(role: string) {
  const user = scope.user;
  if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in");
  if (roleOf(user.id) !== role) throw new AppError("FORBIDDEN", "You can't do that.");
  return { user, membership: role === "parent" && !family.noFamily ? membership : null };
}

/** As the real `currentRole`: null when signed out. */
export async function fakeCurrentRole() {
  return scope.user ? roleOf(scope.user.id) : null;
}

/** As the real `withNicknameConflict` (unit-tested with the family service). */
export async function fakeWithNicknameConflict<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isAppError(error) && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", "Please fix the highlighted fields.", {
        fieldErrors: { nickname: [nicknameTaken] },
      });
    }
    throw error;
  }
}

/** JSON request helper for the phone's routes. */
export function request(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

import type { ErrorCode, FieldErrors } from "./errors";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

/** Initial state for `useActionState`. */
export const idle = null;
export type ActionState<T = void> = ActionResult<T> | null;

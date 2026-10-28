import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, type ErrorCode, type FieldErrors, isAppError } from "./errors";
import { logger } from "./logger";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

/** Initial state for `useActionState`. */
export const idle = null;
export type ActionState<T = void> = ActionResult<T> | null;

function toFailure(error: unknown): ActionResult<never> {
  if (isAppError(error)) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
    };
  }
  logger.error("Unhandled action error", { error });
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  };
}

function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/**
 * Wraps a server action: validates input with Zod, maps AppError → typed result,
 * logs unexpected errors, and lets Next.js control-flow errors (redirect, notFound) through.
 *
 * Accepts either FormData (from `<form action>` / `useActionState`) or a plain object.
 */
export function createAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<T>,
) {
  return async (
    _prev: ActionState<T>,
    payload: FormData | z.input<S>,
  ): Promise<ActionResult<T>> => {
    const raw = payload instanceof FormData ? formDataToObject(payload) : payload;
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return toFailure(
        new AppError("VALIDATION", "Please fix the highlighted fields.", {
          fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors,
        }),
      );
    }

    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      unstable_rethrow(error);
      return toFailure(error);
    }
  };
}

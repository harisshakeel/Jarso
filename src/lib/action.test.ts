import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction } from "./action";
import { AppError } from "./errors";

const schema = z.object({ name: z.string().min(1) });

describe("createAction", () => {
  it("returns data on success", async () => {
    const action = createAction(schema, async ({ name }) => `hi ${name}`);
    const form = new FormData();
    form.set("name", "jarso");
    expect(await action(null, form)).toEqual({ ok: true, data: "hi jarso" });
  });

  it("returns field errors on invalid input", async () => {
    const action = createAction(schema, async () => "unreachable");
    const result = await action(null, { name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.name).toBeDefined();
    }
  });

  it("maps AppError to a typed failure", async () => {
    const action = createAction(schema, async () => {
      throw new AppError("FORBIDDEN", "nope");
    });
    expect(await action(null, { name: "a" })).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "nope", fieldErrors: undefined },
    });
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    const action = createAction(schema, async () => {
      throw new Error("db password leaked in message");
    });
    const result = await action(null, { name: "a" });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

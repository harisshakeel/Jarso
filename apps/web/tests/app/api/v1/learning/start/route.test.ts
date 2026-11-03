// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const ATTEMPT = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

const startMission = vi.fn();
vi.mock("@/features/learning/server", () => ({ startMission }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const { POST } = await import("@/app/api/v1/learning/start/route");

const post = (body: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  POST(
    new Request("http://localhost:3000/api/v1/learning/start", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

let startedAs: string | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  startedAs = null;
  scope.entered = 0;
  scope.phoneUser = { id: CHILD_ID, email: null };
  // The real startMission finds the child through assertRole("child") → getCurrentUser().
  startMission.mockImplementation(async () => {
    startedAs = scope.user?.id ?? null;
    return { attemptId: ATTEMPT, results: [] };
  });
});

describe("POST /api/v1/learning/start", () => {
  it("starts the mission as the bearer's child and returns startMission's result", async () => {
    const res = await post({ missionKey: "first-pocket-money" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { attemptId: ATTEMPT, results: [] } });
    expect(startMission).toHaveBeenCalledWith("first-pocket-money");
    expect(startedAs).toBe(CHILD_ID);
  });

  it("returns 400 for an invalid body", async () => {
    const res = await post({ missionKey: "" });
    expect(res.status).toBe(400);
    expect(startMission).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await post({ missionKey: "first-pocket-money" }, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(startMission).not.toHaveBeenCalled();
  });

  it("passes a locked mission's refusal through", async () => {
    startMission.mockRejectedValue(
      new AppError("FORBIDDEN", "Finish the mission before this one first."),
    );
    const res = await post({ missionKey: "first-pocket-money" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: "FORBIDDEN", message: "Finish the mission before this one first." },
    });
  });
});

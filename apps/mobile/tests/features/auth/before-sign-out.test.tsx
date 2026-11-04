import { registerBeforeSignOut, runBeforeSignOut } from "@/features/auth";
import { logger } from "@/lib";

const unregisters: (() => void)[] = [];
const register = (fn: () => Promise<void>) => unregisters.push(registerBeforeSignOut(fn));

afterEach(() => {
  for (const unregister of unregisters.splice(0)) unregister();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("beforeSignOut hooks", () => {
  it("hung or failing hook does not block sign-out", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const third = jest.fn(async () => undefined);
    register(function hangs() {
      return new Promise<void>(() => undefined);
    });
    register(async function throws() {
      throw new Error("private detail");
    });
    register(third);

    let done = false;
    const running = runBeforeSignOut().then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(4_999);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await running;

    expect(done).toBe(true);
    expect(third).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Before-sign-out hook failed", { hook: "throws" });
    expect(warn).toHaveBeenCalledWith("Before-sign-out hook timed out", { hook: "hangs" });
    // Failures are logged by name only, never with the error.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private detail");
  });

  it("unregister removes the hook", async () => {
    const hook = jest.fn(async () => undefined);
    const unregister = registerBeforeSignOut(hook);
    unregister();

    await runBeforeSignOut();

    expect(hook).not.toHaveBeenCalled();
  });

  it("finishes at once when every hook resolves", async () => {
    const hook = jest.fn(async () => undefined);
    register(hook);

    await runBeforeSignOut();

    expect(hook).toHaveBeenCalledTimes(1);
  });
});

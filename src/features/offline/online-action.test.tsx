import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineCopy } from "./copy";
import { runOnline, useOnlineActionState } from "./online-action";
import { isOnline, reportNetworkFailure, reportNetworkSuccess } from "./use-online";

const ok = { ok: true, data: 1 } as const;

beforeEach(() => reportNetworkSuccess());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runOnline", () => {
  it("does not call the action when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const action = vi.fn().mockResolvedValue(ok);
    const result = await runOnline(action);
    expect(action).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.offline },
    });
  });

  it("passes a result through", async () => {
    expect(await runOnline(async () => ok)).toEqual(ok);
  });

  it("maps a rejection to the offline copy and reports a network failure", async () => {
    const result = await runOnline(() => Promise.reject(new TypeError("fetch failed")));
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.offline },
    });
    expect(isOnline()).toBe(false);
  });

  it.each([
    new TypeError("Failed to fetch"),
    new TypeError("NetworkError when attempting to fetch resource."),
    new TypeError("Load failed"),
  ])("treats a fetch %s as offline", async (error) => {
    expect(await runOnline(() => Promise.reject(error))).toMatchObject({
      error: { message: offlineCopy.offline },
    });
    expect(isOnline()).toBe(false);
  });

  it.each([
    new Error("An unexpected response was received from the server."),
    new TypeError("Cannot read properties of undefined (reading 'id')"),
  ])("does not report offline for %s", async (error) => {
    expect(await runOnline(() => Promise.reject(error))).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.slow },
    });
    expect(isOnline()).toBe(true);
  });

  it("rethrows a Server Action redirect instead of showing the offline copy", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/login;307;",
    });
    await expect(runOnline(() => Promise.reject(redirect))).rejects.toBe(redirect);
    expect(isOnline()).toBe(true);
  });

  it("resolves the slow copy after 15 s", async () => {
    vi.useFakeTimers();
    const pending = runOnline(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.slow },
    });
    expect(isOnline()).toBe(true);
  });

  it('maps "Failed to find Server Action" to the update copy', async () => {
    const result = await runOnline(() =>
      Promise.reject(new Error('Failed to find Server Action "abc"')),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.updated },
    });
    expect(isOnline()).toBe(true);
  });

  it("still calls the action after a reported failure while navigator.onLine is true", async () => {
    reportNetworkFailure();
    const action = vi.fn().mockResolvedValue(ok);
    expect(await runOnline(action)).toEqual(ok);
    expect(action).toHaveBeenCalledOnce();
  });

  it("clears the offline state when that call succeeds", async () => {
    reportNetworkFailure();
    await runOnline(async () => ok);
    expect(isOnline()).toBe(true);
  });

  it("handles a late rejection after the timeout and clears the timer when the action settles", async () => {
    vi.useFakeTimers();
    let rejectLate: (e: Error) => void = () => {};
    const pending = runOnline(
      () =>
        new Promise((_, reject) => {
          rejectLate = reject;
        }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    rejectLate(new Error("late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await runOnline(async () => ok);
    expect(vi.getTimerCount()).toBe(0);
  });
});

function NameForm({ action }: { action: Parameters<typeof useOnlineActionState>[0] }) {
  const [state, , pending, submit] = useOnlineActionState(action);
  return (
    <form onSubmit={submit}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" />
      <input aria-label="PIN" name="pin" type="password" />
      <button type="submit" disabled={pending}>
        Save
      </button>
      {state?.ok === false ? <p>{state.error.message}</p> : null}
    </form>
  );
}

describe("useOnlineActionState", () => {
  it("submit keeps uncontrolled field values after a refused submit", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const action = vi.fn().mockResolvedValue(ok);
    render(<NameForm action={action} />);
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(offlineCopy.offline)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    expect(input).toHaveValue("Sam");
  });

  it("submit sends the form values to the action", async () => {
    const action = vi.fn().mockResolvedValue(ok);
    render(<NameForm action={action} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const payload = action.mock.calls[0]?.[1] as FormData | undefined;
    expect(payload?.get("name")).toBe("Sam");
  });

  it("empties password fields once the server has answered, but not when offline", async () => {
    const refusal = { ok: false, error: { code: "VALIDATION", message: "No match" } } as const;
    const action = vi.fn().mockResolvedValue(refusal);
    render(<NameForm action={action} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("No match")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("PIN")).toHaveValue(""));
    expect(screen.getByLabelText("Name")).toHaveValue("Sam");
  });
});

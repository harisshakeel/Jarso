import { offlineCopy } from "@jarso/core/offline";
import { AppError } from "@/lib";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const getSession = supabase.auth.getSession as jest.Mock;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockReset();
  globalThis.fetch = fetchMock;
});

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

async function caught(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("apiFetch", () => {
  it("prefixes the API URL, sends JSON and unwraps { data }", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: { ok: 1 } }));

    await expect(apiFetch("/api/v1/x", { method: "POST", body: { a: 1 } })).resolves.toEqual({
      ok: 1,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3000/api/v1/x");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("adds the bearer token when auth is on", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt-123" } }, error: null });
    fetchMock.mockResolvedValue(reply(200, { data: null }));

    await apiFetch("/api/v1/x", { method: "POST", auth: true });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer jwt-123");
  });

  it("refuses an auth call with no session, without touching the network", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    const error = await caught(apiFetch("/api/v1/x", { auth: true }));

    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Please sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps { error } to an AppError with the server's code and message", async () => {
    const message = "Too many tries. Ask your parent or wait a little while.";
    fetchMock.mockResolvedValue(reply(429, { error: { code: "RATE_LIMITED", message } }));

    const error = await caught(apiFetch("/api/v1/x"));

    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe(message);
  });

  it("maps a network failure to UNAVAILABLE with the web's offline copy", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const error = await caught(apiFetch("/api/v1/x"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).toBe(offlineCopy.offline);
  });

  it("gives up on a call that never answers (UNAVAILABLE after the 15 s deadline)", async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );

      const pending = caught(apiFetch("/api/v1/x"));
      await jest.advanceTimersByTimeAsync(15_000);
      const error = await pending;

      expect(error.code).toBe("UNAVAILABLE");
      expect(error.message).toBe(offlineCopy.offline);
    } finally {
      jest.useRealTimers();
    }
  });

  it("maps a 503 JA503 reply to UNAVAILABLE", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "JA503", message: "Jarso is taking a while." }), {
        status: 503,
      }),
    );

    const error = await caught(apiFetch("/api/v1/x"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).toBe(offlineCopy.offline);
  });

  it("never shows a server's internal or unreadable error", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(500, { error: { code: "INTERNAL", message: "Internal server error" } }),
    );
    const internal = await caught(apiFetch("/api/v1/x"));
    expect(internal.message).toBe("Something went wrong. Please try again.");

    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    const unreadable = await caught(apiFetch("/api/v1/x"));
    expect(unreadable.code).toBe("INTERNAL");
    expect(unreadable.message).toBe("Something went wrong. Please try again.");
  });
});

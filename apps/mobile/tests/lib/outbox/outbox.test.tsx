import type { OutboxItem } from "@jarso/core/offline";
import { offlineCopy } from "@jarso/core/offline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { PendingPurchases } from "@/features/diary";
import { apiFetch } from "@/lib/api";
import {
  createOutboxStore,
  flush,
  OutboxSync,
  outboxPlatform,
  setOnline,
  submit,
} from "@/lib/outbox";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

const mockAuth = supabase.auth as unknown as {
  getSession: jest.Mock;
  onAuthStateChange: jest.Mock;
};

jest.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } },
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));

const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const payload = { amount: "2.50", category: "snacks", label: "Crisps", idempotencyKey: KEY };

const fetchMock = jest.fn();
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function item(over: Partial<OutboxItem>): OutboxItem {
  return {
    id: "a",
    userId: USER,
    kind: "purchase",
    payload,
    idempotencyKey: "a",
    createdAt: "2026-11-03T10:00:00.000Z",
    attempts: 0,
    nextAttemptAt: "2026-11-03T10:00:00.000Z",
    status: "waiting",
    ...over,
  };
}

async function stored(): Promise<OutboxItem[]> {
  const store = await outboxPlatform.openStore();
  return (await store?.listForUser(USER)) ?? [];
}

let networkListener: (state: { isConnected: boolean; isInternetReachable: boolean }) => void;
let authListener: (event: string) => void;

async function renderSync() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await render(
    <QueryClientProvider client={client}>
      <OutboxSync userId={USER} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setOnline(true);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  mockAuth.onAuthStateChange.mockImplementation((listener: (event: string) => void) => {
    authListener = listener;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  (addNetworkStateListener as jest.Mock).mockImplementation((listener) => {
    networkListener = listener;
    return { remove: jest.fn() };
  });
  (getNetworkStateAsync as jest.Mock).mockReturnValue(new Promise(() => undefined));
  (apiFetch as jest.Mock).mockResolvedValue(undefined);
});

describe("phone outbox", () => {
  it("store keeps items per user oldest first", async () => {
    const memory = new Map<string, string>();
    const store = createOutboxStore({
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => void memory.set(key, value),
      removeItem: async (key) => void memory.delete(key),
      getAllKeys: async () => [...memory.keys()],
    });
    const changes = jest.fn();
    store.subscribe(changes);
    await Promise.all([
      store.put(item({ id: "late", createdAt: "2026-11-03T10:00:02.000Z" })),
      store.put(item({ id: "early", createdAt: "2026-11-03T10:00:01.000Z" })),
      store.put(item({ id: "other", userId: "someone-else" })),
    ]);
    expect((await store.listForUser(USER)).map((i) => i.id)).toEqual(["early", "late"]);
    expect((await store.listForUser("someone-else")).map((i) => i.id)).toEqual(["other"]);
    await store.remove("early");
    expect((await store.listForUser(USER)).map((i) => i.id)).toEqual(["late"]);
    expect(changes).toHaveBeenCalledTimes(4);
  });

  it("withLock never waits", async () => {
    let release: () => void = () => undefined;
    const first = outboxPlatform.withLock(
      "jarso-outbox:x",
      () => new Promise<string>((resolve) => (release = () => resolve("first"))),
    );
    const second = jest.fn(async () => "second");
    await expect(outboxPlatform.withLock("jarso-outbox:x", second)).resolves.toBeNull();
    expect(second).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toBe("first");
    await expect(outboxPlatform.withLock("jarso-outbox:x", second)).resolves.toBe("second");
  });

  it("offline purchase queues then sends on network regain", async () => {
    const { invalidate } = await renderSync();
    await waitFor(() => expect(addNetworkStateListener).toHaveBeenCalled());
    await act(async () => networkListener({ isConnected: false, isInternetReachable: false }));

    const result = await submit({ userId: USER, kind: "purchase", payload, idempotencyKey: KEY });
    expect(result).toEqual({ status: "queued" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await stored()).map((i) => i.id)).toEqual([KEY]);

    fetchMock.mockResolvedValue(reply(200, { data: { status: "recorded", entryId: "e1" } }));
    await act(async () => networkListener({ isConnected: true, isInternetReachable: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3000/api/v1/outbox");
    expect(init.headers.authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toMatchObject({ kind: "purchase", userId: USER, payload });
    await waitFor(async () => expect(await stored()).toEqual([]));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home(USER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history(USER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress(USER) });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/notices/dispatch", {
      method: "POST",
      auth: true,
    });
  });

  it("a replayed lesson step refreshes learning and progress, not the diary", async () => {
    const { invalidate } = await renderSync();
    const store = await outboxPlatform.openStore();
    await store?.put(item({ id: "s1", kind: "step", payload: { attemptId: "a1" } }));
    fetchMock.mockResolvedValue(reply(200, { data: { ok: true } }));
    invalidate.mockClear();
    await act(async () => flush(USER));
    await waitFor(async () => expect(await stored()).toEqual([]));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress(USER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.learning(USER) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: keys.history(USER) });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("401 pauses then sends after refresh", async () => {
    setOnline(false);
    await submit({ userId: USER, kind: "purchase", payload, idempotencyKey: KEY });
    setOnline(true);
    fetchMock.mockResolvedValueOnce(reply(401, { error: { code: "UNAUTHORIZED" } }));
    await renderSync();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Kept exactly as it was: no attempt counted, not refused.
    await waitFor(async () =>
      expect(await stored()).toEqual([expect.objectContaining({ status: "waiting", attempts: 0 })]),
    );

    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "token-2" } } });
    fetchMock.mockResolvedValueOnce(reply(200, { data: { status: "recorded", entryId: "e1" } }));
    await act(async () => authListener("TOKEN_REFRESHED"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer token-2");
    await waitFor(async () => expect(await stored()).toEqual([]));
  });

  it("refused purchase becomes needs_look and shows on Home", async () => {
    const refusal = "You only have £1 in Spend.";
    setOnline(false);
    await submit({ userId: USER, kind: "purchase", payload, idempotencyKey: KEY });
    setOnline(true);
    fetchMock.mockResolvedValue(reply(409, { error: { code: "CONFLICT", message: refusal } }));
    await flush(USER);
    expect(await stored()).toEqual([
      expect.objectContaining({ id: KEY, status: "needs_look", message: refusal }),
    ]);

    await render(<PendingPurchases userId={USER} currency="GBP" />);
    expect(await screen.findByText("Not sent yet")).toBeOnTheScreen();
    expect(screen.getByText(refusal)).toBeOnTheScreen();
    expect(screen.getByText("Crisps")).toBeOnTheScreen();
    expect(screen.getByText("−£2.50")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Change it: Crisps" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove: Crisps" })).toBeOnTheScreen();
  });

  it("shows a waiting purchase with the waiting line while offline", async () => {
    setOnline(false);
    await submit({ userId: USER, kind: "purchase", payload, idempotencyKey: KEY });
    await render(<PendingPurchases userId={USER} currency="GBP" />);
    expect(await screen.findByText(offlineCopy.waiting)).toBeOnTheScreen();
  });

  it("sends without a token header when signed out, and keeps the item", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue(reply(401, {}));
    const result = await submit({ userId: USER, kind: "purchase", payload, idempotencyKey: KEY });
    expect(result).toEqual({ status: "queued" });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
    expect(await stored()).toHaveLength(1);
  });
});

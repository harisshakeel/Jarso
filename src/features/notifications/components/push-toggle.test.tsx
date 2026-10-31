import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  client: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "QUJD" as string | undefined },
}));
const actions = vi.hoisted(() => ({
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
  pushOwnedAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("../server/actions", () => actions);
vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  clientEnv: env.client,
}));

const { PushToggle, keyBytes } = await import("./push-toggle");

type FakeSubscription = {
  endpoint: string;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
};

const subscription: FakeSubscription = {
  endpoint: "https://push.example.test/abc",
  toJSON: () => ({ endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};

const pushManager = {
  getSubscription: vi.fn<() => Promise<FakeSubscription | null>>(async () => null),
  subscribe: vi.fn(async () => subscription),
};
const registration = { pushManager };
const serviceWorker = {
  getRegistration: vi.fn(async () => registration),
  register: vi.fn(async () => registration),
  ready: Promise.resolve(registration),
};
const requestPermission = vi.fn(async () => "granted" as NotificationPermission);

function installBrowser(permission: NotificationPermission = "default") {
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: { permission, requestPermission },
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "QUJD";
  pushManager.getSubscription.mockResolvedValue(null);
  actions.pushOwnedAction.mockResolvedValue({ ok: true, data: { owned: true } });
  requestPermission.mockResolvedValue("granted");
  installBrowser();
});
afterEach(cleanup);

describe("keyBytes", () => {
  it("decodes base64url into bytes", () => {
    expect([...keyBytes("QUJD")]).toEqual([65, 66, 67]);
    expect([...keyBytes("_-8")]).toEqual([255, 239]);
  });
});

describe("PushToggle", () => {
  it("renders nothing without a public key", () => {
    env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = undefined;
    const { container } = render(<PushToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains when the browser can't do push", async () => {
    Reflect.deleteProperty(window, "PushManager");
    render(<PushToggle />);
    expect(await screen.findByText(/can't show notifications/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
  });

  it("explains when notifications are blocked", async () => {
    installBrowser("denied");
    render(<PushToggle />);
    expect(await screen.findByText(/blocked for Jarso/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true");
  });

  it("shows on when this browser's subscription is this account's", async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    render(<PushToggle />);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    expect(actions.pushOwnedAction).toHaveBeenCalledWith(null, {
      endpoint: "https://push.example.test/abc",
    });
  });

  it("shows off when the browser's subscription belongs to another account", async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    actions.pushOwnedAction.mockResolvedValue({ ok: true, data: { owned: false } });
    render(<PushToggle />);
    await waitFor(() =>
      expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("asks permission, subscribes and tells the server", async () => {
    actions.subscribePushAction.mockResolvedValue({ ok: true, data: { id: "s1" } });
    render(<PushToggle />);
    await waitFor(() =>
      expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true"),
    );
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(actions.subscribePushAction).toHaveBeenCalled());
    expect(requestPermission).toHaveBeenCalled();
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(actions.subscribePushAction).toHaveBeenCalledWith(null, {
      endpoint: "https://push.example.test/abc",
      keys: { p256dh: "p", auth: "a" },
    });
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("drops the browser subscription when the server refuses it", async () => {
    actions.subscribePushAction.mockResolvedValue({
      ok: false,
      error: { code: "FORBIDDEN", message: "Join a family first" },
    });
    render(<PushToggle />);
    await waitFor(() =>
      expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true"),
    );
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Join a family first");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("marks blocked when the user says no", async () => {
    requestPermission.mockResolvedValue("denied");
    render(<PushToggle />);
    await waitFor(() =>
      expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true"),
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText(/blocked for Jarso/)).toBeInTheDocument();
    expect(actions.subscribePushAction).not.toHaveBeenCalled();
  });

  it("unsubscribes the browser first, then the server", async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    actions.unsubscribePushAction.mockResolvedValue({ ok: true, data: { removed: true } });
    render(<PushToggle />);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(actions.unsubscribePushAction).toHaveBeenCalled());
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(actions.unsubscribePushAction).toHaveBeenCalledWith(null, {
      endpoint: "https://push.example.test/abc",
    });
    await waitFor(() =>
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"),
    );
  });
});

import { markRead } from "@jarso/data/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { installForegroundHandler, pushPresentation, usePushTaps } from "@/features/push";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE = "33333333-3333-4333-8333-333333333333";
const NOTICE = "44444444-4444-4444-8444-444444444444";

let mockResponse: unknown = null;
jest.mock("expo-notifications", () => ({
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponse: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  markRead: jest.fn(),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
let mockNavKey: string | undefined = "root";
jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useRootNavigationState: () => (mockNavKey ? { key: mockNavKey } : undefined),
}));

const mockSession: { status: string; userId?: string } = { status: "parent", userId: PARENT };
jest.mock("@/features/auth/use-session", () => ({ useSession: () => mockSession }));

const push = jest.fn();
const navigate = jest.fn();

const response = (data: unknown, identifier = "push-1") => ({
  actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
  notification: { request: { identifier, content: { data } } },
});

const handover = {
  kind: "notice",
  noticeId: NOTICE,
  recipientId: PARENT,
  role: "parent",
  target: { to: "handover", childId: CHILD, kind: "allowance", id: OCCURRENCE },
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Navigation runs on the next tick, after the layouts' redirects. */
async function tapped() {
  const hook = await renderHook(() => usePushTaps(), { wrapper });
  await flush();
  return hook;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push, navigate });
  mockNavKey = "root";
  (markRead as jest.Mock).mockResolvedValue(1);
  mockSession.status = "parent";
  mockSession.userId = PARENT;
  mockResponse = null;
});

describe("usePushTaps", () => {
  it("tap on a parent's handover push opens /(parent)/children/<c>/handover/allowance/<o> and marks the notice read", async () => {
    mockResponse = response(handover);
    await tapped();
    expect(push).toHaveBeenCalledWith(
      `/(parent)/children/${CHILD}/handover/allowance/${OCCURRENCE}`,
    );
    await waitFor(() => expect(markRead).toHaveBeenCalledWith({}, [NOTICE]));
  });

  it("tap on a child's ledger push opens /(child)/(tabs)/diary", async () => {
    mockSession.status = "child";
    mockSession.userId = CHILD;
    mockResponse = response({
      kind: "notice",
      noticeId: NOTICE,
      recipientId: CHILD,
      role: "child",
      target: { to: "diary" },
    });
    await tapped();
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/diary");
  });

  it("tap on an overnight summary opens News and marks nothing read", async () => {
    mockSession.status = "child";
    mockSession.userId = CHILD;
    mockResponse = response({ kind: "summary", recipientId: CHILD, role: "child", count: 3 });
    await tapped();
    expect(push).toHaveBeenCalledWith("/(child)/news");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("push for another recipient opens role home and marks nothing", async () => {
    mockResponse = response({ ...handover, recipientId: CHILD });
    await tapped();
    expect(navigate).toHaveBeenCalledWith("/(parent)/(tabs)");
    expect(push).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("malformed data opens role home", async () => {
    mockSession.status = "child";
    mockSession.userId = CHILD;
    mockResponse = response({ kind: "notice", noticeId: "nope" });
    await tapped();
    expect(navigate).toHaveBeenCalledWith("/(child)/(tabs)");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("cold start waits for the session then navigates once", async () => {
    mockSession.status = "loading";
    mockSession.userId = undefined;
    mockResponse = response(handover);
    const { rerender } = await tapped();
    expect(push).not.toHaveBeenCalled();

    mockSession.status = "parent";
    mockSession.userId = PARENT;
    await rerender({});
    await flush();
    await rerender({});
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("the same response navigates once across re-renders", async () => {
    mockResponse = response(handover);
    const { rerender } = await tapped();
    mockResponse = response(handover);
    await rerender({});
    await flush();
    expect(push).toHaveBeenCalledTimes(1);

    mockResponse = response(handover, "push-2");
    await rerender({});
    await flush();
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("a tap while signed out is dropped, not replayed after the next sign-in", async () => {
    mockSession.status = "signed-out";
    mockSession.userId = undefined;
    mockResponse = response(handover);
    const { rerender } = await tapped();
    mockSession.status = "parent";
    mockSession.userId = PARENT;
    await rerender({});
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("waits for the navigator before navigating (cold start)", async () => {
    mockNavKey = undefined;
    mockResponse = response(handover);
    const { rerender } = await tapped();
    expect(push).not.toHaveBeenCalled();
    mockNavKey = "root";
    await rerender({});
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("clears the handled response so a recreated app doesn't open it again", async () => {
    mockResponse = response(handover);
    await tapped();
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a response", async () => {
    await tapped();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("pushPresentation", () => {
  const hidden = {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };

  it("foreground: own notice is listed without a banner; another user's is not shown", () => {
    expect(pushPresentation(handover, PARENT)).toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    expect(pushPresentation(handover, CHILD)).toEqual(hidden);
    expect(pushPresentation(handover, undefined)).toEqual(hidden);
    expect(pushPresentation({ junk: true }, PARENT)).toEqual(hidden);
  });
});

describe("installForegroundHandler", () => {
  it("installs the handler and returns its uninstall", () => {
    const uninstall = installForegroundHandler(() => PARENT);
    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function),
    });
    uninstall();
    expect(Notifications.setNotificationHandler).toHaveBeenLastCalledWith(null);
  });
});

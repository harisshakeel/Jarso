import { markRead } from "@jarso/data/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { pushPresentation, usePushTaps } from "@/features/push";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE = "33333333-3333-4333-8333-333333333333";
const NOTICE = "44444444-4444-4444-8444-444444444444";

let mockResponse: unknown = null;
jest.mock("expo-notifications", () => ({
  useLastNotificationResponse: () => mockResponse,
  setNotificationHandler: jest.fn(),
}));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  markRead: jest.fn(),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const mockSession: { status: string; userId?: string } = { status: "parent", userId: PARENT };
jest.mock("@/features/auth/use-session", () => ({ useSession: () => mockSession }));

const push = jest.fn();

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (markRead as jest.Mock).mockResolvedValue(1);
  mockSession.status = "parent";
  mockSession.userId = PARENT;
  mockResponse = null;
});

describe("usePushTaps", () => {
  it("tap on a parent's handover push opens /(parent)/children/<c>/handover/allowance/<o> and marks the notice read", async () => {
    mockResponse = response(handover);
    await renderHook(() => usePushTaps(), { wrapper });
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
    await renderHook(() => usePushTaps(), { wrapper });
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/diary");
  });

  it("tap on an overnight summary opens News and marks nothing read", async () => {
    mockSession.status = "child";
    mockSession.userId = CHILD;
    mockResponse = response({ kind: "summary", recipientId: CHILD, role: "child", count: 3 });
    await renderHook(() => usePushTaps(), { wrapper });
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/news");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("push for another recipient opens role home and marks nothing", async () => {
    mockResponse = response({ ...handover, recipientId: CHILD });
    await renderHook(() => usePushTaps(), { wrapper });
    expect(push).toHaveBeenCalledWith("/(parent)/(tabs)");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("malformed data opens role home", async () => {
    mockSession.status = "child";
    mockSession.userId = CHILD;
    mockResponse = response({ kind: "notice", noticeId: "nope" });
    await renderHook(() => usePushTaps(), { wrapper });
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)");
    expect(markRead).not.toHaveBeenCalled();
  });

  it("cold start waits for the session then navigates once", async () => {
    mockSession.status = "loading";
    mockSession.userId = undefined;
    mockResponse = response(handover);
    const { rerender } = await renderHook(() => usePushTaps(), { wrapper });
    expect(push).not.toHaveBeenCalled();

    mockSession.status = "parent";
    mockSession.userId = PARENT;
    await rerender({});
    await rerender({});
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("the same response navigates once across re-renders", async () => {
    mockResponse = response(handover);
    const { rerender } = await renderHook(() => usePushTaps(), { wrapper });
    mockResponse = response(handover);
    await rerender({});
    expect(push).toHaveBeenCalledTimes(1);

    mockResponse = response(handover, "push-2");
    await rerender({});
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a response", async () => {
    await renderHook(() => usePushTaps(), { wrapper });
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

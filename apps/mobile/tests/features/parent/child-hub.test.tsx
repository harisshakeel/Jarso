import { allowanceSummaryCopy, dueListCopy, formatDay } from "@jarso/core/allowance";
import { parentGuideCopy } from "@jarso/core/guide";
import { noteCopy } from "@jarso/core/notifications";
import { getParentSchedule, listDueForParent, listGiftsFor } from "@jarso/data/allowance";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { countFlaggedSince } from "@jarso/data/guide";
import { getLearningOverview } from "@jarso/data/learning";
import { getHistoryPage, getJars } from "@jarso/data/ledger";
import { insertChildNote } from "@jarso/data/notifications";
import { getProgress } from "@jarso/data/progress";
import { listOpenRequests } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { ChildHubScreen } from "@/features/parent";
import { apiFetch } from "@/lib/api";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
let mockUuid = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-00000000000${++mockUuid}`,
}));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({
  listDueForParent: jest.fn(),
  getParentSchedule: jest.fn(),
  listGiftsFor: jest.fn(),
}));
jest.mock("@jarso/data/requests", () => ({
  listOpenRequests: jest.fn(),
  callDecideWithdrawal: jest.fn(),
  callComplete: jest.fn(),
  callDecideDeposit: jest.fn(),
  callCancel: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn(), getHistoryPage: jest.fn() }));
jest.mock("@jarso/data/guide", () => ({ countFlaggedSince: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));
jest.mock("@jarso/data/notifications", () => ({ insertChildNote: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));

const CHILD = "22222222-2222-4222-8222-222222222222";
const push = jest.fn();
const replace = jest.fn();

function setup() {
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (apiFetch as jest.Mock).mockResolvedValue({ configured: true, enabledChildIds: [CHILD] });
  (findMembership as jest.Mock).mockResolvedValue({
    familyId: "family-1",
    role: "parent",
    status: "approved",
  });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: CHILD, nickname: "Sam" }]);
  (getJars as jest.Mock).mockResolvedValue({ spend: 1250, save: 3400 });
  (listOpenRequests as jest.Mock).mockResolvedValue([]);
  (listDueForParent as jest.Mock).mockResolvedValue([
    { kind: "allowance", id: "occ-1", dueOn: "2026-11-03", amountMinor: 300, note: null },
  ]);
  (getParentSchedule as jest.Mock).mockResolvedValue({
    id: "schedule-1",
    amountMinor: 300,
    frequency: "weekly",
    status: "active",
    anchorOn: "2026-11-01",
    nextDueOn: "2026-11-08",
    pausedThrough: null,
    pauseMessage: null,
    autoCharge: false,
    autoChargeProvider: null,
    autoChargeMine: false,
  });
  (listGiftsFor as jest.Mock).mockResolvedValue([
    {
      id: "gift-1",
      amountMinor: 1000,
      giveOn: "2099-01-01",
      note: "Birthday",
      status: "pending",
      autoCharge: false,
      autoChargeProvider: null,
      autoChargeMine: false,
    },
  ]);
  (countFlaggedSince as jest.Mock).mockResolvedValue(2);
  (getLearningOverview as jest.Mock).mockResolvedValue({
    journey: [],
    skills: [],
    checkIn: null,
    practiceDue: 0,
    daysThisWeek: 0,
    lastLearnedOn: null,
    nextStep: null,
    completed: [],
  });
  (getHistoryPage as jest.Mock).mockResolvedValue({ items: [], olderBefore: null });
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getProgress as jest.Mock).mockResolvedValue({
    sparks: 120,
    level: 3,
    nextLevelAt: 200,
    streak: 2,
    bestStreak: 4,
    restUsedThisWeek: false,
    checkedInToday: true,
    look: { lid: "grape", wear: "shades" },
    badges: [],
    recent: [],
  });
}

function renderHub(childId = CHILD) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChildHubScreen childId={childId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
});

describe("ChildHubScreen", () => {
  it("unknown child id goes back to Children", async () => {
    setup();
    await renderHub("33333333-3333-4333-8333-333333333333");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/(parent)/(tabs)/children"));
    expect(getJars).not.toHaveBeenCalled();
    expect(listDueForParent).not.toHaveBeenCalled();
    expect(getParentSchedule).not.toHaveBeenCalled();
  });

  it("hub shows due, allowance, gifts and guide sections", async () => {
    setup();
    await renderHub();
    expect(await screen.findByText(dueListCopy.dueTitle)).toBeOnTheScreen();
    expect(
      await screen.findByRole("header", { name: allowanceSummaryCopy.title }),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", { name: allowanceSummaryCopy.manage }),
    ).toBeOnTheScreen();
    expect(await screen.findByText(dueListCopy.giftsTitle)).toBeOnTheScreen();
    expect(await screen.findByText(parentGuideCopy.cardTitle)).toBeOnTheScreen();
    expect(await screen.findByText(parentGuideCopy.flagged(2))).toBeOnTheScreen();

    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: parentGuideCopy.readChats("Sam") }));
    expect(push).toHaveBeenCalledWith(`/(parent)/children/${CHILD}/guide`);
  });

  it("the hub hero shows Jarso's line and the three tiles", async () => {
    setup();
    await renderHub();
    expect(await screen.findByText("Level 3 · 2-day streak")).toBeOnTheScreen();
    expect(await screen.findByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£34")).toBeOnTheScreen();
    expect(screen.getByText("No goal")).toBeOnTheScreen();
    expect(screen.queryByText(/120|spark/i)).toBeNull();
  });

  it("a due allowance is a handover card", async () => {
    setup();
    await renderHub();
    const day = formatDay("2026-11-03");
    await userEvent.setup().press(
      await screen.findByRole("button", {
        name: `${dueListCopy.handOver}: Allowance, ${dueListCopy.due(day)}, £3.00`,
      }),
    );
    expect(push).toHaveBeenCalledWith(`/(parent)/children/${CHILD}/handover/allowance/occ-1`);
  });

  it("note sends once per opening", async () => {
    setup();
    let finish: (value: string) => void = () => {};
    (insertChildNote as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderHub();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name: `${noteCopy.trigger} ${noteCopy.triggerTo("Sam")}`,
    });

    await user.press(trigger);
    await user.type(screen.getByLabelText(noteCopy.label), "Well done this week");
    const send = screen.getByRole("button", { name: noteCopy.send("Sam") });
    await user.press(send);
    await user.press(send);
    finish("sent");
    await waitFor(() => expect(flash).toHaveBeenCalledWith(noteCopy.sent("Sam")));
    expect(insertChildNote).toHaveBeenCalledTimes(1);
    const first = (insertChildNote as jest.Mock).mock.calls[0]?.[1];
    expect(first).toEqual({
      childId: CHILD,
      text: "Well done this week",
      idempotencyKey: expect.any(String),
    });
    expect(dispatchNotices).toHaveBeenCalled();

    // A new opening is a new note: a new key.
    (insertChildNote as jest.Mock).mockResolvedValue("sent");
    await user.press(trigger);
    await user.type(screen.getByLabelText(noteCopy.label), "Proud of you");
    await user.press(screen.getByRole("button", { name: noteCopy.send("Sam") }));
    await waitFor(() => expect(insertChildNote).toHaveBeenCalledTimes(2));
    const second = (insertChildNote as jest.Mock).mock.calls[1]?.[1];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});

import { addChildCopy } from "@jarso/core/family";
import { setupFlowCopy } from "@jarso/core/setup";
import { saveJarMovesApproval, saveMoneyRule } from "@jarso/data/rules";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Share } from "react-native";
import { apiFetch } from "@/lib/api";

jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@/features/auth/camera", () => ({ loadCamera: () => null }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jarso/data/rules", () => ({
  saveMoneyRule: jest.fn(async () => undefined),
  saveJarMovesApproval: jest.fn(async () => undefined),
}));
jest.mock("@/features/guide", () => ({ useParentGuideState: () => ({ data: undefined }) }));
jest.mock("@/features/family", () => ({
  ...jest.requireActual("@/features/family"),
  useFamily: () => ({ data: { family: { code: "KQ74MX" }, children: [] } }),
}));
// Step 5 renders plan 7's allowance editor as it is: a stub stands in for it here.
let mockCurrency = "INR";
jest.mock("@/features/allowance", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    ...jest.requireActual("@/features/allowance"),
    useFamilyContext: () => ({ data: { currency: mockCurrency, today: "2026-11-07" } }),
    AllowanceForm: ({ childId, onDone }: { childId: string; onDone: () => void }) => (
      <Text accessibilityRole="button" onPress={onDone}>{`Allowance editor for ${childId}`}</Text>
    ),
  };
});

const { ChildStep } = require("@/features/setup/child-step");
const { PocketMoneyStep } = require("@/features/setup/pocket-money-step");
const { FreedomStep } = require("@/features/setup/freedom-step");
const { ShareStep } = require("@/features/setup/share-step");

const copy = setupFlowCopy;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrency = "INR";
});

describe("step 4: add a child", () => {
  it("shows the data promise and adds the child with nickname, PIN and consent", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "child-1", nickname: "Sam" });
    const onAdded = jest.fn();
    const user = userEvent.setup();
    await wrap(<ChildStep onAdded={onAdded} onLater={jest.fn()} />);

    expect(screen.getByText("Only a nickname")).toBeOnTheScreen();
    expect(screen.getByText("No email, surname or birthday.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(copy.child.nickname), "Sam");
    await fireEvent.changeText(screen.getByLabelText(copy.child.pin), "4729");
    await user.press(screen.getByRole("checkbox", { name: addChildCopy.consent }));
    await user.press(screen.getByRole("button", { name: "Add Sam" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith({ id: "child-1", nickname: "Sam" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/children", {
      method: "POST",
      body: { nickname: "Sam", pin: "4729", consent: true },
      auth: true,
    });
  });

  it("Later skips to the family", async () => {
    const onLater = jest.fn();
    await wrap(<ChildStep onAdded={jest.fn()} onLater={onLater} />);
    await userEvent.setup().press(screen.getByRole("button", { name: copy.child.later }));
    expect(onLater).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("step 5: pocket money", () => {
  it("renders the allowance editor for the child and moves on when it saves", async () => {
    const onDone = jest.fn();
    await wrap(<PocketMoneyStep childId="child-1" nickname="Sam" onDone={onDone} />);
    expect(screen.getByText("Sam's pocket money")).toBeOnTheScreen();
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: "Allowance editor for child-1" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("Not now moves on", async () => {
    const onDone = jest.fn();
    await wrap(<PocketMoneyStep childId="child-1" nickname="Sam" onDone={onDone} />);
    await userEvent.setup().press(screen.getByRole("button", { name: copy.money.notNow }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("step 6: freedom", () => {
  async function choose(label: string | null) {
    const onDone = jest.fn();
    const user = userEvent.setup();
    await wrap(<FreedomStep childId="child-1" nickname="Sam" onDone={onDone} />);
    if (label) await user.press(screen.getByRole("radio", { name: new RegExp(`^${label}`) }));
    await user.press(screen.getByRole("button", { name: copy.freedom.submit }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  }

  it("ask me every time is the default and writes nothing", async () => {
    await choose(null);
    expect(saveMoneyRule).not.toHaveBeenCalled();
    expect(saveJarMovesApproval).not.toHaveBeenCalled();
  });

  it("small ones shows its cap in the family's currency", async () => {
    await wrap(<FreedomStep childId="child-1" nickname="Sam" onDone={jest.fn()} />);
    expect(screen.getByText("Under ₹50 goes through")).toBeOnTheScreen();
  });

  it("small ones writes the two per-item rules at the cap", async () => {
    await choose("Small ones");
    expect(saveMoneyRule).toHaveBeenCalledWith(expect.anything(), {
      childId: "child-1",
      kind: "withdrawal_auto_approve",
      period: "item",
      amountMinor: 5000,
    });
    expect(saveMoneyRule).toHaveBeenCalledWith(expect.anything(), {
      childId: "child-1",
      kind: "deposit_auto_confirm",
      period: "item",
      amountMinor: 5000,
    });
    expect(saveJarMovesApproval).not.toHaveBeenCalled();
  });

  it("Sam decides sets jar moves to notify", async () => {
    await choose("Sam decides");
    expect(saveJarMovesApproval).toHaveBeenCalledWith(expect.anything(), "child-1", "notify");
    expect(saveMoneyRule).not.toHaveBeenCalled();
  });

  it("a refused write stays on the step", async () => {
    (saveJarMovesApproval as jest.Mock).mockRejectedValueOnce(
      new (jest.requireActual("@/lib").AppError)("FORBIDDEN", "Not allowed"),
    );
    const onDone = jest.fn();
    const user = userEvent.setup();
    await wrap(<FreedomStep childId="child-1" nickname="Sam" onDone={onDone} />);
    await user.press(screen.getByRole("radio", { name: /^Sam decides/ }));
    await user.press(screen.getByRole("button", { name: copy.freedom.submit }));
    expect(await screen.findByText("Not allowed")).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("step 7: share", () => {
  it("shows code, nickname and a QR, never the PIN", async () => {
    await wrap(<ShareStep nickname="Sam" onDone={jest.fn()} />);
    expect(screen.getByText("KQ74MX")).toBeOnTheScreen();
    expect(screen.getByText("Sam")).toBeOnTheScreen();
    expect(screen.getByText("The one you picked")).toBeOnTheScreen();
    expect(screen.getByLabelText("Sign-in code for Sam")).toBeOnTheScreen();
    expect(screen.queryByText(/\d{4}/)).not.toBeOnTheScreen();
  });

  it("shares the code, nickname and the sign-in link", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    await wrap(<ShareStep nickname="Sam" onDone={jest.fn()} />);
    await userEvent.setup().press(screen.getByRole("button", { name: copy.share.send }));
    const [content] = share.mock.calls[0] ?? [];
    const message = (content as { message: string }).message;
    expect(message).toContain("KQ74MX");
    expect(message).toContain("jarso://sign-in?code=KQ74MX&nickname=Sam");
    share.mockRestore();
  });

  it("Go to family finishes", async () => {
    const onDone = jest.fn();
    await wrap(<ShareStep nickname="Sam" onDone={onDone} />);
    await userEvent.setup().press(screen.getByRole("button", { name: copy.share.done }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("QR", () => {
  it("encodes the link as a square of modules with a quiet zone", () => {
    const { qrPath } = require("@/features/setup/qr-code");
    const { d, size } = qrPath("jarso://sign-in?code=KQ74MX&nickname=Sam");
    expect(size).toBeGreaterThanOrEqual(21 + 8);
    expect(d).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});

import { wordCount } from "@jarso/core/home";
import { findParentLabels } from "@jarso/data/family";
import { listRequestsFor } from "@jarso/data/requests";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AddSheet } from "@/features/flows";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/family", () => ({ findParentLabels: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ listRequestsFor: jest.fn() }));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);

const labels = findParentLabels as jest.Mock;
const asks = listRequestsFor as jest.Mock;

async function open() {
  const onPick = jest.fn();
  const onAsks = jest.fn();
  await renderFlow(<AddSheet onPick={onPick} onAsks={onAsks} onClose={jest.fn()} />);
  return { onPick, onAsks };
}

beforeEach(() => {
  labels.mockResolvedValue(["Mum"]);
  asks.mockResolvedValue([]);
});

describe("AddSheet", () => {
  it("shows the five moments with their hints", async () => {
    await open();
    expect(screen.getByRole("button", { name: "I bought something" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save some" })).toBeTruthy();
    expect(await screen.findByText("Give cash to Mum")).toBeTruthy();
    expect(screen.getByText("Ask Mum for it")).toBeTruthy();
  });

  it("uses your parent without a name", async () => {
    labels.mockResolvedValue([]);
    await open();
    expect(await screen.findByText("Give cash to your parent")).toBeTruthy();
  });

  it("picking a moment opens its flow", async () => {
    const { onPick } = await open();
    fireEvent.press(screen.getByRole("button", { name: "Save some" }));
    expect(onPick).toHaveBeenCalledWith("put-in");
  });

  it("My asks shows how many are waiting", async () => {
    asks.mockResolvedValue([
      { id: "a", status: "pending" },
      { id: "b", status: "approved" },
      { id: "c", status: "done" },
    ]);
    const { onAsks } = await open();
    expect(await screen.findByText("2 waiting")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "My asks" }));
    expect(onAsks).toHaveBeenCalled();
  });

  it("fits the word budget (the mockup copy, about 35)", async () => {
    asks.mockResolvedValue([{ id: "a", status: "pending" }]);
    await open();
    await screen.findByText("1 waiting");
    await waitFor(() => expect(screen.getByText("Give cash to Mum")).toBeTruthy());
    const words = screen
      .getAllByText(/.+/)
      .reduce((n, t) => n + wordCount(String(t.props.children)), 0);
    expect(words).toBeLessThanOrEqual(36);
  });
});

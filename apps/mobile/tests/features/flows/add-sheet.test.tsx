import { wordCount } from "@jarso/core/home";
import { fireEvent, screen } from "@testing-library/react-native";
import { AddSheet } from "@/features/flows";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);

type Json = { type: string; children?: Json[] | string[] | null } | string;

function findScroller(node: unknown): Json | undefined {
  const list = Array.isArray(node) ? node : [node];
  for (const n of list as Json[]) {
    if (typeof n === "string" || !n) continue;
    if (n.type === "RCTScrollView") return n;
    const hit = findScroller(n.children);
    if (hit) return hit;
  }
  return undefined;
}

async function open({ parent = "Mum", waiting = 0 } = {}) {
  const onPick = jest.fn();
  const onAsks = jest.fn();
  await renderFlow(
    <AddSheet
      parent={parent}
      waiting={waiting}
      onPick={onPick}
      onAsks={onAsks}
      onClose={jest.fn()}
    />,
  );
  return { onPick, onAsks };
}

describe("AddSheet", () => {
  it("shows the five moments with their hints", async () => {
    await open();
    for (const name of [
      "I bought something",
      "I got money",
      "Save some",
      "Use savings",
      "Ask for extra",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByText("Give cash to Mum")).toBeTruthy();
    expect(screen.getByText("Ask Mum for it")).toBeTruthy();
  });

  it("uses your parent without a name", async () => {
    await open({ parent: "your parent" });
    expect(screen.getByText("Give cash to your parent")).toBeTruthy();
  });

  it("picking a moment opens its flow", async () => {
    const { onPick } = await open();
    fireEvent.press(screen.getByRole("button", { name: "Save some" }));
    expect(onPick).toHaveBeenCalledWith("put-in");
  });

  it("My asks shows how many are waiting", async () => {
    const { onAsks } = await open({ waiting: 2 });
    expect(screen.getByText("2 waiting")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "My asks" }));
    expect(onAsks).toHaveBeenCalled();
  });

  it("shows no count with nothing waiting", async () => {
    await open();
    expect(screen.queryByText(/waiting/)).toBeNull();
  });

  // Budget is 36 words, not the mockup's "about 30": the verbatim mockup copy plus the count is 35-36.
  it("fits the word budget", async () => {
    await open({ waiting: 1 });
    const words = screen
      .getAllByText(/.+/)
      .reduce((n, t) => n + wordCount(String(t.props.children)), 0);
    expect(words).toBeLessThanOrEqual(36);
  });

  it("scrolls the tiles and My asks, leaving the close button outside", async () => {
    await open();
    const scroller = findScroller(screen.toJSON());
    expect(scroller).toBeDefined();
    const inside = JSON.stringify(scroller);
    expect(inside).toContain("My asks");
    expect(inside).not.toContain('"Close"');
    expect(JSON.stringify(screen.toJSON())).toContain('"Close"');
  });
});

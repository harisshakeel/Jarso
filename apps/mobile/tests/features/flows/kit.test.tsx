import { spendPictures } from "@jarso/core/home";
import { trackerSteps } from "@jarso/core/requests";
import { getProgress } from "@jarso/data/progress";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import {
  AmountKeypad,
  AskTracker,
  FlowShell,
  PictureGrid,
  SentCelebration,
  useSparkChips,
} from "@/features/flows";
import { keys } from "@/lib/query";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
// The add sheet (same barrel) reads asks; the kit tests never render it.
jest.mock("@/features/requests", () => ({ useRequests: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success" },
}));

function KeypadHost({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <AmountKeypad
      value={value}
      currency="INR"
      chips={[2000]}
      limit="Spend has ₹120"
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe("AmountKeypad", () => {
  it("taps build the amount", async () => {
    const onChange = jest.fn();
    await renderFlow(<KeypadHost onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("4"));
    await fireEvent.press(screen.getByLabelText("5"));
    expect(onChange).toHaveBeenLastCalledWith("45");
    expect(screen.getByLabelText("Amount").props.accessibilityValue.text).toBe("₹45");
  });

  it("a quick chip sets the amount", async () => {
    const onChange = jest.fn();
    await renderFlow(<KeypadHost onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("₹20"));
    expect(onChange).toHaveBeenLastCalledWith("20");
  });

  it("delete removes a digit", async () => {
    const onChange = jest.fn();
    await renderFlow(<KeypadHost onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("4"));
    await fireEvent.press(screen.getByLabelText("5"));
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(onChange).toHaveBeenLastCalledWith("4");
  });

  it("shows the limit chip", async () => {
    await renderFlow(<KeypadHost onChange={jest.fn()} />);
    expect(screen.getByText("Spend has ₹120")).toBeTruthy();
  });

  it("keys are at least 44 dp", async () => {
    await renderFlow(<KeypadHost onChange={jest.fn()} />);
    expect(screen.getByLabelText("4").props.className).toContain("h-16");
  });
});

describe("PictureGrid", () => {
  const grid = (value: string | null, onChange = jest.fn()) => (
    <PictureGrid options={spendPictures()} value={value} onChange={onChange} legend="On what?" />
  );

  it("is a radiogroup of 9 for spend", async () => {
    await renderFlow(grid(null));
    expect(screen.getByLabelText("On what?").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getAllByRole("radio")).toHaveLength(9);
  });

  it("pressing a tile checks it", async () => {
    const onChange = jest.fn();
    const { rerender } = await renderFlow(grid(null, onChange));
    await fireEvent.press(screen.getByRole("radio", { name: "Snacks" }));
    expect(onChange).toHaveBeenCalledWith("snacks");
    await rerender(grid("snacks", onChange));
    expect(screen.getByRole("radio", { name: "Snacks", checked: true })).toBeTruthy();
  });
});

describe("FlowShell", () => {
  const shell = (props: { onBack?: () => void; onClose?: () => void }) => (
    <FlowShell
      title="On what?"
      step={2}
      steps={2}
      onClose={props.onClose ?? jest.fn()}
      onBack={props.onBack}
      footer={<Text>Done</Text>}
    >
      <Text>Body</Text>
    </FlowShell>
  );

  it("back shows on step 2 and calls onBack", async () => {
    const onBack = jest.fn();
    await renderFlow(shell({ onBack }));
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByLabelText("Close")).toBeNull();
  });

  it("close calls onClose", async () => {
    const onClose = jest.fn();
    await renderFlow(shell({ onClose }));
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("title is a header", async () => {
    await renderFlow(shell({}));
    expect(screen.getByRole("header", { name: "On what?" })).toBeTruthy();
  });
});

describe("AskTracker", () => {
  it("marks done, now and next", async () => {
    const steps = trackerSteps(
      {
        kind: "deposit",
        status: "pending",
      } as Parameters<typeof trackerSteps>[0],
      "₹50",
      "Mum",
      "Today, 4:10 pm",
    );
    await renderFlow(<AskTracker steps={steps ?? []} />);
    expect(screen.getByTestId("tracker-step-done")).toBeTruthy();
    expect(screen.getByTestId("tracker-step-now").props.accessibilityLabel).toBe(
      "Now: Give Mum the ₹50",
    );
    expect(screen.getByTestId("tracker-step-next")).toBeTruthy();
  });
});

describe("SentCelebration", () => {
  it("celebrates once even when re-rendered", async () => {
    const onPress = jest.fn();
    const celebration = { title: "Written down!", primary: { label: "Nice", onPress } };
    const { rerender } = await renderFlow(<SentCelebration celebration={celebration} />);
    expect(screen.getAllByText("Written down!")).toHaveLength(1);
    await rerender(<SentCelebration celebration={{ ...celebration }} />);
    expect(screen.getAllByText("Written down!")).toHaveLength(1);
    await act(async () => {
      await fireEvent.press(screen.getByText("Nice"));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("useSparkChips", () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keys.progress("child-1"), { sparks: 230, streak: 5 });
    const { QueryClientProvider } = require("@tanstack/react-query");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useSparkChips(), { wrapper });
  }

  it("gives +10 and the streak after a log", async () => {
    (getProgress as jest.Mock).mockResolvedValue({ sparks: 240, streak: 6 });
    const { result } = await setup();
    result.current.snapshot();
    let chips: unknown;
    await act(async () => {
      chips = await result.current.chips();
    });
    expect(chips).toEqual([
      { icon: "zap", label: "+10" },
      { icon: "flame", label: "6 days" },
    ]);
  });

  it("gives [] when the refetch fails", async () => {
    (getProgress as jest.Mock).mockRejectedValue(new Error("offline"));
    const { result } = await setup();
    result.current.snapshot();
    let chips: unknown;
    await act(async () => {
      chips = await result.current.chips();
    });
    expect(chips).toEqual([]);
  });
});

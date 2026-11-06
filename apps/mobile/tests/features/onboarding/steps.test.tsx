import { onboardingCopy, startPractice } from "@jarso/core/onboarding";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { MeetStep } from "@/features/onboarding/meet-step";
import { SaveStep } from "@/features/onboarding/save-step";
import { SpendStep } from "@/features/onboarding/spend-step";
import { useTicker } from "@/features/onboarding/use-ticker";
import { playSound } from "@/lib/sound";

jest.mock("@/lib/sound", () => ({ playSound: jest.fn() }));

const c = onboardingCopy;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("MeetStep", () => {
  it("meet says hi by name and Let's go moves on", async () => {
    const onNext = jest.fn();
    await render(<MeetStep name="Sam" onNext={onNext} onSkip={jest.fn()} />);
    expect(screen.getByText("Hi Sam! I'm Jarso.")).toBeTruthy();
    expect(screen.getByRole("header", { name: c.meet.heading })).toBeTruthy();
    expect(screen.queryByLabelText(c.practiceLabel)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: c.meet.go }));
    expect(onNext).toHaveBeenCalled();
  });

  it("meet without a name still says hi", async () => {
    await render(<MeetStep name={null} onNext={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.getByText("Hi! I'm Jarso.")).toBeTruthy();
  });
});

describe("SpendStep", () => {
  it("spend shows PRACTICE and 100", async () => {
    await render(<SpendStep currency="INR" onNext={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.getByLabelText(c.practiceLabel)).toBeTruthy();
    expect(screen.getByTestId("practice-spend").props.children).toBe("₹100");
    expect(screen.getByText(c.spend.hint)).toBeTruthy();
  });

  it("tapping the snack takes 20 off and plays the coin", async () => {
    const onNext = jest.fn();
    await render(<SpendStep currency="INR" onNext={onNext} onSkip={jest.fn()} />);
    await fireEvent.press(screen.getByRole("button", { name: c.spend.snack("₹20") }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("practice-spend").props.children).toBe("₹80");
    expect(playSound).toHaveBeenCalledWith("coin");
    expect(screen.getByText(c.spend.done)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: c.next }));
    expect(onNext).toHaveBeenCalledWith({ mode: "practice", spendMinor: 8000, saveMinor: 0 });
  });

  it("the snack can only be bought once", async () => {
    await render(<SpendStep currency="INR" onNext={jest.fn()} onSkip={jest.fn()} />);
    const snack = screen.getByRole("button", { name: c.spend.snack("₹20") });
    await fireEvent.press(snack);
    await fireEvent.press(snack);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("practice-spend").props.children).toBe("₹80");
    expect(playSound).toHaveBeenCalledTimes(1);
  });
});

describe("SaveStep", () => {
  const start = { mode: "practice" as const, spendMinor: 8000, saveMinor: 0 };

  it("save says to hand the cash to the parent", async () => {
    await render(
      <SaveStep currency="INR" start={start} parent="Mum" onNext={jest.fn()} onSkip={jest.fn()} />,
    );
    expect(screen.getByText("For real, you hand the cash to Mum.")).toBeTruthy();
    expect(screen.getByText("Mum keeps it safe for you.")).toBeTruthy();
    expect(screen.getByLabelText(c.practiceLabel)).toBeTruthy();
  });

  it("the coin is a button that moves 10 into Save", async () => {
    const onNext = jest.fn();
    await render(
      <SaveStep currency="INR" start={start} parent="Mum" onNext={onNext} onSkip={jest.fn()} />,
    );
    expect(screen.getByText("Save ₹0")).toBeTruthy();
    expect(screen.queryByRole("button", { name: c.next })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: c.save.coin }));
    expect(screen.getByText("Save ₹10")).toBeTruthy();
    expect(screen.getByText("Spend ₹70")).toBeTruthy();
    expect(screen.getByText(c.save.done)).toBeTruthy();
    expect(playSound).toHaveBeenCalledWith("coin");
    await fireEvent.press(screen.getByRole("button", { name: c.next }));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("skip", () => {
  it("skip calls onSkip from every step", async () => {
    const onSkip = jest.fn();
    const { rerender } = await render(<MeetStep name="Sam" onNext={jest.fn()} onSkip={onSkip} />);
    await fireEvent.press(screen.getByRole("button", { name: c.skip }));
    await rerender(<SpendStep currency="INR" onNext={jest.fn()} onSkip={onSkip} />);
    await fireEvent.press(screen.getByRole("button", { name: c.skip }));
    await rerender(
      <SaveStep
        currency="INR"
        start={startPractice("INR")}
        parent="Mum"
        onNext={jest.fn()}
        onSkip={onSkip}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: c.skip }));
    expect(onSkip).toHaveBeenCalledTimes(3);
  });
});

describe("useTicker", () => {
  it("counts to the new value", async () => {
    const { result, rerender } = await renderHook(({ v }: { v: number }) => useTicker(v), {
      initialProps: { v: 100 },
    });
    await rerender({ v: 20 });
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current).toBe(90);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current).toBe(20);
  });

  it("useTicker jumps under reduced motion", async () => {
    const spy = jest
      .spyOn(require("react-native-reanimated"), "useReducedMotion")
      .mockReturnValue(true);
    try {
      const { result, rerender } = await renderHook(({ v }: { v: number }) => useTicker(v), {
        initialProps: { v: 100 },
      });
      await rerender({ v: 20 });
      expect(result.current).toBe(20);
    } finally {
      spy.mockRestore();
    }
  });
});

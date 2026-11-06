import { lookCopy } from "@jarso/core/mascot";
import { onboardingCopy } from "@jarso/core/onboarding";
import { completeOnboarding, saveTour } from "@jarso/data/tour";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { useCelebrate } from "@/components/celebrate";
import { OnboardingFlow } from "@/features/onboarding";
import { LookStep } from "@/features/onboarding/look-step";
import { files, read, root } from "../../source-files";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn() }));
jest.mock("@jarso/data/tour", () => ({
  findTour: jest.fn(),
  saveTour: jest.fn(),
  completeOnboarding: jest.fn(),
}));
jest.mock("@/components/celebrate", () => ({ useCelebrate: jest.fn() }));
jest.mock("@/features/settings", () => ({ useNickname: () => ({ data: "Sam" }) }));
jest.mock("@/features/jars", () => ({
  useHome: () => ({ data: { context: { currency: "INR" } } }),
}));
const mockSetLook = jest.fn();
jest.mock("@/features/progress", () => {
  const actual = jest.requireActual("@/features/progress/look-picker");
  return {
    LookPicker: actual.LookPicker,
    useParentLabel: () => "Mum",
    useProgress: () => ({ data: { level: 1, look: { lid: "cyan", wear: "none" } } }),
    useSetJarsoLook: () => ({ mutate: mockSetLook }),
  };
});
// The steps are tested on their own (steps.test, goal-step.test); here each is a Next button.
function mockFakeStep(id: string) {
  return ({ onNext, onSkip }: { onNext: (arg?: unknown) => void; onSkip: () => void }) => (
    <>
      <Pressable role="button" onPress={() => onNext()}>
        <Text>{`${id} next`}</Text>
      </Pressable>
      <Pressable role="button" onPress={onSkip}>
        <Text>{`${id} skip`}</Text>
      </Pressable>
    </>
  );
}
jest.mock("@/features/onboarding/meet-step", () => ({ MeetStep: mockFakeStep("meet") }));
jest.mock("@/features/onboarding/spend-step", () => ({ SpendStep: mockFakeStep("spend") }));
jest.mock("@/features/onboarding/save-step", () => ({ SaveStep: mockFakeStep("save") }));
jest.mock("@/features/onboarding/goal-step", () => ({ GoalStep: mockFakeStep("goal") }));

const celebrate = jest.fn();

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

async function walkToLook() {
  for (const id of ["meet", "spend", "save", "goal"]) {
    await fireEvent.press(await screen.findByRole("button", { name: `${id} next` }));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  (useCelebrate as jest.Mock).mockReturnValue(celebrate);
  (saveTour as jest.Mock).mockResolvedValue(undefined);
  (completeOnboarding as jest.Mock).mockResolvedValue({ sparks: 50, badge: "jar_starter" });
});

describe("OnboardingFlow", () => {
  it("walks meet, spend, save, goal, look and finishes with +50 and the first badge", async () => {
    const onDone = jest.fn();
    await render(wrap(<OnboardingFlow onDone={onDone} />));
    await walkToLook();
    expect(screen.getByRole("header", { name: onboardingCopy.look.heading })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: onboardingCopy.look.done }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(celebrate).toHaveBeenCalledTimes(1);
    const shown = celebrate.mock.calls[0][0];
    expect(shown.title).toBe(onboardingCopy.done.title);
    expect(shown.tone).toBe("grape");
    expect(shown.chips.map((chip: { label: string }) => chip.label)).toEqual([
      "+50",
      onboardingCopy.done.badge,
    ]);
    expect(shown.primary.label).toBe(onboardingCopy.done.go);
  });

  it("a replay that pays nothing celebrates without chips", async () => {
    (completeOnboarding as jest.Mock).mockResolvedValue({ sparks: 0, badge: null });
    const onDone = jest.fn();
    await render(wrap(<OnboardingFlow onDone={onDone} />));
    await walkToLook();
    await fireEvent.press(screen.getByRole("button", { name: onboardingCopy.look.done }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(celebrate.mock.calls[0][0].chips).toEqual([]);
  });

  it("skip on the first step saves finished and closes", async () => {
    const onDone = jest.fn();
    await render(wrap(<OnboardingFlow onDone={onDone} />));
    await fireEvent.press(await screen.findByRole("button", { name: "meet skip" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(saveTour).toHaveBeenCalledWith({ id: "client" }, { finished: true });
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("Done twice finishes once", async () => {
    const onDone = jest.fn();
    await render(wrap(<OnboardingFlow onDone={onDone} />));
    await walkToLook();
    const done = screen.getByRole("button", { name: onboardingCopy.look.done });
    await fireEvent.press(done);
    await fireEvent.press(done);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(celebrate).toHaveBeenCalledTimes(1);
  });
});

describe("LookStep", () => {
  it("the look step uses LookPicker and saves a changed look", async () => {
    const onNext = jest.fn();
    await render(wrap(<LookStep onNext={onNext} onSkip={jest.fn()} />));
    await fireEvent.press(
      screen.getByRole("radio", { name: lookCopy.lidLabel(lookCopy.lid.grape) }),
    );
    await fireEvent.press(screen.getByRole("button", { name: onboardingCopy.look.done }));
    expect(mockSetLook).toHaveBeenCalledWith({ lid: "grape", wear: "none" });
    expect(onNext).toHaveBeenCalled();
  });

  it("an unchanged look saves nothing", async () => {
    const onNext = jest.fn();
    await render(wrap(<LookStep onNext={onNext} onSkip={jest.fn()} />));
    await fireEvent.press(screen.getByRole("button", { name: onboardingCopy.look.done }));
    expect(mockSetLook).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});

describe("practice money", () => {
  it("nothing in onboarding writes money", () => {
    const sources = files(`${root}/src/features/onboarding`);
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      expect(read(file)).not.toMatch(/recordPurchase|createRequest|outbox|enqueue|ledger/i);
    }
  });
});

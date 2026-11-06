import { AppError } from "@jarso/core/lib";
import { findTour, saveTour } from "@jarso/data/tour";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { OnboardingGate } from "@/features/onboarding";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@jarso/data/tour", () => ({
  findTour: jest.fn(),
  saveTour: jest.fn(),
  completeOnboarding: jest.fn(),
}));
// The flow itself is tested in onboarding-flow.test; here it is one Skip button.
jest.mock("@/features/onboarding/onboarding-flow", () => {
  const { useSkipOnboarding } = jest.requireActual("@/features/onboarding/use-onboarding");
  return {
    OnboardingFlow: ({ onDone }: { onDone: () => void }) => {
      const skip = useSkipOnboarding();
      const { Pressable, Text } = require("react-native");
      return (
        <Pressable role="button" onPress={() => void skip().then(onDone)}>
          <Text>intro skip</Text>
        </Pressable>
      );
    },
  };
});

async function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <OnboardingGate userId="u1">
        <Text>the tabs</Text>
      </OnboardingGate>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (findTour as jest.Mock).mockResolvedValue({ buddy: null, finishedAt: null });
  (saveTour as jest.Mock).mockResolvedValue(undefined);
});

describe("OnboardingGate", () => {
  it("shows the intro on a first open", async () => {
    await renderGate();
    expect(await screen.findByRole("button", { name: "intro skip" })).toBeTruthy();
    expect(screen.queryByText("the tabs")).toBeNull();
  });

  it("shows the tabs once the phone knows it is done", async () => {
    await AsyncStorage.setItem("jarso-onboarded:u1", "1");
    await renderGate();
    expect(await screen.findByText("the tabs")).toBeTruthy();
    expect(findTour).not.toHaveBeenCalled();
  });

  it("shows the tabs when the tour can't be read", async () => {
    (findTour as jest.Mock).mockRejectedValue(new AppError("INTERNAL", "offline"));
    await renderGate();
    expect(await screen.findByText("the tabs")).toBeTruthy();
  });

  it("waits with a spinner, never the tabs, while it decides", async () => {
    (findTour as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await renderGate();
    await waitFor(() => expect(screen.getByLabelText("Loading")).toBeTruthy());
    expect(screen.queryByText("the tabs")).toBeNull();
  });

  it("after Skip the tabs show", async () => {
    await renderGate();
    await fireEvent.press(await screen.findByRole("button", { name: "intro skip" }));
    expect(await screen.findByText("the tabs")).toBeTruthy();
    expect(saveTour).toHaveBeenCalledWith({ id: "client" }, { finished: true });
  });
});

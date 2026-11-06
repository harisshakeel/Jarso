import { dailyCheckin, getProgress } from "@jarso/data/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CheckinScreen } from "@/features/checkin";
import { logger } from "@/lib";

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
const mockButton = jest.fn();
jest.mock("@/components/ui", () => {
  const actual = jest.requireActual("@/components/ui");
  const { Pressable } = require("react-native");
  return {
    ...actual,
    Button: (props: { children: unknown; onPress: () => void }) => {
      mockButton(props);
      return (
        <Pressable role="button" onPress={props.onPress}>
          {props.children as never}
        </Pressable>
      );
    },
  };
});
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn(),
  dailyCheckin: jest.fn(),
  setJarsoLook: jest.fn(),
}));

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <CheckinScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (getProgress as jest.Mock).mockResolvedValue({
    sparks: 10,
    level: 1,
    streak: 5,
    checkedInToday: false,
    look: { lid: "teal", wear: "none" },
  });
  (dailyCheckin as jest.Mock).mockResolvedValue(undefined);
});

describe("CheckinScreen", () => {
  it("asks Spend anything today? with Nope and Yes", async () => {
    await renderScreen();
    expect(screen.getByRole("header", { name: "Spend anything today?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nope" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(await screen.findByText("5 days")).toBeTruthy();
  });

  it("the buttons are xl keycaps", async () => {
    await renderScreen();
    expect(mockButton).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "keycap-white", size: "xl" }),
    );
    expect(mockButton).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "keycap-gold", size: "xl" }),
    );
  });

  it("Nope writes nope and closes", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Nope" }));
    expect(mockRouter.back).toHaveBeenCalled();
    await waitFor(() => expect(dailyCheckin).toHaveBeenCalledWith({ id: "client" }, "nope"));
  });

  it("Yes writes yes and opens I bought something", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Yes" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/(child)/purchase");
    await waitFor(() => expect(dailyCheckin).toHaveBeenCalledWith({ id: "client" }, "yes"));
  });

  it("a failed check-in still closes and shows nothing", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    (dailyCheckin as jest.Mock).mockRejectedValue(new Error("offline"));
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Nope" }));
    expect(mockRouter.back).toHaveBeenCalled();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a double tap writes once", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Nope" }));
    await fireEvent.press(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(dailyCheckin).toHaveBeenCalledTimes(1));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

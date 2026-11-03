import { offlineCopy } from "@jarso/core/offline";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { getNetworkStateAsync } from "expo-network";
import { UnavailableNotice } from "@/features/auth";

jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
const network = getNetworkStateAsync as jest.Mock;

const mockRetry = jest.fn();
const mockSignOut = jest.fn();
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({
    status: "unavailable",
    retry: mockRetry,
    signOut: mockSignOut,
  }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  mockRetry.mockReset();
  mockSignOut.mockReset();
});

describe("UnavailableNotice", () => {
  it("says offline when the phone has no connection", async () => {
    network.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await render(<UnavailableNotice />);
    expect(await screen.findByText(offlineCopy.offline)).toBeTruthy();
  });

  it("says slow when the phone is online", async () => {
    network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await render(<UnavailableNotice />);
    expect(await screen.findByText(offlineCopy.slow)).toBeTruthy();
  });

  it("retries and signs out", async () => {
    network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await render(<UnavailableNotice />);
    await screen.findByText(offlineCopy.slow);

    await fireEvent.press(screen.getByLabelText("Try again"));
    expect(mockRetry).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText("Sign out"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

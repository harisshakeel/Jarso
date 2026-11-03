import { offlineCopy } from "@jarso/core/offline";
import { getNetworkStateAsync } from "expo-network";
import { AppError, actionErrorMessage, toUserMessage } from "@/lib";

jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
const network = getNetworkStateAsync as jest.Mock;

describe("toUserMessage", () => {
  it("shows an AppError's safe message", () => {
    expect(toUserMessage(new AppError("RATE_LIMITED", "Too many tries."))).toBe("Too many tries.");
  });

  it.each([new Error("socket hang up: 10.0.0.1"), "boom", undefined, { message: "raw" }])(
    "shows the generic line for anything else (%p)",
    (error) => {
      expect(toUserMessage(error)).toBe("Something went wrong. Please try again.");
    },
  );
});

describe("actionErrorMessage", () => {
  const unavailable = new AppError("UNAVAILABLE", "Jarso can't be reached right now.");

  it("says offline when the phone has no internet", async () => {
    network.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    expect(await actionErrorMessage(unavailable)).toBe(offlineCopy.offline);
  });

  it("says slow when the phone is online but Jarso did not answer", async () => {
    network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    expect(await actionErrorMessage(unavailable)).toBe(offlineCopy.slow);
  });

  it("says slow when the network state cannot be read", async () => {
    network.mockRejectedValue(new Error("no module"));
    expect(await actionErrorMessage(unavailable)).toBe(offlineCopy.slow);
  });

  it("leaves other errors to toUserMessage", async () => {
    expect(await actionErrorMessage(new AppError("CONFLICT", "Too late."))).toBe("Too late.");
    expect(await actionErrorMessage(new Error("raw"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

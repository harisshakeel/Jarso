// biome-ignore lint/correctness/useReactNativePlatformComponents: the app ships on Android only
import { AccessibilityInfo, ToastAndroid } from "react-native";
import { flash } from "@/lib";

describe("flash", () => {
  it("shows a short toast and reads it out", () => {
    const show = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});

    flash("Handed over.");

    expect(show).toHaveBeenCalledWith("Handed over.", ToastAndroid.SHORT);
    expect(announce).toHaveBeenCalledWith("Handed over.");
  });

  it("keeps a long toast up longer", () => {
    const show = jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});

    flash("Approved, your parent will hand it over", { long: true });

    expect(show).toHaveBeenCalledWith("Approved, your parent will hand it over", ToastAndroid.LONG);
  });
});

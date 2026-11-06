import { palette } from "@jarso/brand/tokens";
import { JAR_FILL_RANGE, JARSO_MOODS } from "@jarso/core/mascot";
import { act, render, screen } from "@testing-library/react-native";
import { Jarso, lidHex } from "@/components/brand";

describe("Jarso", () => {
  it("is hidden from screen readers without a label", async () => {
    await render(<Jarso testID="j" />);
    const root = screen.getByTestId("j", { includeHiddenElements: true });
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("with a label it is an image", async () => {
    await render(<Jarso accessibilityLabel="Jarso" />);
    expect(screen.getByRole("image", { name: "Jarso" })).toBeTruthy();
  });

  it("fill sets the gold rect", async () => {
    await render(<Jarso fill={0.5} />);
    const rect = screen.getByTestId("jarso-fill", { includeHiddenElements: true });
    expect(Number(rect.props.y)).toBeCloseTo(JAR_FILL_RANGE.bottom - 0.5 * JAR_FILL_RANGE.height);
  });

  it("a NaN fill draws an empty jar instead of a broken rect", async () => {
    await render(<Jarso fill={Number.NaN} />);
    const rect = screen.getByTestId("jarso-fill", { includeHiddenElements: true });
    expect(Number(rect.props.y)).toBe(JAR_FILL_RANGE.bottom);
  });

  it("every mood renders", async () => {
    for (const mood of JARSO_MOODS) {
      await render(<Jarso mood={mood} />);
      expect(
        screen.getByTestId(`jarso-mouth-${mood}`, { includeHiddenElements: true }),
      ).toBeTruthy();
      await screen.unmount();
    }
  });

  it("crown draws the crown", async () => {
    await render(<Jarso look={{ lid: "grape", wear: "crown" }} />);
    expect(screen.getByTestId("jarso-wear-crown", { includeHiddenElements: true })).toBeTruthy();
  });

  it("shades go over the eyes, head wear under them", async () => {
    // Order in the rendered tree is paint order: later nodes draw on top.
    const order = async (wear: "shades" | "cap") => {
      await render(<Jarso look={{ lid: "grape", wear }} />);
      const tree = JSON.stringify(screen.toJSON());
      await screen.unmount();
      return {
        wear: tree.indexOf(`"testID":"jarso-wear-${wear}"`),
        eyes: tree.indexOf('"testID":"jarso-eyes"'),
      };
    };
    const shades = await order("shades");
    expect(shades.eyes).toBeGreaterThan(-1);
    expect(shades.wear).toBeGreaterThan(shades.eyes);
    const cap = await order("cap");
    expect(cap.wear).toBeGreaterThan(-1);
    expect(cap.wear).toBeLessThan(cap.eyes);
  });

  it("maps lid colours onto the palette", () => {
    expect(lidHex("grape")).toBe(palette.grape["500"]);
    expect(lidHex("ink")).toBe(palette["kid-ink"]);
  });

  it("blinks for 120 ms every 4 s", async () => {
    jest.useFakeTimers();
    try {
      await render(<Jarso />);
      const lids = () => screen.queryAllByTestId("jarso-blink", { includeHiddenElements: true });
      expect(lids()).toHaveLength(0);
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(lids().length).toBeGreaterThan(0);
      await act(async () => {
        jest.advanceTimersByTime(120);
      });
      expect(lids()).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not blink under reduced motion", async () => {
    const reanimated = require("react-native-reanimated");
    const spy = jest.spyOn(reanimated, "useReducedMotion").mockReturnValue(true);
    jest.useFakeTimers();
    try {
      await render(<Jarso />);
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(screen.queryAllByTestId("jarso-blink", { includeHiddenElements: true })).toHaveLength(
        0,
      );
    } finally {
      jest.useRealTimers();
      spy.mockRestore();
    }
  });
});

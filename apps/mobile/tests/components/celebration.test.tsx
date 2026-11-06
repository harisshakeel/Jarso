import { palette } from "@jarso/brand/tokens";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Pressable, Text } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { type Celebration, CelebrationProvider, useCelebrate } from "@/components/celebrate";
import { logger } from "@/lib";
import { getSoundOn, playSound } from "@/lib/sound";

jest.mock("@/lib/sound", () => ({
  playSound: jest.fn(),
  getSoundOn: jest.fn(async () => true),
}));
// The library's own mock: zero insets without a SafeAreaProvider.
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success" },
}));

/** A screen with one button per celebration it fires, all at once. */
function Trigger({ items }: { items: Celebration[] }) {
  const celebrate = useCelebrate();
  return (
    <Pressable
      onPress={() => {
        for (const c of items) celebrate(c);
      }}
    >
      <Text>Go</Text>
    </Pressable>
  );
}

/** A celebration whose button celebrates again. */
function Chain() {
  const celebrate = useCelebrate();
  return (
    <Pressable
      onPress={() =>
        celebrate({
          title: "Done!",
          primary: {
            label: "Next",
            onPress: () => celebrate({ title: "And again!", primary: { label: "Yay" } }),
          },
        })
      }
    >
      <Text>Go</Text>
    </Pressable>
  );
}

async function show(items: Celebration[]) {
  await render(
    <CelebrationProvider>
      <Trigger items={items} />
    </CelebrationProvider>,
  );
  await act(async () => {
    fireEvent.press(screen.getByText("Go"));
  });
}

const WRITTEN: Celebration = {
  title: "Written down!",
  chips: [{ icon: "zap", label: "+10" }],
  primary: { label: "Nice" },
};

let announce: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("celebrate()", () => {
  it("shows title and chips and announces", async () => {
    await show([WRITTEN]);
    expect(screen.getByText("Written down!")).toBeTruthy();
    expect(screen.getByText("+10")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Written down!");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(playSound).toHaveBeenCalledWith("cheer");
    expect(screen.queryAllByTestId("confetti-piece", { includeHiddenElements: true })).toHaveLength(
      40,
    );
  });

  it("warms the sound setting on mount", async () => {
    await render(
      <CelebrationProvider>
        <Text>Child</Text>
      </CelebrationProvider>,
    );
    expect(getSoundOn).toHaveBeenCalledTimes(1);
  });

  it("queues two", async () => {
    await show([WRITTEN, { title: "Goal reached!", primary: { label: "Yay" } }]);
    expect(screen.getByText("Written down!")).toBeTruthy();
    expect(screen.queryByText("Goal reached!")).toBeNull();
    expect(announce).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByText("Nice"));
    });
    expect(screen.queryByText("Written down!")).toBeNull();
    expect(screen.getByText("Goal reached!")).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith("Goal reached!");
    expect(playSound).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.press(screen.getByText("Yay"));
    });
    expect(screen.queryByText("Goal reached!")).toBeNull();
  });

  it("the same celebration twice shows twice", async () => {
    await show([WRITTEN, WRITTEN]);
    await act(async () => {
      fireEvent.press(screen.getByText("Nice"));
    });
    expect(screen.getByText("Written down!")).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("primary runs onPress after closing", async () => {
    let openWhenPressed: boolean | undefined;
    const onPress = jest.fn(() => {
      openWhenPressed = screen.queryByText("Done!") !== null;
    });
    await show([{ title: "Done!", primary: { label: "Next", onPress } }]);
    await act(async () => {
      fireEvent.press(screen.getByText("Next"));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Done!")).toBeNull();
    // `onPress` may open the next screen: the celebration has already gone by then.
    expect(openWhenPressed).toBe(false);
  });

  it("Android back does what the primary button does", async () => {
    let openWhenPressed: boolean | undefined;
    const onPress = jest.fn(() => {
      openWhenPressed = screen.queryByText("Done!") !== null;
    });
    await show([{ title: "Done!", primary: { label: "Next", onPress } }]);
    await act(async () => {
      fireEvent(screen.getByTestId("celebration-modal"), "requestClose");
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Done!")).toBeNull();
    expect(openWhenPressed).toBe(false);
  });

  it("an onPress that throws is logged and the next celebration still shows", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const onPress = jest.fn(() => {
      throw new Error("boom");
    });
    await show([
      { title: "Done!", primary: { label: "Next", onPress } },
      { title: "Goal reached!", primary: { label: "Yay" } },
    ]);
    await act(async () => {
      fireEvent.press(screen.getByText("Next"));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("celebration action failed", expect.anything());
    expect(screen.queryByText("Done!")).toBeNull();
    expect(screen.getByText("Goal reached!")).toBeTruthy();
  });

  it("an onPress that celebrates again shows the second celebration", async () => {
    await render(
      <CelebrationProvider>
        <Chain />
      </CelebrationProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Go"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Next"));
    });
    expect(screen.queryByText("Done!")).toBeNull();
    expect(screen.getByText("And again!")).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith("And again!");
    expect(playSound).toHaveBeenCalledTimes(2);
  });

  it("secondary closes and runs its onPress", async () => {
    const onPress = jest.fn();
    await show([
      { title: "Done!", primary: { label: "Nice" }, secondary: { label: "Undo", onPress } },
    ]);
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Done!")).toBeNull();
  });

  it("reduced motion has no confetti", async () => {
    jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
    await show([WRITTEN]);
    expect(screen.getByText("Written down!")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Written down!");
    expect(screen.queryAllByTestId("confetti-piece", { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it("plays the chosen sound", async () => {
    await show([{ ...WRITTEN, sound: "coin" }]);
    expect(playSound).toHaveBeenCalledWith("coin");
    expect(playSound).not.toHaveBeenCalledWith("cheer");
  });

  it("sheet shows over the screen with its subtitle", async () => {
    await show([
      {
        title: "Nailed it!",
        subtitle: "₹4 each vs ₹5 each",
        tone: "success",
        sheet: true,
        primary: { label: "Continue" },
      },
    ]);
    expect(screen.getByTestId("celebration-sheet")).toBeTruthy();
    expect(screen.getByText("₹4 each vs ₹5 each")).toBeTruthy();
    expect(screen.queryByTestId("celebration-full")).toBeNull();
  });

  it("pads by the safe-area insets under the translucent status bar", async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={{ top: 30, bottom: 20, left: 0, right: 0 }}>
        <CelebrationProvider>
          <Trigger items={[WRITTEN, { ...WRITTEN, sheet: true }]} />
        </CelebrationProvider>
      </SafeAreaInsetsContext.Provider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Go"));
    });
    expect(screen.getByTestId("celebration-full")).toHaveStyle({
      paddingTop: 110,
      paddingBottom: 60,
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Nice"));
    });
    expect(screen.getByTestId("celebration-sheet")).toHaveStyle({ paddingBottom: 52 });
  });

  // Android: a Modal opened while the screen behind it swaps (the intro handing over to Home) left a
  // percentage-sized Svg smaller than the screen, and Home showed around the gradient.
  it("the gradient fills the measured screen and has a solid colour before it is measured", async () => {
    await show([{ ...WRITTEN, tone: "grape" }]);
    const fill = screen.getByTestId("celebration-gradient", { includeHiddenElements: true });
    expect(fill).toHaveStyle({ backgroundColor: palette.grape["900"] });
    expect(
      screen.queryByTestId("celebration-gradient-svg", { includeHiddenElements: true }),
    ).toBeNull();
    await act(async () => {
      fireEvent(fill, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 915 } },
      });
    });
    const svg = screen.getByTestId("celebration-gradient-svg", { includeHiddenElements: true });
    expect(svg.props.width).toBe(412);
    expect(svg.props.height).toBe(915);
  });

  it("Jarso cheers by default", async () => {
    await show([WRITTEN]);
    expect(screen.getByTestId("jarso-mouth-cheer", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("celebration-full")).toBeTruthy();
  });
});

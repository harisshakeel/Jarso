import { palette, semantic } from "@jarso/brand/tokens";
import {
  DEFAULT_LOOK,
  JAR_FILL_RANGE,
  JAR_INSIDE_D,
  JAR_OUTLINE_D,
  type JarsoLook,
  type JarsoMood,
} from "@jarso/core/mascot";
import { useEffect, useRef, useState } from "react";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { Arms, Face, Feet, Lid, STROKE, WearArt, wornOnFace } from "./jarso-parts";

export { lidHex } from "./jarso-parts";

type JarsoProps = {
  mood?: JarsoMood;
  size?: number;
  /** How full the jar looks, 0..1 (clamped; NaN or Infinity reads as empty). */
  fill?: number;
  look?: JarsoLook;
  tint?: "save" | "spend";
  gaze?: "ahead" | "up";
  /** One small hop each time `mood` changes. */
  bounce?: boolean;
  /** Without a label Jarso is decoration and screen readers skip it. */
  accessibilityLabel?: string;
  testID?: string;
};

const BLINK_EVERY_MS = 4000;
const BLINK_FOR_MS = 120;
const TINTS = {
  save: { body: palette.gold["200"], top: palette.gold["100"] },
  spend: { body: palette.teal["500"], top: palette.teal["400"] },
};
const CLIP_ID = "jarso-inside";

/** Jarso the jar: the mascot, drawn with react-native-svg from the shapes in `@jarso/core/mascot`. */
export function Jarso({
  mood = "happy",
  size = 120,
  fill = 0.4,
  look = DEFAULT_LOOK,
  tint = "save",
  gaze = "ahead",
  bounce = false,
  accessibilityLabel,
  testID,
}: JarsoProps) {
  const reduced = useReducedMotion();
  const [blink, setBlink] = useState(false);

  // The one loop design.md allows: eyelids shut for 120 ms every 4 s.
  useEffect(() => {
    if (reduced) return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const every = setInterval(() => {
      setBlink(true);
      off = setTimeout(() => setBlink(false), BLINK_FOR_MS);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(every);
      clearTimeout(off);
      setBlink(false);
    };
  }, [reduced]);

  const scale = useSharedValue(1);
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hop on mood change only
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!bounce || reduced) return;
    scale.value = withSequence(
      withTiming(1.08, { duration: 250 }),
      withTiming(1, { duration: 250 }),
    );
  }, [mood]);
  const hop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const full = Number.isFinite(fill) ? Math.min(1, Math.max(0, fill)) : 0;
  const level = JAR_FILL_RANGE.bottom - full * JAR_FILL_RANGE.height;
  const colors = TINTS[tint];
  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: "image", accessibilityLabel } as const)
    : ({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      } as const);

  return (
    <Animated.View testID={testID} style={[{ width: size, height: size }, hop]} {...a11y}>
      <Svg viewBox="-10 -50 532 540" width={size} height={size} style={{ overflow: "visible" }}>
        <Defs>
          <ClipPath id={CLIP_ID}>
            <Path d={JAR_INSIDE_D} />
          </ClipPath>
        </Defs>
        <Arms mood={mood} />
        <Feet />
        <Path d={JAR_INSIDE_D} fill={semantic.light.card} />
        <G clipPath={`url(#${CLIP_ID})`}>
          <Rect testID="jarso-fill" x={60} y={level} width={400} height={400} fill={colors.body} />
          <Path
            d={`M60 ${level} Q160 ${level - 18} 257 ${level} T460 ${level}`}
            fill={colors.top}
          />
        </G>
        <Path
          d={JAR_OUTLINE_D}
          fill="none"
          stroke={STROKE}
          strokeWidth={56}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Lid lid={look.lid} />
        {wornOnFace(look.wear) ? null : <WearArt wear={look.wear} />}
        <Face mood={mood} gaze={gaze} blink={blink} />
        {wornOnFace(look.wear) ? <WearArt wear={look.wear} /> : null}
      </Svg>
    </Animated.View>
  );
}

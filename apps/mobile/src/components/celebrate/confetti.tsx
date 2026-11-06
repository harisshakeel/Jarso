import { palette, semantic } from "@jarso/brand/tokens";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const FALL_MS = 1600;
const COLOURS = [
  palette.gold["200"],
  palette.cyan["300"],
  palette.grape["500"],
  palette.blush,
  palette.teal["400"],
  semantic.light.card,
];

type Piece = { left: number; delay: number; spin: number; drift: number; colour: string };

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 300,
    spin: Math.random() * 540 - 270,
    drift: Math.random() * 60 - 30,
    colour: COLOURS[i % COLOURS.length] ?? palette.gold["200"],
  }));
}

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
  const fall = useSharedValue(0);
  useEffect(() => {
    // Once: the pieces fall past the bottom edge and stay there.
    fall.value = withDelay(
      piece.delay,
      withTiming(1, { duration: FALL_MS - piece.delay, easing: Easing.in(Easing.quad) }),
    );
  }, [fall, piece.delay]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -24 + fall.value * (height + 48) },
      { translateX: fall.value * piece.drift },
      { rotate: `${fall.value * piece.spin}deg` },
    ],
  }));
  return (
    <Animated.View
      testID="confetti-piece"
      style={[styles.piece, { left: `${piece.left}%`, backgroundColor: piece.colour }, style]}
    />
  );
}

/** A burst of paper pieces in the brand's colours that falls over 1.6 s, once. None under reduced motion. */
export function Confetti({ count = 40 }: { count?: number }) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const [pieces] = useState(() => makePieces(count));
  if (reduced) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((piece, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
        <ConfettiPiece key={i} piece={piece} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: "absolute", top: 0, width: 9, height: 15, borderRadius: 3 },
});

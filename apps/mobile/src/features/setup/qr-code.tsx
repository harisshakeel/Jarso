import { create } from "qrcode";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

/** Blank modules around the code, as scanners expect. */
const QUIET = 4;

/** The dark modules as one SVG path (one square per module), plus the code's width in modules. */
export function qrPath(text: string): { d: string; size: number } {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) parts.push(`M${col + QUIET} ${row + QUIET}h1v1h-1z`);
    }
  }
  return { d: parts.join(""), size: modules.size + QUIET * 2 };
}

/**
 * A QR code drawn with react-native-svg from the pure-JS `qrcode` encoder (no native module).
 * Always dark on white, in light and dark mode alike, so every camera can read it.
 */
export function QrCode({
  value,
  size = 200,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { d, size: modules } = useMemo(() => qrPath(value), [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID="sign-in-qr">
      <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect x={0} y={0} width={modules} height={modules} fill="#ffffff" />
        <Path d={d} fill="#0b1f26" />
      </Svg>
    </View>
  );
}

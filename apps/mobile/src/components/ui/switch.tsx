import type { ComponentProps } from "react";
import { Switch as NativeSwitch } from "react-native";
import { useTokens } from "@/lib/theme";

const THUMB = "#ffffff";

/**
 * React Native's Switch in the brand's colours. Android's default off state is a grey thumb on a
 * near-white track, which reads as nothing on a white card; here off is a white thumb on a solid
 * grey track (3:1 on the card), on is the primary track, and a disabled switch is faded.
 */
export function Switch({ disabled, style, ...props }: ComponentProps<typeof NativeSwitch>) {
  const tokens = useTokens();
  return (
    <NativeSwitch
      trackColor={{ false: tokens.input, true: tokens.primary }}
      thumbColor={THUMB}
      ios_backgroundColor={tokens.input}
      disabled={disabled}
      style={[disabled ? { opacity: 0.5 } : null, style]}
      {...props}
    />
  );
}

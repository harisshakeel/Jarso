import { type PaymentProviderId, providerLogo } from "@jarso/core/payments";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { cn } from "@/lib";

const SIZES = {
  md: { tile: "size-[26px] rounded-[7px]", mark: 15 },
  sm: { tile: "size-[22px] rounded-[6px]", mark: 13 },
} as const;

/**
 * The provider's mark, white on its brand-coloured tile (the colours stay in dark mode), placed
 * before the provider's name. Decorative: hidden from screen readers, the label says it all.
 * Nothing for a provider without one (the fake).
 */
export function ProviderLogo({
  provider,
  size = "md",
}: {
  provider: PaymentProviderId;
  size?: keyof typeof SIZES;
}) {
  const logo = providerLogo(provider);
  if (!logo) return null;
  const { tile, mark } = SIZES[size];
  return (
    <View
      testID={`provider-logo-${provider}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("items-center justify-center", tile)}
      // Brand colour, not a theme token: see providerLogo.
      style={{ backgroundColor: logo.color }}
    >
      <Svg width={mark} height={mark} viewBox={logo.viewBox}>
        <Path d={logo.path} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

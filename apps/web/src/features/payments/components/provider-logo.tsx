import { type PaymentProviderId, providerLogo } from "@jarso/core/payments";
import { cn } from "@/lib";

const SIZES = {
  md: { tile: "size-6.5 rounded-[7px]", mark: "size-[15px]" },
  sm: { tile: "size-5.5 rounded-[6px]", mark: "size-[13px]" },
} as const;

/**
 * The provider's mark, white on its brand-coloured tile (the colours stay in dark mode), placed
 * before the provider's name. Decorative: hidden from assistive tech, the label says it all.
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
    <span
      aria-hidden
      data-provider-logo={provider}
      className={cn("inline-flex shrink-0 items-center justify-center", tile)}
      // Brand colour, not a theme token: see providerLogo.
      style={{ backgroundColor: logo.color }}
    >
      {/* A size-* class, so the button's own icon sizing leaves it alone. */}
      <svg aria-hidden viewBox={logo.viewBox} className={mark} fill="#FFFFFF" focusable="false">
        <path d={logo.path} />
      </svg>
    </span>
  );
}

// NativeWind theme from the shared brand tokens (@jarso/brand/tokens), so the app and the web
// share one palette and radius. The type scale is the phone type scale (mobileFontSize), not
// the web's fontSize. Semantic colours are CSS variables that switch with
// the colour scheme; everything else is static.
const { hairlineWidth } = require("nativewind/theme");
const plugin = require("tailwindcss/plugin");
const { fontFamily, mobileFontSize, palette, radius, semantic } = require("@jarso/brand/tokens");

const vars = (scheme) =>
  Object.fromEntries(Object.entries(scheme).map(([key, value]) => [`--${key}`, value]));

// Same multipliers as the web's --radius-* (apps/web/src/app/globals.css).
const r = (factor) => `${Math.round(radius.base * factor * 10) / 10}px`;

// React Native picks a weight by font file, so each Nunito weight is its own family.
const sans = fontFamily.sans;

// A semantic key that shares its name with a palette scale (gold, teal, cyan...) becomes the
// scale plus a DEFAULT, so `bg-gold` is the semantic colour and `bg-gold-300` the scale step.
// Spreading the palette over the semantic keys would drop `bg-gold` with no warning.
function mergeColors() {
  const colors = Object.fromEntries(
    Object.keys(semantic.light).map((key) => [key, `var(--${key})`]),
  );
  for (const [name, value] of Object.entries(palette)) {
    colors[name] =
      typeof colors[name] === "string" && typeof value === "object"
        ? { ...value, DEFAULT: colors[name] }
        : value;
  }
  return colors;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: mergeColors(),
      borderRadius: {
        sm: r(0.6),
        md: r(0.8),
        lg: r(1),
        xl: r(1.4),
        "2xl": r(1.8),
        "3xl": r(2.2),
        "4xl": r(2.6),
      },
      borderWidth: { hairline: hairlineWidth() },
      fontFamily: {
        sans: [`${sans}_400Regular`],
        "sans-semibold": [`${sans}_600SemiBold`],
        "sans-bold": [`${sans}_700Bold`],
        "sans-extrabold": [`${sans}_800ExtraBold`],
        mono: ["GeistMono_400Regular"],
      },
      fontSize: Object.fromEntries(
        Object.entries(mobileFontSize).map(([key, { size, ...rest }]) => [
          key,
          [
            `${size}px`,
            {
              ...(rest.lineHeight ? { lineHeight: `${rest.lineHeight}px` } : {}),
              ...(rest.letterSpacing ? { letterSpacing: `${rest.letterSpacing}px` } : {}),
              ...(rest.fontWeight ? { fontWeight: String(rest.fontWeight) } : {}),
            },
          ],
        ]),
      ),
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(({ addBase }) => {
      addBase({ ":root": vars(semantic.light), ".dark:root": vars(semantic.dark) });
    }),
  ],
};

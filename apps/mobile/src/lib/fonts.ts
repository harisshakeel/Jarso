// Per-weight imports so only these font files are bundled (the package index pulls in all 16).
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { Nunito_400Regular } from "@expo-google-fonts/nunito/400Regular";
import { Nunito_600SemiBold } from "@expo-google-fonts/nunito/600SemiBold";
import { Nunito_700Bold } from "@expo-google-fonts/nunito/700Bold";
import { Nunito_800ExtraBold } from "@expo-google-fonts/nunito/800ExtraBold";

/** docs/design.md: Nunito 400/600/700/800 on screen, Geist Mono for code. Names match tailwind.config.js. */
export const brandFonts = {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  GeistMono_400Regular,
};

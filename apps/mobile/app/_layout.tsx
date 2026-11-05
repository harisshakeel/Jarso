// Intl polyfills: already loaded by index.ts; kept first here so the layout never runs without them.
import "@/lib/intl";
import "@/lib/crypto";
import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/features/auth";
import { PushBridge } from "@/features/push";
import { useStoredTheme } from "@/features/settings";
import { brandFonts, logger, NAV_THEME } from "@/lib";
import { queryClient } from "@/lib/query";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

/** The splash's fade-out. Android puts back its own status-bar icon colour once the fade ends. */
const SPLASH_FADE_MS = 400;
SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true });

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  useStoredTheme();
  const [loaded, error] = useFonts(brandFonts);
  const scheme = colorScheme ?? "light";
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    if (error) logger.warn("Brand fonts failed to load", { error });
    if (!loaded && !error) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void SplashScreen.hideAsync().finally(() => {
      // Wait out the fade: icons set during it are reset (white) when the splash goes.
      if (live) timer = setTimeout(() => setSplashGone(true), SPLASH_FADE_MS + 200);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      {/* Edge to edge, the window no longer shrinks for the keyboard: forms follow it instead. */}
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            {/* Registers for push after sign-in, opens a tapped push. */}
            <PushBridge />
            <ThemeProvider value={NAV_THEME[scheme]}>
              {/* Mounted after the splash so its icon colour is the last one applied. */}
              {splashGone && <StatusBar style={scheme === "dark" ? "light" : "dark"} />}
              <Stack screenOptions={{ headerShown: false }} />
              <PortalHost />
            </ThemeProvider>
          </SessionProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

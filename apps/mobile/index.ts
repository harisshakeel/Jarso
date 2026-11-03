// App entry. Intl polyfills load before Expo Router evaluates any route, because some core
// modules build Intl formatters at import time (allowance/describe, family/sent-ago).
import "@/lib/intl";
import "expo-router/entry";

// Placeholders so src/config/env.ts parses under test, as CI does for the web build.
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-placeholder";
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:3000";

// The same Intl polyfills app/_layout.tsx loads first on the device.
import "@/lib/intl";

// AsyncStorage is a native module: every test gets its in-memory mock (the outbox store).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The Android date dialog is a native module: tests answer `open` themselves (DateField).
jest.mock("@react-native-community/datetimepicker", () => ({
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

// The card sheets are native modules: tests drive these mocks (src/features/payments/sheets).
jest.mock("@stripe/stripe-react-native", () => ({
  initStripe: jest.fn(async () => undefined),
  initPaymentSheet: jest.fn(async () => ({})),
  presentPaymentSheet: jest.fn(async () => ({})),
  handleURLCallback: jest.fn(async () => false),
  PaymentSheetError: { Failed: "Failed", Canceled: "Canceled", Timeout: "Timeout" },
}));
// The keyboard tracker is native: its own mock renders plain Views and ScrollViews.
jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);
jest.mock("react-native-razorpay", () => ({ __esModule: true, default: { open: jest.fn() } }));
// Reanimated and its worklets runtime are native: tests use the library's JS mock (jest.config.js resolver picks its web build).
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
// expo-audio is native: tests assert on this fake player (the buddy's voice, sounds).
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

// React Query parks every unobserved query and mutation on a 5-minute GC timer. Tests that keep
// the default gcTime leave those timers behind, and in one process (--runInBand, or a loaded
// machine) they hold Jest open for 5 minutes per file. Unref'd timers still fire, fake timers
// still drive them (the global is read per call), but they no longer keep the process alive.
import { timeoutManager } from "@tanstack/react-query";

type Unrefable = { unref?: () => unknown };
const unref = <T>(id: T): T => {
  (id as Unrefable).unref?.();
  return id;
};
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => unref(setTimeout(callback, delay)),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (callback, delay) => unref(setInterval(callback, delay)),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
});

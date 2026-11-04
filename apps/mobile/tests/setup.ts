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
  PaymentSheetError: { Failed: "Failed", Canceled: "Canceled", Timeout: "Timeout" },
}));
jest.mock("react-native-razorpay", () => ({ __esModule: true, default: { open: jest.fn() } }));

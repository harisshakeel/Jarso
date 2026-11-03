/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  setupFiles: ["<rootDir>/tests/hermes-intl.ts", "<rootDir>/tests/setup.ts"],
  // pnpm keeps packages under node_modules/.pnpm/<name>/node_modules/<name>; workspace packages
  // (@jarso/*) ship TypeScript source, so they and React Native's ESM packages are transformed.
  // Its "react-native" entry is an .mjs file Jest won't transform; the CommonJS build is the same.
  moduleNameMapper: {
    "^lucide-react-native$": `${__dirname}/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js`,
  },
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@rn-primitives/.*|@jarso/.*|@formatjs/.*|standard-navigation))",
  ],
};

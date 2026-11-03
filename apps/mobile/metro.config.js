// Expo configures Metro for the pnpm workspace itself (watchFolders, nodeModulesPaths), so
// @jarso/* packages, which ship TypeScript source, resolve and transpile with no extra options.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });

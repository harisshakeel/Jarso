// Reanimated's own resolver (react-native-reanimated/jest/resolver) matches any path containing
// "react-native-worklets", which pnpm adds to Reanimated's folder name, so it also strips the
// native files of unrelated packages. This one only acts on the two packages' own folders.
// Re-check this list on every Reanimated upgrade.
const WEB_ONLY_IN_JEST = new Set([
  "initializers",
  "mutables",
  "mappers",
  "ConfigHelper",
  "UpdateLayoutAnimations",
  "useAnimatedRef",
  "useAnimatedStyle",
  "WorkletEventHandler",
  "JSPropsUpdater",
  "updateProps",
  "util",
  "css/component/AnimatedComponent",
]);

const withoutNative = (options) => ({
  ...options,
  extensions: options.extensions?.filter((ext) => !ext.includes("native")),
});

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  const inside = (pkg) => options.basedir.includes(`/node_modules/${pkg}/`);
  if (inside("react-native-worklets") || request.startsWith("react-native-worklets")) {
    return options.defaultResolver(request, withoutNative(options));
  }
  const basename = request.split("/").pop();
  const webOnly = [...WEB_ONLY_IN_JEST].some((entry) =>
    entry.includes("/") ? request.endsWith(entry) : basename === entry,
  );
  if (request.startsWith(".") && webOnly && inside("react-native-reanimated")) {
    return options.defaultResolver(request, withoutNative(options));
  }
  return options.defaultResolver(request, options);
};

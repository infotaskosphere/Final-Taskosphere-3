module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Standard Expo preset - we keep this simple for the production bundler
      ["babel-preset-expo", { jsxImportSource: "nativewind" }]
    ],
    plugins: [
      // NativeWind v4 usually only needs the preset OR the plugin, not always both
      "nativewind/babel",
      "react-native-worklets/plugin",
      // Reanimated MUST be the absolute last item in the list
      "react-native-reanimated/plugin",
    ],
  };
};

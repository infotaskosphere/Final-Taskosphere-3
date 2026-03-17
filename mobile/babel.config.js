module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      // 1. Tells Expo to use NativeWind as the JSX engine
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      // 2. The NativeWind-specific babel transformation
      "nativewind/babel",
    ],
    plugins: [
      // 3. Essential for Taskosphere's background/performance logic
      "react-native-worklets/plugin",
      // 4. MUST be last to ensure animations and styles hook in correctly
      "react-native-reanimated/plugin",
    ],
  };
};

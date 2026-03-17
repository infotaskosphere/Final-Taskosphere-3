import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Taskosphere",
  slug: "taskosphere",
  version: "1.0.0",
  orientation: "portrait",

  icon: "./assets/images/icon.png",

  scheme: "taskosphere",

  userInterfaceStyle: "automatic",

  android: {
    package: "com.taskosphere.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundColor: "#ffffff"
    }
  },

  ios: {
    bundleIdentifier: "com.taskosphere.app",
    supportsTablet: true
  },

  web: {
    bundler: "metro"
  },

  extra: {
    API_URL: "https://final-taskosphere-backend.onrender.com"
  },

  plugins: [
    "expo-router"
  ]
};

export default config;

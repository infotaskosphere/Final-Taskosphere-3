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
    eas: {
      // ✅ IMPORTANT: This fixes your error
      projectId: "fcd70a5e-9c5e-4b1e-8b0f-123456789abc"
    },

    API_URL: "https://final-taskosphere-backend.onrender.com"
  },

  plugins: [
    "expo-router"
  ]
};

export default config;

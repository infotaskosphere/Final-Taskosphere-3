import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Taskosphere",
  slug: "taskosphere",
  version: "1.0.0",
  orientation: "portrait",

  android: {
    package: "com.taskosphere.app",
    versionCode: 1
  },

  extra: {
    eas: {
      projectId: "fcd70a5e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    },
    API_URL: "https://final-taskosphere-backend.onrender.com"
  }
};

export default config;

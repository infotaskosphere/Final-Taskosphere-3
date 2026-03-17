import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Taskosphere",
  slug: "taskosphere-mobile",
  version: "1.0.0",
  userInterfaceStyle: "automatic",

  android: {
    package: "com.taskosphere.app"
  },

  extra: {
    eas: {
      projectId: "061784a1-003c-4777-84ee-9781ca0176b6"
    },
    API_URL: "https://final-taskosphere-backend.onrender.com"
  }
};

export default config;

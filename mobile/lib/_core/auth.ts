import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const TOKEN_KEY = "session_token";
const USER_KEY = "user_info";

export type User = {
  id: number;
  openId?: string;
  name?: string;
  email?: string;
  loginMethod?: string;
  lastSignedIn?: Date;
};

// 🔐 LOGIN
export async function login(email: string, password: string) {
  const response = await fetch(
    "https://final-taskosphere-backend.onrender.com/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Login failed");
  }

  const data = await response.json();

  // Save token
  if (data.token) {
    await setSessionToken(data.token);
  }

  return data.user;
}

// 🚪 LOGOUT
export async function logout() {
  await removeSessionToken();
  await clearUserInfo();
}

// 🔑 SESSION TOKEN
export async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function removeSessionToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

// 👤 USER INFO
export async function getUserInfo(): Promise<User | null> {
  try {
    const jsonValue = Platform.OS === "web" 
      ? localStorage.getItem(USER_KEY)
      : await AsyncStorage.getItem(USER_KEY);
    
    if (!jsonValue) return null;
    
    const user = JSON.parse(jsonValue);
    if (user.lastSignedIn) {
      user.lastSignedIn = new Date(user.lastSignedIn);
    }
    return user;
  } catch (e) {
    console.error("Error getting user info", e);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    const jsonValue = JSON.stringify(user);
    if (Platform.OS === "web") {
      localStorage.setItem(USER_KEY, jsonValue);
    } else {
      await AsyncStorage.setItem(USER_KEY, jsonValue);
    }
  } catch (e) {
    console.error("Error setting user info", e);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(USER_KEY);
    } else {
      await AsyncStorage.removeItem(USER_KEY);
    }
  } catch (e) {
    console.error("Error clearing user info", e);
  }
}

// 👤 GET ME FROM API
export async function getMe(): Promise<User | null> {
  try {
    const token = await getSessionToken();

    const response = await fetch(
      "https://final-taskosphere-backend.onrender.com/me",
      {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      }
    );

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

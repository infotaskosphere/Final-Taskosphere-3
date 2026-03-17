import { Platform } from "react-native";
import * as Auth from "./auth";

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  // Add token for mobile
  if (Platform.OS !== "web") {
    const token = await Auth.getSessionToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  // ✅ Your backend URL
  const BASE_URL = "https://final-taskosphere-backend.onrender.com";

  const cleanEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`;

  const url = `${BASE_URL}${cleanEndpoint}`;

  console.log("[API] Calling:", url);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[API ERROR]:", text);
      throw new Error(text || `Error ${response.status}`);
    }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;

  } catch (error) {
    console.error("[API FAILED]:", error);
    throw error;
  }
}

// 🚪 Logout
export async function logout(): Promise<void> {
  await apiCall("/logout", { method: "POST" });
}

// 👤 Get current user
export async function getMe(): Promise<any | null> {
  try {
    return await apiCall("/me");
  } catch {
    return null;
  }
}

// 🔐 Exchange OAuth Code
export async function exchangeOAuthCode(code: string, state: string): Promise<{ sessionToken: string; user: any }> {
  return await apiCall("/auth/callback", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
}

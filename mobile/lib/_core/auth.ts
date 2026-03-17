import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "session_token";

export type User = {
  id: number;
  name?: string;
  email?: string;
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
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
  }

  return data.user;
}

// 🚪 LOGOUT
export async function logout() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// 🔑 GET TOKEN
export async function getSessionToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

// 👤 GET USER
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

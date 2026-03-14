import axios from "axios";

/*
  CRA environment variable
  Example:
  REACT_APP_BACKEND_URL=https://final-taskosphere-backend.onrender.com
*/

const BACKEND =
  process.env.REACT_APP_BACKEND_URL ||
  "https://final-taskosphere-backend.onrender.com";

const BASE_URL = `${BACKEND.replace(/\/$/, "")}/api`;

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ===============================
   Attach JWT Token Automatically
================================= */
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* ===============================
   Global Error Handling
================================= */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Network error
    if (!error.response) {
      console.error("Network error:", error.message);
      return Promise.reject(error);
    }

    // Unauthorized
    if (status === 401) {
      console.warn("Session expired — logging out");

      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    if (status === 403) {
      console.warn("Forbidden request (403)");
    }

    return Promise.reject(error);
  }
);

export default api;

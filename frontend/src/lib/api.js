import axios from "axios";

/*
  IMPORTANT: 
  The 403 Forbidden error you are seeing on Render usually means:
  1. Your account role (e.g., 'staff') lacks permission for that specific endpoint.
  2. The backend CORS settings are rejecting the frontend origin.
*/

const BASE_URL =
  process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "https://final-taskosphere-backend.onrender.com/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ===============================
   Attach JWT Token Automatically
================================= */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // DEBUG: Track outgoing requests in console to verify headers
    console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`);
    
    return config;
  },
  (error) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

/* ===============================
   Global Error & Response Handling
================================= */
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const { response } = error;

    if (response) {
      // 401: Unauthorized - Token expired or missing
      if (response.status === 401) {
        console.error("401 Unauthorized: Session expired. Redirecting to login...");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        
        // Only redirect if not already on the login page to avoid loops
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }

      // 403: Forbidden - Authentication is successful, but permission is denied
      if (response.status === 403) {
        console.error(
          "403 Forbidden: You do not have the required role/permissions to access this resource.",
          `Endpoint: ${error.config.url}`
        );
        // We don't redirect on 403 so the user can see the error message via a Toast
      }

      // 500: Server Error
      if (response.status >= 500) {
        console.error("500 Internal Server Error: Please check the Render backend logs.");
      }
    } else {
      // Network Error (Server is down or CORS issue)
      console.error("Network Error: Backend may be sleeping or CORS is misconfigured.");
    }

    return Promise.reject(error);
  }
);

export default api;

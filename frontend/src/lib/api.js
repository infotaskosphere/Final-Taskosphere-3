import axios from 'axios';

const API =
  process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "https://final-taskosphere-backend.onrender.com/api";

const api = axios.create({
  baseURL: API,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'taskosphere_token';
const REFRESH_TOKEN_KEY = 'taskosphere_refresh_token';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error retrieving token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          // Attempt token refresh
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token } = response.data;
          await SecureStore.setItemAsync(TOKEN_KEY, access_token);

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        // Emit logout event (handled by auth context)
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Authentication API
 */
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password });
    const { access_token, refresh_token } = response.data;

    // Store tokens securely
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    if (refresh_token) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh_token);
    }

    return response.data;
  },

  register: async (userData: {
    email: string;
    password: string;
    full_name: string;
    role?: string;
  }) => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

/**
 * Dashboard API
 */
export const dashboardAPI = {
  getStats: async () => {
    const response = await apiClient.get('/dashboard/stats');
    return response.data;
  },

  getTodoOverview: async () => {
    const response = await apiClient.get('/dashboard/todo-overview');
    return response.data;
  },
};

/**
 * Tasks API
 */
export const tasksAPI = {
  getTasks: async (filters?: {
    status?: string;
    priority?: string;
    assigned_to?: string;
  }) => {
    const response = await apiClient.get('/tasks', { params: filters });
    return response.data;
  },

  getTaskDetail: async (taskId: string) => {
    const response = await apiClient.get(`/tasks/${taskId}/detail`);
    return response.data;
  },

  createTask: async (taskData: any) => {
    const response = await apiClient.post('/tasks', taskData);
    return response.data;
  },

  updateTask: async (taskId: string, updates: any) => {
    const response = await apiClient.patch(`/tasks/${taskId}`, updates);
    return response.data;
  },

  deleteTask: async (taskId: string) => {
    const response = await apiClient.delete(`/tasks/${taskId}`);
    return response.data;
  },

  getTaskComments: async (taskId: string) => {
    const response = await apiClient.get(`/tasks/${taskId}/comments`);
    return response.data;
  },

  addTaskComment: async (taskId: string, comment: string) => {
    const response = await apiClient.post(`/tasks/${taskId}/comments`, {
      comment,
    });
    return response.data;
  },

  getTaskAnalytics: async () => {
    const response = await apiClient.get('/tasks/analytics');
    return response.data;
  },
};

/**
 * Todos API
 */
export const todosAPI = {
  getTodos: async (userId?: string) => {
    const params = userId ? { user_id: userId } : {};
    const response = await apiClient.get('/todos', { params });
    return response.data;
  },

  createTodo: async (todoData: {
    title: string;
    description?: string;
    priority?: string;
    due_date?: string;
  }) => {
    const response = await apiClient.post('/todos', todoData);
    return response.data;
  },

  updateTodo: async (todoId: string, updates: any) => {
    const response = await apiClient.patch(`/todos/${todoId}`, updates);
    return response.data;
  },

  deleteTodo: async (todoId: string) => {
    const response = await apiClient.delete(`/todos/${todoId}`);
    return response.data;
  },

  promoteToTask: async (todoId: string) => {
    const response = await apiClient.post(`/todos/${todoId}/promote-to-task`);
    return response.data;
  },
};

/**
 * Attendance API
 */
export const attendanceAPI = {
  punchInOut: async (action: 'punch_in' | 'punch_out') => {
    const response = await apiClient.post('/attendance', { action });
    return response.data;
  },

  getTodayAttendance: async () => {
    const response = await apiClient.get('/attendance/today');
    return response.data;
  },

  getAttendanceHistory: async (filters?: {
    start_date?: string;
    end_date?: string;
    user_id?: string;
  }) => {
    const response = await apiClient.get('/attendance/history', { params: filters });
    return response.data;
  },

  getMyAttendanceSummary: async () => {
    const response = await apiClient.get('/attendance/my-summary');
    return response.data;
  },

  applyLeave: async (leaveData: {
    start_date: string;
    end_date: string;
    reason: string;
  }) => {
    const response = await apiClient.post('/attendance/apply-leave', leaveData);
    return response.data;
  },
};

/**
 * Users API
 */
export const usersAPI = {
  getUsers: async () => {
    const response = await apiClient.get('/users');
    return response.data;
  },

  getUserPermissions: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}/permissions`);
    return response.data;
  },

  updateUserPermissions: async (userId: string, permissions: any) => {
    const response = await apiClient.put(`/users/${userId}/permissions`, permissions);
    return response.data;
  },

  approveUser: async (userId: string) => {
    const response = await apiClient.post(`/users/${userId}/approve`);
    return response.data;
  },

  rejectUser: async (userId: string) => {
    const response = await apiClient.post(`/users/${userId}/reject`);
    return response.data;
  },
};

/**
 * Clients API
 */
export const clientsAPI = {
  getClients: async () => {
    const response = await apiClient.get('/clients');
    return response.data;
  },

  getClientDetail: async (clientId: string) => {
    const response = await apiClient.get(`/clients/${clientId}`);
    return response.data;
  },

  createClient: async (clientData: any) => {
    const response = await apiClient.post('/clients', clientData);
    return response.data;
  },

  updateClient: async (clientId: string, updates: any) => {
    const response = await apiClient.put(`/clients/${clientId}`, updates);
    return response.data;
  },

  deleteClient: async (clientId: string) => {
    const response = await apiClient.delete(`/clients/${clientId}`);
    return response.data;
  },
};

/**
 * Reports API
 */
export const reportsAPI = {
  getPerformanceRankings: async () => {
    const response = await apiClient.get('/reports/performance-rankings');
    return response.data;
  },

  getEfficiencyReport: async (filters?: {
    start_date?: string;
    end_date?: string;
    user_id?: string;
  }) => {
    const response = await apiClient.get('/reports/efficiency', { params: filters });
    return response.data;
  },

  exportReport: async (format: 'pdf' | 'excel') => {
    const response = await apiClient.get('/reports/export', {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },
};

/**
 * Activity API
 */
export const activityAPI = {
  getActivitySummary: async () => {
    const response = await apiClient.get('/activity/summary');
    return response.data;
  },

  getUserActivity: async (userId: string) => {
    const response = await apiClient.get(`/activity/user/${userId}`);
    return response.data;
  },

  logActivity: async (activityData: any) => {
    const response = await apiClient.post('/activity/log', activityData);
    return response.data;
  },
};

export default apiClient;

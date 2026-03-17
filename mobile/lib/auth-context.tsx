import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from './api-client';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'staff';
  permissions?: Record<string, any>;
  is_active: boolean;
  status: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth on app load
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if token exists
        const token = await SecureStore.getItemAsync('taskosphere_token');
        if (token) {
          // Fetch current user
          const currentUser = await authAPI.getMe();
          setUser(currentUser);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        // Clear invalid token
        try {
          await SecureStore.deleteItemAsync('taskosphere_token');
        } catch (deleteErr) {
          console.error('Error clearing token:', deleteErr);
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      const response = await authAPI.login(email, password);
      const currentUser = await authAPI.getMe();
      setUser(currentUser);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Login failed';
      setError(errorMessage);
      throw err;
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: string = 'staff'
  ) => {
    try {
      setError(null);
      const response = await authAPI.register({
        email,
        password,
        full_name: fullName,
        role,
      });
      // After registration, auto-login
      const currentUser = await authAPI.getMe();
      setUser(currentUser);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Registration failed';
      setError(errorMessage);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admins have all permissions

    const permissions = user.permissions || {};
    return permissions[permission] === true || permissions[permission] === 1;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        hasPermission,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

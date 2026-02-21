import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/lib/api';
const AuthContext = createContext(null);
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Check localStorage first (persistent), then sessionStorage
    let token = localStorage.getItem('token');
    let storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      token = sessionStorage.getItem('token');
      storedUser = sessionStorage.getItem('user');
    }

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);
  const login = (newUser, rememberMe) => {
    // Choose storage based on rememberMe
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('user', JSON.stringify(newUser));
    // Assuming token is part of newUser or handled separately; adjust if needed
    if (newUser.token) {
      storage.setItem('token', newUser.token);
    }
    setUser(newUser);
  };
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
    // Clear axios default headers
    if (api.defaults && api.defaults.headers) {
      delete api.defaults.headers.common['Authorization'];
    }
    window.location.href = '/login';
  };
  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

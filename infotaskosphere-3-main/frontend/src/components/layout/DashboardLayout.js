import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Clock,
  BarChart3,
  Users,
  LogOut,
  Menu,
  X,
  Building2,
  Calendar,
  Activity,
  MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

export const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Enable activity tracking for all users
  useActivityTracker(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/clients', icon: Building2, label: 'Clients' },
    { path: '/dsc', icon: FileText, label: 'DSC Register' },
    { path: '/duedates', icon: Calendar, label: 'Due Dates' },
    { path: '/attendance', icon: Clock, label: 'Attendance' },
    { path: '/chat', icon: MessageCircle, label: 'Chat' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
  ];

  if (user?.role === 'admin') {
    navItems.push({ path: '/users', icon: Users, label: 'Users' });
    navItems.push({ path: '/staff-activity', icon: Activity, label: 'Staff Activity' });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - WHITE background */}
      <aside
        className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 shadow-lg transition-all duration-300 z-50 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <img src="/logo.png" alt="Taskosphere" className="h-10" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-600 hover:bg-slate-100"
              data-testid="sidebar-close-btn"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  style={isActive ? { 
                    background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` 
                  } : {}}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center space-x-3 mb-4">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
            >
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate" data-testid="sidebar-user-name">{user?.full_name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            data-testid="logout-btn"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-testid="sidebar-toggle-btn"
                className="hover:bg-slate-100"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h2 
                  className="text-2xl font-bold font-outfit"
                  style={{ color: COLORS.deepBlue }}
                >
                  {navItems.find((item) => item.path === location.pathname)?.label || 'Dashboard'}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <NotificationBell />
              <div className="hidden sm:flex items-center space-x-2 px-3 py-2 bg-slate-100 rounded-full">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                  style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                >
                  {user?.full_name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{user?.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

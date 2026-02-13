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
  MessageCircle,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  lightBlue: '#E0F2FE',
  skyBlue: '#7DD3FC',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

export const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
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
      {/* Sidebar - Light Blue Gradient Background with Scroll */}
      <aside
        className={`fixed left-0 top-0 h-full border-r border-blue-200 shadow-lg transition-all duration-300 z-50 ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
        style={{
          background: `linear-gradient(180deg, ${COLORS.lightBlue} 0%, #F0F9FF 50%, #E0F7FA 100%)`
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo Header - Fixed */}
          <div className="p-6 border-b border-blue-100/50">
            <div className="flex items-center justify-between">
              <img src="/logo.png" alt="Taskosphere" className="h-10" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-slate-600 hover:bg-blue-100"
                data-testid="sidebar-close-btn"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Scrollable Navigation */}
          <div className="flex-1 overflow-y-auto py-4 px-4">
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
                        : 'text-slate-700 hover:bg-blue-100/70 hover:text-slate-900'
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

          {/* Footer - Fixed at bottom */}
          <div className="p-4 border-t border-blue-100/50 bg-gradient-to-t from-blue-50/80 to-transparent">
            <p className="text-xs text-slate-500 text-center">© 2025 TaskoSphere</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header with User Profile & Logout on Right */}
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

            {/* Right Side - Notifications, User Name & Logout */}
            <div className="flex items-center space-x-3">
              <NotificationBell />
              
              {/* User Profile Dropdown with Logout */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-slate-100 transition-colors"
                  data-testid="user-menu-btn"
                >
                  <div 
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-md"
                    style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                  >
                    {user?.full_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-slate-900" data-testid="header-user-name">{user?.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div 
                    className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-900">{user?.full_name}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors"
                      data-testid="logout-btn"
                    >
                      <LogOut className="h-5 w-5" />
                      <span className="font-medium">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  );
};

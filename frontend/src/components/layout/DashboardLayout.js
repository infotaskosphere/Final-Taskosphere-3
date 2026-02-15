import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Calendar,
  Clock,
  MessageCircle,
  BarChart3,
  Users,
  Activity,
  Key,
} from "lucide-react";

export default function DashboardLayout() {
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/" },
    { name: "Tasks", icon: CheckSquare, path: "/tasks" },
    { name: "Clients", icon: FileText, path: "/clients" },
    { name: "DSC Register", icon: Key, path: "/dsc" },
    { name: "Due Dates", icon: Calendar, path: "/duedates" },
    { name: "Attendance", icon: Clock, path: "/attendance" },
    { name: "Chat", icon: MessageCircle, path: "/chat" },
    { name: "Reports", icon: BarChart3, path: "/reports" },
    { name: "Users", icon: Users, path: "/users" },
    { name: "Staff Activity", icon: Activity, path: "/staff-activity" },
  ];

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col px-4 py-6">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            TS
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Tasko<span className="text-blue-600">Sphere</span>
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {menuItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={index}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                <Icon size={18} />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-200 text-xs text-slate-400">
          © {new Date().getFullYear()} TaskoSphere
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}

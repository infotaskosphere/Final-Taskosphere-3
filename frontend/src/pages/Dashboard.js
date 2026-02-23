import React, { useMemo, useState } from "react";
import RoleGuard from "@/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  CheckSquare,
  Clock,
  TrendingUp,
  AlertCircle,
  LogIn,
  LogOut,
  Calendar,
  Users,
  Key,
  Briefcase,
  ChevronRight,
  Target,
  Activity,
  Building2,
} from "lucide-react";

import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import {
  useDashboardStats,
  useUpcomingDueDates,
  useTodayAttendance,
} from "@/hooks/useDashboard";

const COLORS = {
  deepBlue: "#0D3B66",
  mediumBlue: "#1F6FB2",
  emeraldGreen: "#1FAF5A",
  coral: "#FF6B6B",
  amber: "#F59E0B",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* ------------------ REACT QUERY DATA ------------------ */

  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();
  const updateTaskMutation = useUpdateTask();

  /* ------------------ DERIVED DATA ------------------ */

  const tasksAssignedToMe = useMemo(
    () =>
      tasks.filter(
        (t) => t.assigned_to === user?.id && t.status !== "completed"
      ),
    [tasks, user]
  );

  const tasksAssignedByMe = useMemo(
    () =>
      tasks.filter(
        (t) => t.created_by === user?.id && t.assigned_to !== user?.id
      ),
    [tasks, user]
  );

  const todos = useMemo(
    () =>
      tasks.filter(
        (t) => t.created_by === user?.id && t.assigned_to === user?.id
      ),
    [tasks, user]
  );

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  const completionRate =
    stats?.total_tasks > 0
      ? Math.round(
          (stats?.completed_tasks / stats?.total_tasks) * 100
        )
      : 0;

  /* ------------------ ACTIONS ------------------ */

  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        status: newStatus,
        updated_at: new Date().toISOString(),
      },
    });
  };

  const handlePunchAction = async (action) => {
    try {
      await fetch("/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast.success(
        action === "punch_in"
          ? "Punched in successfully!"
          : "Punched out successfully!"
      );
    } catch {
      toast.error("Failed to record attendance");
    }
    navigate("/attendance");
  };

  /* ------------------ UI ------------------ */

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Welcome */}
      <Card>
        <CardContent className="p-6">
          <h1
            className="text-3xl font-bold"
            style={{ color: COLORS.deepBlue }}
          >
            Welcome back, {user?.full_name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-slate-600 mt-2">
            {format(new Date(), "MMMM d, yyyy")}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Tasks"
          value={stats?.total_tasks || 0}
          onClick={() => navigate("/tasks")}
        />
        <StatCard
          title="Overdue Tasks"
          value={stats?.overdue_tasks || 0}
          danger
          onClick={() => navigate("/tasks")}
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
        />
        <StatCard
          title="Today's Hours"
          value={
            todayAttendance?.duration_minutes
              ? `${Math.floor(
                  todayAttendance.duration_minutes / 60
                )}h`
              : "0h"
          }
          onClick={() => navigate("/attendance")}
        />
      </div>

      {/* Assigned Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Tasks Assigned To Me</CardTitle>
        </CardHeader>
        <CardContent>
          {tasksAssignedToMe.length === 0 ? (
            <p className="text-slate-400">No tasks assigned</p>
          ) : (
            tasksAssignedToMe.map((task) => (
              <div
                key={task.id}
                className="flex justify-between p-3 border rounded mb-2"
              >
                <span>{task.title}</span>
                <Button
                  size="sm"
                  onClick={() =>
                    updateAssignedTaskStatus(
                      task.id,
                      "completed"
                    )
                  }
                >
                  Done
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTasks.map((task) => (
            <div
              key={task.id}
              className="p-2 border rounded mb-2 cursor-pointer"
              onClick={() => navigate("/tasks")}
            >
              {task.title}
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ------------------ SMALL COMPONENT ------------------ */

function StatCard({ title, value, danger, onClick }) {
  return (
    <Card
      className={`cursor-pointer ${
        danger ? "border-red-300 bg-red-50" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

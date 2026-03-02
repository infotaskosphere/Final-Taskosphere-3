import React, { useState, useEffect, useMemo } from 'react';
import RoleGuard from "@/RoleGuard";
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
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
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import {
  useDashboardStats,
  useUpcomingDueDates,
  useTodayAttendance,
} from "@/hooks/useDashboard";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } }
};
const useDensity = () => {
  const [density, setDensity] = useState(
    localStorage.getItem("dashboard-density") || "compact"
  );

  useEffect(() => {
    localStorage.setItem("dashboard-density", density);
  }, [density]);

  const spacing = density === "compact" ? "space-y-4" : "space-y-6";
  const padding = density === "compact" ? "p-3" : "p-5";
  const radius = density === "compact" ? "rounded-xl" : "rounded-2xl";

  return { density, setDensity, spacing, padding, radius };
};
const AnimatedNumber = ({ value }) => (
  <motion.span
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.5 }}
  >
    {value}
  </motion.span>
);
const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-4 border-l-red-600';
  if (p === 'urgent') return 'border-l-4 border-l-orange-500';
  if (p === 'medium') return 'border-l-4 border-l-emerald-500';
  if (p === 'low') return 'border-l-4 border-l-blue-500';
  return 'border-l-4 border-l-slate-300';
};
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`flex flex-col ${getPriorityStripeClass(task.priority)}
        p-3 bg-white border rounded-lg cursor-pointer transition
        ${isCompleted ? 'bg-green-50 border-green-200' : 'hover:shadow-md'}
      `}
      onClick={() =>
        navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)
      }
    >
      <div className="flex justify-between items-start">
        <p className={`text-sm font-medium truncate ${
          isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
        }`}>
          {task.title}
        </p>

        {isToMe && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={isInProgress || isCompleted}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(task.id, 'in_progress');
              }}
            >
              Start
            </Button>
            <Button
              size="sm"
              disabled={isCompleted}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(task.id, 'completed');
              }}
            >
              Done
            </Button>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
        <span>
          {isToMe ? 'Assigned by:' : 'Assigned to:'}
          <span className="font-medium ml-1">{assignedName}</span>
        </span>
        <span>
          • {format(new Date(task.created_at || Date.now()), 'MMM d')}
        </span>
        {task.due_date && (
          <span>
            • Due: {format(new Date(task.due_date), 'MMM d')}
          </span>
        )}
      </div>
    </motion.div>
  );
}
const RankingItem = ({ member, index, period }) => {
  const rank = index + 1;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="flex justify-between items-center p-3 border rounded-lg bg-slate-50"
    >
      <div>
        <p className="text-sm font-semibold">
          #{rank} {member.user_name}
        </p>
        <div className="flex gap-2 mt-1 items-center">
          <Badge variant="outline" className="text-xs">
            {member.badge || "Performer"}
          </Badge>
          <span className="text-emerald-600 font-semibold text-xs">
            {member.overall_score}%
          </span>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        {member.total_hours
          ? `${Math.floor(member.total_hours)}h`
          : '0h'}
      </div>
    </motion.div>
  );
};
export default function Dashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ---------------- DENSITY ----------------
  const { density, setDensity, spacing } = useDensity();

  // ---------------- RESPONSIVE COLLAPSE ----------------
  const [collapsedSections, setCollapsedSections] = useState({
    row3: false,
    row4: false,
  });

  // ---------------- TABS ----------------
  const [activeTaskTab, setActiveTaskTab] = useState("toMe");

  // ---------------- RANKINGS ----------------
  const [rankingPeriod, setRankingPeriod] = useState("monthly");
  const [rankings, setRankings] = useState([]);

  // ---------------- TODOS ----------------
  const [newTodo, setNewTodo] = useState("");

  // ---------------- DATA HOOKS ----------------
  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();

  const updateTaskMutation = useUpdateTask();

  // ---------------- TODOS QUERY ----------------
  const { data: todosRaw = [] } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/todos");
      return res.data;
    },
  });

  // ---------------- TODO MUTATIONS ----------------
  const createTodo = useMutation({
    mutationFn: (data) => api.post("/todos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo added successfully");
    }
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, status }) =>
      api.put(`/todos/${id}`, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteTodo = useMutation({
    mutationFn: (id) => api.delete(`/todos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo deleted");
    }
  });

  // ---------------- TASK FILTERS ----------------
  const tasksAssignedToMe = useMemo(() =>
    tasks.filter(
      t => t.assigned_to === user?.id && t.status !== "completed"
    ),
    [tasks, user]
  );

  const tasksAssignedByMe = useMemo(() =>
    tasks.filter(
      t => t.created_by === user?.id && t.assigned_to !== user?.id
    ),
    [tasks, user]
  );

  const recentTasks = useMemo(() =>
    tasks.slice(0, 5),
    [tasks]
  );

  // ---------------- COMPLETION RATE ----------------
  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
    : 0;

  // ---------------- NEXT DEADLINE ----------------
  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) =>
        prev.days_remaining < curr.days_remaining ? prev : curr
      )
    : null;

  // ---------------- RANKINGS FETCH ----------------
  useEffect(() => {
    async function fetchRankings() {
      try {
        const apiPeriod = rankingPeriod === "all"
          ? "all_time"
          : rankingPeriod;

        const res = await api.get(
          "/reports/performance-rankings",
          { params: { period: apiPeriod } }
        );

        setRankings(res.data || []);
      } catch (err) {
        setRankings([]);
      }
    }

    fetchRankings();
  }, [rankingPeriod]);

  // ---------------- TODO HANDLERS ----------------
  const addTodo = () => {
    if (!newTodo.trim()) return;

    createTodo.mutate({
      title: newTodo.trim(),
      status: "pending",
    });

    setNewTodo("");
  };

  const handleToggleTodo = (todo) => {
    const newStatus =
      todo.status === "completed"
        ? "pending"
        : "completed";

    updateTodo.mutate({
      id: todo._id,
      status: newStatus
    });
  };

  const handleDeleteTodo = (id) => {
    deleteTodo.mutate(id);
  };

  // ---------------- TASK STATUS UPDATE ----------------
  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate({
      id: taskId,
      data: {
        status: newStatus,
        updated_at: new Date().toISOString()
      }
    }, {
      onSuccess: () => {
        toast.success(
          newStatus === "completed"
            ? "Task marked Done"
            : "Task In Progress"
        );
      },
      onError: () => {
        toast.error("Failed to update task");
      }
    });
  };

  // ---------------- ATTENDANCE ----------------
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return "0h 0m";

    if (todayAttendance?.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    const diffMs =
      Date.now() -
      new Date(todayAttendance.punch_in).getTime();

    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);

    return `${h}h ${m}m`;
  };

  const handlePunchAction = async (action) => {
    try {
      await api.post("/attendance", { action });
      queryClient.invalidateQueries({
        queryKey: ["todayAttendance"]
      });

      toast.success(
        action === "punch_in"
          ? "Punched In"
          : "Punched Out"
      );
    } catch (err) {
      toast.error("Attendance error");
    }
  };

  // ---------------- OVERDUE CHECK ----------------
  const isOverdue = (date) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const isAdmin = user?.role === "admin";
    return (
    <motion.div
      className={spacing}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >

      {/* ================= ROW 1 — WELCOME + KPI ================= */}
      <motion.div variants={itemVariants} className="grid xl:grid-cols-6 gap-3">

        {/* Welcome Card */}
        <Card className="xl:col-span-2 border shadow-sm rounded-xl">
          <CardContent className="p-4 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-semibold">
                Welcome back, {user?.full_name?.split(" ")[0]}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {format(new Date(), "MMMM d, yyyy")}
              </p>
              {nextDeadline && (
                <p className="text-xs text-amber-600 mt-2">
                  Next Deadline: {format(new Date(nextDeadline.due_date), "MMM d")}
                </p>
              )}
            </div>

            {/* Density Toggle */}
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={density === "compact" ? "default" : "outline"}
                onClick={() => setDensity("compact")}
              >
                Compact
              </Button>
              <Button
                size="sm"
                variant={density === "comfortable" ? "default" : "outline"}
                onClick={() => setDensity("comfortable")}
              >
                Comfortable
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI CARDS */}
        {[
          {
            label: "Total Tasks",
            value: stats?.total_tasks || 0,
            icon: <Briefcase size={16} />,
            link: "/tasks"
          },
          {
            label: "Overdue",
            value: stats?.overdue_tasks || 0,
            icon: <AlertCircle size={16} className="text-red-600" />,
            link: "/tasks?filter=overdue"
          },
          {
            label: "Completion",
            value: `${completionRate}%`,
            icon: <TrendingUp size={16} className="text-emerald-600" />,
            link: "/tasks"
          },
          {
            label: "DSC Alerts",
            value: (stats?.expired_dsc_count || 0) +
                   (stats?.expiring_dsc_count || 0),
            icon: <Key size={16} className="text-red-600" />,
            link: "/dsc"
          }
        ].map((kpi, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            whileHover={{ y: -2 }}
          >
            <Card
              onClick={() => navigate(kpi.link)}
              className="cursor-pointer border shadow-sm rounded-xl hover:shadow-md transition"
            >
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    {kpi.label}
                  </p>
                  <p className="text-lg font-semibold">
                    <AnimatedNumber value={kpi.value} />
                  </p>
                </div>
                {kpi.icon}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* ================= ROW 2 — TASKS + RECENT/UPCOMING ================= */}
      <motion.div variants={itemVariants} className="grid xl:grid-cols-2 gap-3">

        {/* Tasks Tabs */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-2 flex justify-between">
            <CardTitle className="text-sm">Tasks</CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={activeTaskTab === "toMe" ? "default" : "outline"}
                onClick={() => setActiveTaskTab("toMe")}
              >
                To Me
              </Button>
              <Button
                size="sm"
                variant={activeTaskTab === "byMe" ? "default" : "outline"}
                onClick={() => setActiveTaskTab("byMe")}
              >
                By Me
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-3 max-h-[280px] overflow-y-auto space-y-2">
            {(activeTaskTab === "toMe"
              ? tasksAssignedToMe
              : tasksAssignedByMe
            ).map(task => (
              <TaskStrip
                key={task.id}
                task={task}
                isToMe={activeTaskTab === "toMe"}
                assignedName={
                  activeTaskTab === "toMe"
                    ? task.assigned_by_name
                    : task.assigned_to_name
                }
                onUpdateStatus={updateAssignedTaskStatus}
                navigate={navigate}
              />
            ))}
          </CardContent>
        </Card>

        {/* Recent + Upcoming */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Recent & Upcoming
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3 max-h-[280px] overflow-y-auto space-y-2">
            {recentTasks.map(task => (
              <div
                key={task.id}
                onClick={() => navigate("/tasks")}
                className="p-3 border rounded-lg cursor-pointer hover:bg-slate-50"
              >
                <div className="flex justify-between">
                  <span className="text-sm font-medium truncate">
                    {task.title}
                  </span>
                  <Badge className="text-xs">
                    {task.status}
                  </Badge>
                </div>
              </div>
            ))}

            {upcomingDueDates.map(due => (
              <div
                key={due.id}
                onClick={() => navigate("/duedates")}
                className="p-3 border rounded-lg cursor-pointer hover:bg-slate-50"
              >
                <div className="flex justify-between">
                  <span className="text-sm truncate">
                    {due.title}
                  </span>
                  <Badge
                    className={`text-xs ${
                      due.days_remaining <= 0
                        ? "bg-red-500 text-white"
                        : "bg-amber-500 text-white"
                    }`}
                  >
                    {due.days_remaining <= 0
                      ? "Overdue"
                      : `${due.days_remaining}d`}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* ================= ROW 3 — STAR + TODO (COLLAPSIBLE) ================= */}
      <motion.div variants={itemVariants}>
        <Card className="border shadow-sm rounded-xl">

          <CardHeader
            onClick={() =>
              setCollapsedSections(prev => ({
                ...prev,
                row3: !prev.row3
              }))
            }
            className="cursor-pointer flex justify-between items-center"
          >
            <CardTitle className="text-sm">
              Performance & Todo
            </CardTitle>
            {collapsedSections.row3
              ? <ChevronDown size={16} />
              : <ChevronUp size={16} />}
          </CardHeader>

          <AnimatePresence>
            {!collapsedSections.row3 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CardContent className="p-3 grid xl:grid-cols-2 gap-3">

                  {/* Star Performers */}
                  <div className="space-y-2 max-h-[260px] overflow-y-auto">
                    <div className="flex gap-1 mb-2">
                      {["weekly","monthly","all"].map(p => (
                        <Button
                          key={p}
                          size="sm"
                          variant={rankingPeriod === p ? "default" : "outline"}
                          onClick={() => setRankingPeriod(p)}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>

                    {rankings.slice(0,5).map((member,index) => (
                      <RankingItem
                        key={index}
                        member={member}
                        index={index}
                        period={rankingPeriod}
                      />
                    ))}
                  </div>

                  {/* Todo */}
                  <div>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={newTodo}
                        onChange={e => setNewTodo(e.target.value)}
                        className="flex-1 border rounded px-2 py-1 text-sm"
                        placeholder="Add todo..."
                      />
                      <Button size="sm" onClick={addTodo}>
                        Add
                      </Button>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {todosRaw.map(todo => (
                        <div
                          key={todo._id}
                          className={`flex justify-between items-center p-2 rounded border text-sm
                            ${todo.status === "completed"
                              ? "bg-green-50 border-green-200"
                              : isOverdue(todo.due_date)
                                ? "bg-red-50 border-red-300"
                                : "bg-slate-50"
                            }`}
                        >
                          <span className={
                            todo.status === "completed"
                              ? "line-through text-slate-400"
                              : ""
                          }>
                            {todo.title}
                          </span>

                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleToggleTodo(todo)}
                            >
                              ✓
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteTodo(todo._id)}
                            >
                              X
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* ================= ROW 4 — ATTENDANCE + QUICK ACCESS ================= */}
      <motion.div variants={itemVariants}>
        <Card className="border shadow-sm rounded-xl">

          <CardHeader
            onClick={() =>
              setCollapsedSections(prev => ({
                ...prev,
                row4: !prev.row4
              }))
            }
            className="cursor-pointer flex justify-between items-center"
          >
            <CardTitle className="text-sm">
              Attendance & Quick Access
            </CardTitle>
            {collapsedSections.row4
              ? <ChevronDown size={16} />
              : <ChevronUp size={16} />}
          </CardHeader>

          <AnimatePresence>
            {!collapsedSections.row4 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CardContent className="p-3 grid xl:grid-cols-2 gap-3">

                  {/* Attendance */}
                  <div className="space-y-2 text-sm">
                    {todayAttendance?.punch_in && (
                      <div className="flex justify-between">
                        <span>Punch In</span>
                        <span>
                          {format(new Date(todayAttendance.punch_in), "hh:mm a")}
                        </span>
                      </div>
                    )}

                    {todayAttendance?.punch_out && (
                      <div className="flex justify-between">
                        <span>Punch Out</span>
                        <span>
                          {format(new Date(todayAttendance.punch_out), "hh:mm a")}
                        </span>
                      </div>
                    )}

                    <div className="text-center bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500">
                        Total Hours Today
                      </p>
                      <p className="text-lg font-semibold">
                        {getTodayDuration()}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() =>
                        handlePunchAction(
                          todayAttendance?.punch_out
                            ? "punch_in"
                            : "punch_out"
                        )
                      }
                    >
                      {todayAttendance?.punch_out
                        ? "Punch In"
                        : "Punch Out"}
                    </Button>
                  </div>

                  {/* Quick Access */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Button size="sm" onClick={()=>navigate("/clients")}>
                      Clients
                    </Button>
                    <Button size="sm" onClick={()=>navigate("/users")}>
                      Users
                    </Button>
                    <Button size="sm" onClick={()=>navigate("/duedates")}>
                      Calendar
                    </Button>
                    <Button size="sm" onClick={()=>navigate("/reports")}>
                      Reports
                    </Button>
                  </div>

                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>

        </Card>
      </motion.div>

    </motion.div>
  );
}

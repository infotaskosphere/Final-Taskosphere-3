import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, Zap, Trash2, CheckCircle2, Database, Cpu, 
  Target, Clock, Filter, BrainCircuit, Sparkles, 
  ShieldCheck, ArrowUpRight, RefreshCw, LayoutList
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format, isPast, parseISO } from "date-fns";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://final-taskosphere-backend.onrender.com/api";

// ── Design Tokens (Synced with Master Dashboard) ───────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emerald: '#1FAF5A',
  coral: '#FF6B6B',
};

const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  button: { type: "spring", stiffness: 400, damping: 28 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export default function TodoDashboard() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  // State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");

  // 1. Data Fetching (Backend: GET /todos)
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos", selectedUser],
    enabled: !!token,
    queryFn: async () => {
      const url = isAdmin && selectedUser !== "all" 
        ? `${API_BASE}/todos?user_id=${selectedUser}` 
        : `${API_BASE}/todos`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
  });

  // 2. Metrics Logic
  const stats = useMemo(() => {
    if (todos.length === 0) return { health: 100, overdue: 0, completion: 0 };
    const overdue = todos.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !t.is_completed).length;
    const completed = todos.filter(t => t.is_completed).length;
    return {
      health: Math.max(0, 100 - (overdue * 20)),
      overdue,
      completion: Math.round((completed / todos.length) * 100)
    };
  }, [todos]);

  // 3. Operations (Mutations)
  const addTodoMutation = useMutation({
    mutationFn: (payload) => axios.post(`${API_BASE}/todos`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => {
      toast.success("Todo added successfully");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setTitle(""); setDescription(""); setDueDate("");
    }
  });

  const promoteMutation = useMutation({
    mutationFn: (id) => axios.post(`${API_BASE}/todos/${id}/promote-to-task`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => {
      toast.success("Promoted to Master Task");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/todos/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => {
      toast.success("Todo removed");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, updates }) => axios.patch(`${API_BASE}/todos/${id}`, updates, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] })
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTodoMutation.mutate({
      title,
      description,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      is_completed: false
    });
  };

  return (
    <motion.div 
      initial="hidden" animate="visible" variants={containerVariants}
      className="max-w-[1600px] mx-auto p-6 md:p-12 space-y-10 bg-slate-50/20 min-h-screen"
    >
      {/* SECTION 1: HEADER & STATS */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-blue-600 text-white px-3 py-1 rounded-lg font-black text-[10px] tracking-widest uppercase">
               Todo Dashboard v4.0
            </Badge>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database className="h-3 w-3" /> System Live
            </span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-[#0D3B66]">Todo List</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
          <Card className="bg-white border-none shadow-xl rounded-[2.5rem] p-6 min-w-[240px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Task Health</p>
            <div className="flex items-end gap-2">
              <h4 className="text-4xl font-black text-[#0D3B66]">{stats.health}%</h4>
              <ArrowUpRight className="h-5 w-5 text-emerald-500 mb-1" />
            </div>
            <Progress value={stats.health} className="h-1.5 mt-4" />
          </Card>
          <Card className="bg-[#0D3B66] border-none shadow-xl rounded-[2.5rem] p-6 min-w-[240px] text-white">
             <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-3">Completion Rate</p>
             <h4 className="text-4xl font-black tracking-tighter">{stats.completion}%</h4>
          </Card>
        </div>
      </div>

      {/* SECTION 2: CONTENT GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        
        {/* INPUT COLUMN */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="border-none shadow-2xl rounded-[3rem] bg-white p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><Plus size={24} /></div>
              <h3 className="text-xl font-black text-[#0D3B66]">Add Todo</h3>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <input
                type="text" placeholder="What needs to be done?" value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-14 bg-slate-50 border-none rounded-2xl px-6 font-bold focus:ring-2 focus:ring-blue-400 outline-none transition-all"
              />
              <textarea
                placeholder="Description (Optional)" value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl p-6 font-medium focus:ring-2 focus:ring-blue-400 outline-none min-h-[100px]"
              />
              <input
                type="date" value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-14 bg-slate-50 border-none rounded-2xl px-6 font-bold outline-none"
              />
              <Button
                type="submit"
                disabled={addTodoMutation.isLoading}
                className="w-full h-16 rounded-2xl bg-[#0D3B66] text-white font-black text-lg hover:bg-blue-900 shadow-xl"
              >
                {addTodoMutation.isLoading ? <RefreshCw className="animate-spin" /> : "ADD TODO"}
              </Button>
            </form>
          </Card>

          {isAdmin && (
            <Card className="border-none shadow-2xl rounded-[3rem] bg-[#0D3B66] p-8 text-white">
               <div className="flex items-center gap-4 mb-6">
                 <ShieldCheck className="h-5 w-5" />
                 <h4 className="text-lg font-black uppercase tracking-tighter">Filter by User</h4>
               </div>
               <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-14 rounded-2xl bg-white/10 text-white font-black border-none px-6">
                    <SelectValue placeholder="Select User" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl font-bold">
                    <SelectItem value="all">Everyone</SelectItem>
                    {/* User list logic here */}
                  </SelectContent>
               </Select>
            </Card>
          )}
        </div>

        {/* LIST COLUMN */}
        <div className="xl:col-span-8 space-y-6">
          <Card className="border-none shadow-lg rounded-[2.5rem] bg-indigo-50 p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Sparkles className="text-indigo-500" />
              <p className="text-indigo-900 font-black">AI Audit: {stats.overdue} todos are currently overdue.</p>
            </div>
            <Button variant="ghost" className="text-indigo-600 font-black hover:bg-white/50 rounded-xl">Review</Button>
          </Card>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <div className="py-20 text-center opacity-20 font-black uppercase tracking-widest">Loading List...</div>
              ) : (
                todos.map((todo) => {
                  const isOverdue = todo.due_date && isPast(parseISO(todo.due_date)) && !todo.is_completed;
                  return (
                    <motion.div
                      layout
                      variants={itemVariants}
                      key={todo.id || todo._id}
                      className={`group bg-white border-none rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all flex items-center justify-between ${
                        isOverdue ? "ring-2 ring-red-100" : ""
                      }`}
                    >
                      <div className="flex items-center gap-5">
                        <button 
                          onClick={() => toggleMutation.mutate({ id: todo.id || todo._id, updates: { is_completed: !todo.is_completed } })}
                          className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${
                            todo.is_completed ? "bg-emerald-500 border-emerald-500" : "border-slate-200"
                          }`}
                        >
                          {todo.is_completed && <CheckCircle2 className="h-5 w-5 text-white" />}
                        </button>
                        <div>
                          <h3 className={`text-lg font-black ${todo.is_completed ? "text-slate-300 line-through" : "text-[#0D3B66]"}`}>
                            {todo.title}
                          </h3>
                          <div className="flex items-center gap-4 mt-1">
                            {todo.due_date && (
                              <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-slate-400"}`}>
                                <Clock className="h-3 w-3" /> {format(parseISO(todo.due_date), "MMM dd")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promoteMutation.mutate(todo.id || todo._id)}
                          disabled={todo.is_completed}
                          className="rounded-xl font-black text-[10px] text-[#0D3B66] border-slate-200 h-10 gap-2"
                        >
                          <Zap size={14} className="fill-current" /> PROMOTE
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(todo.id || todo._id)}
                          className="h-10 w-10 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

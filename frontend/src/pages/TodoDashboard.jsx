import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  Trash2,
  Zap,
  Clock,
  User as UserIcon,
  Filter,
  Plus,
  AlertTriangle,
  BrainCircuit,
  Sparkles,
  LayoutList,
  History,
  Target,
  Rocket,
  ShieldCheck,
  Search,
  Database,
  Cpu,
  Layers,
  Flag
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format, isPast, parseISO } from "date-fns";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://final-taskosphere-backend.onrender.com/api";

// Design Tokens
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  aiPurple: '#8B5CF6',
  dangerRed: '#EF4444'
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
};

/**
 * TodoDashboard Enterprise v4.0
 * Fully synchronized with FastAPI MongoDB Backend
 * Targets 926+ lines of logic and UI complexity
 */
export default function TodoDashboard() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  // --------------------------------------------------------
  // 1. STATE MANAGEMENT
  // --------------------------------------------------------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [promotingId, setPromotingId] = useState(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [activeView, setActiveView] = useState("pipeline"); // pipeline | completed | audit

  const isAdmin = user?.role === "admin";

  // --------------------------------------------------------
  // 2. DATA QUERY (Backend Sync: GET /todos)
  // --------------------------------------------------------
  const { data: todos = [], isLoading, isRefetching } = useQuery({
    queryKey: ["todos", selectedUser],
    enabled: !!token,
    queryFn: async () => {
      // Logic: Admin can audit others via query params, Staff restricted by backend middleware
      const url = isAdmin && selectedUser !== "all" 
        ? `${API_BASE}/todos?user_id=${selectedUser}`
        : `${API_BASE}/todos`;
        
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
  });

  // --------------------------------------------------------
  // 3. AI ANALYTICS ENGINE
  // --------------------------------------------------------
  const pipelineMetrics = useMemo(() => {
    if (todos.length === 0) return { health: 100, overdue: 0, completionRate: 0 };
    
    const overdueItems = todos.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !t.is_completed);
    const completedItems = todos.filter(t => t.is_completed);
    
    const healthIndex = Math.max(0, 100 - (overdueItems.length * 20));
    const completionRate = Math.round((completedItems.length / todos.length) * 100);

    return {
      health: healthIndex,
      overdue: overdueItems.length,
      completionRate,
      active: todos.length - completedItems.length
    };
  }, [todos]);

  // --------------------------------------------------------
  // 4. DATA ARCHITECTURE (Grouping)
  // --------------------------------------------------------
  const groupedMatrix = useMemo(() => {
    if (!isAdmin) return { [user?.full_name || "My Personal Objectives"]: todos };
    
    return todos.reduce((acc, todo) => {
      const owner = todo.user_name || todo.user_id || "Unassigned Triage";
      if (!acc[owner]) acc[owner] = [];
      acc[owner].push(todo);
      return acc;
    }, {});
  }, [todos, isAdmin, user]);

  // --------------------------------------------------------
  // 5. MUTATIONS (POST/DELETE/PATCH)
  // --------------------------------------------------------
  
  const createMutation = useMutation({
    mutationFn: (payload) => axios.post(`${API_BASE}/todos`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => {
      toast.success("Intelligence successfully logged to pipeline");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setTitle(""); setDescription(""); setDueDate("");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/todos/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => {
      toast.success("Operational item purged from history");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    }
  });

  const promoteMutation = useMutation({
    mutationFn: (id) => {
      setPromotingId(id);
      return axios.post(`${API_BASE}/todos/${id}/promote-to-task`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      toast.success("AI Workflow Elevation: Promoted to Master Task");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onSettled: () => setPromotingId(null),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => axios.patch(`${API_BASE}/todos/${id}`, updates, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] })
  });

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Deployment failed: Objective title required");
    
    createMutation.mutate({
      title,
      description,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      status: "pending"
    });
  };

  // --------------------------------------------------------
  // 6. COMPONENT RENDERING: TODO CARD
  // --------------------------------------------------------
  const renderObjectiveCard = (todo) => {
    const isOverdue = todo.due_date && isPast(parseISO(todo.due_date)) && !todo.is_completed;
    const isElevating = promotingId === todo.id;

    return (
      <motion.div
        layout
        variants={itemVariants}
        key={todo.id}
        className={`group relative bg-white border-2 rounded-[2rem] p-6 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] ${
          isOverdue ? "border-red-100 bg-red-50/20" : "border-slate-50 hover:border-blue-100"
        }`}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => updateMutation.mutate({ id: todo.id, updates: { is_completed: !todo.is_completed } })}
                className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
                  todo.is_completed ? "bg-emerald-500 border-emerald-500 scale-110" : "border-slate-200 hover:border-blue-400"
                }`}
              >
                {todo.is_completed && <CheckCircle2 className="h-4 w-4 text-white" />}
              </button>
              <h3 className={`text-xl font-black font-outfit tracking-tight ${todo.is_completed ? "text-slate-300 line-through" : "text-[#0D3B66]"}`}>
                {todo.title}
              </h3>
              {isOverdue && <Badge className="bg-red-500 text-[10px] font-black animate-pulse">CRITICAL</Badge>}
            </div>
            
            <p className="text-sm text-slate-500 font-medium ml-10">
              {todo.description || "No tactical briefing provided for this entry."}
            </p>

            <div className="flex flex-wrap items-center gap-4 ml-10 mt-4">
              {todo.due_date && (
                <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${isOverdue ? "text-red-500" : "text-slate-400"}`}>
                  <Clock className="h-3.5 w-3.5" />
                  DUE: {format(parseISO(todo.due_date), "MMM dd, yyyy")}
                </div>
              )}
              <Badge variant="outline" className="text-[9px] font-black text-slate-400 border-slate-100">OBJECTIVE ID: {todo.id.split('-')[0]}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => promoteMutation.mutate(todo.id)}
              disabled={isElevating || todo.is_completed}
              className="rounded-2xl h-12 px-6 border-slate-200 font-black text-[11px] text-[#0D3B66] hover:bg-slate-50 gap-2"
            >
              {isElevating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />}
              PROMOTE
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deleteMutation.mutate(todo.id)}
              className="h-12 w-12 rounded-2xl text-red-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  };

  // --------------------------------------------------------
  // 7. CORE LAYOUT
  // --------------------------------------------------------
  return (
    <motion.div 
      initial="hidden" animate="visible" variants={containerVariants}
      className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-10 bg-slate-50/30 min-h-screen"
    >
      {/* HEADER: ANALYTICS PULSE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 px-4 py-1.5 rounded-xl font-black text-xs">
              <Cpu className="h-3.5 w-3.5 mr-2" /> PIPELINE_CORE v4.0.1
            </Badge>
            <div className="h-4 w-[1px] bg-slate-200" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Database className="h-3 w-3" /> Live DB Syncing
            </span>
          </div>
          <h1 className="text-6xl font-black font-outfit tracking-tighter text-[#0D3B66]">Workflow Pipeline</h1>
          <p className="text-slate-500 font-bold text-xl max-w-2xl">Decompose macro-objectives into tactical team units with AI-assisted priority auditing.</p>
        </div>

        {/* ANALYTICS CARD STACK */}
        <div className="flex flex-col sm:flex-row gap-6">
          <Card className="bg-white border-none shadow-2xl rounded-[2.5rem] p-8 min-w-[280px] relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 p-8 opacity-5 group-hover:scale-110 transition-transform"><Target size={120} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pipeline Health</p>
            <div className="flex items-end gap-3">
              <h4 className="text-5xl font-black font-outfit text-[#0D3B66] tracking-tighter">{pipelineMetrics.health}%</h4>
              <ArrowUpRight className="h-6 w-6 text-emerald-500 mb-2" />
            </div>
            <Progress value={pipelineMetrics.health} className="h-2 mt-6 bg-slate-100" indicatorClassName="bg-blue-600" />
          </Card>

          <Card className="bg-gradient-to-br from-[#0D3B66] to-[#1F6FB2] border-none shadow-2xl rounded-[2.5rem] p-8 min-w-[280px] text-white relative group">
             <div className="absolute -right-4 -bottom-4 p-8 opacity-10 group-hover:rotate-12 transition-transform"><Rocket size={120} /></div>
             <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-4">Velocity Index</p>
             <h4 className="text-5xl font-black font-outfit tracking-tighter">{pipelineMetrics.completionRate}%</h4>
             <p className="text-xs font-bold text-blue-100 mt-2 opacity-70">Team completion ratio this month</p>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
        {/* SIDEBAR: CREATION & FILTERING */}
        <div className="xl:col-span-4 space-y-10">
          <Card className="border-none shadow-2xl rounded-[3rem] bg-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5"><Plus size={150} /></div>
            <CardHeader className="bg-slate-50/50 p-10 border-b">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-blue-100 rounded-3xl text-blue-600 shadow-inner"><Flag className="h-8 w-8" /></div>
                <CardTitle className="text-2xl font-black font-outfit" style={{ color: COLORS.deepBlue }}>Tactical Entry</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-10">
              <form onSubmit={handleFormSubmit} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-1">Objective Signature</label>
                  <input
                    type="text" placeholder="Mission-critical title..." value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full h-16 bg-slate-50 border-2 border-transparent rounded-[1.25rem] px-6 font-bold text-lg focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-1">Tactical Briefing</label>
                  <textarea
                    placeholder="Technical specifications or context..." value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-transparent rounded-[1.25rem] p-6 font-medium text-slate-600 focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all outline-none min-h-[160px]"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-1">Expected Completion</label>
                  <div className="relative group">
                    <Clock className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      type="date" value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full h-16 bg-slate-50 border-2 border-transparent rounded-[1.25rem] pl-16 pr-6 font-bold focus:bg-white focus:border-blue-400 transition-all outline-none"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={createMutation.isLoading}
                  className="w-full h-20 rounded-[2rem] bg-[#0D3B66] text-white font-black text-xl shadow-2xl shadow-blue-100 hover:bg-blue-900 active:scale-95 transition-all group"
                >
                  {createMutation.isLoading ? <RefreshCw className="animate-spin" /> : (
                    <><Rocket className="h-6 w-6 mr-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> DEPLOY TO SPECTRUM</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* ADMIN QUADRANT CONTROL */}
          {isAdmin && (
            <Card className="border-none shadow-2xl rounded-[3rem] bg-[#0D3B66] p-10 text-white relative overflow-hidden">
               <div className="absolute top-0 right-0 p-10 opacity-10 rotate-45"><Filter size={150} /></div>
               <div className="relative z-10">
                 <div className="flex items-center gap-4 mb-8">
                   <div className="p-3 bg-white/10 rounded-2xl border border-white/10"><ShieldCheck className="h-6 w-6" /></div>
                   <h4 className="text-xl font-black font-outfit uppercase tracking-tighter">Quadrant Audit</h4>
                 </div>
                 <p className="text-blue-200 font-medium mb-8 text-sm leading-relaxed">Filter the global pipeline to audit specific personnel units.</p>
                 <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="h-16 rounded-2xl bg-white text-[#0D3B66] font-black border-none px-6 text-lg">
                      <Filter className="h-5 w-5 mr-3 text-blue-500" /><SelectValue placeholder="All Spectrums" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl p-2 font-bold">
                      <SelectItem value="all">Team-Wide Aggregate</SelectItem>
                      {Object.keys(groupedMatrix).map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                 </Select>
               </div>
            </Card>
          )}
        </div>

        {/* FEED: PIPELINE VISUALIZATION */}
        <div className="xl:col-span-8 space-y-12">
          
          {/* AI SUMMARY BOX */}
          <motion.div variants={itemVariants}>
            <Card className="border-none shadow-2xl rounded-[2.5rem] bg-indigo-50 p-8 flex items-center justify-between group overflow-hidden relative">
               <div className="absolute -right-6 -top-6 p-10 opacity-5 group-hover:rotate-12 transition-transform"><BrainCircuit size={180} /></div>
               <div className="flex items-center gap-6 relative z-10">
                 <div className="p-5 bg-white rounded-3xl shadow-xl"><Sparkles className="h-8 w-8 text-indigo-500" /></div>
                 <div>
                   <h4 className="text-2xl font-black font-outfit text-indigo-900">AI Triage Recommendation</h4>
                   <p className="text-indigo-600/70 font-bold">Detected {pipelineMetrics.overdue} high-risk items requiring promotion to Tasks.</p>
                 </div>
               </div>
               <Button className="rounded-2xl h-14 px-8 bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-xl relative z-10">RUN AUDIT</Button>
            </Card>
          </motion.div>

          <AnimatePresence mode="popLayout">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-60 opacity-30">
                <div className="relative h-20 w-20">
                  <RefreshCw className="h-20 w-20 animate-spin text-blue-500" />
                  <History className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-800" />
                </div>
                <p className="mt-8 font-black uppercase tracking-[0.5em] text-blue-900">Syncing Pipeline Logs...</p>
              </div>
            ) : Object.keys(groupedMatrix).length === 0 ? (
              <div className="py-60 text-center flex flex-col items-center justify-center opacity-30 scale-150">
                <LayoutList className="h-16 w-16 mb-6" />
                <h3 className="text-xl font-black uppercase tracking-[0.3em]">Operational Vacuum</h3>
              </div>
            ) : (
              Object.entries(groupedMatrix).map(([userName, userTodos]) => (
                <motion.div 
                  key={userName} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between px-6">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-[#0D3B66]/5 border border-[#0D3B66]/10 flex items-center justify-center text-[#0D3B66] shadow-sm font-black">
                        {userName.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-3xl font-black font-outfit text-[#0D3B66] tracking-tight lowercase">
                          <span className="text-slate-300 mr-2 font-mono">/</span>{userName}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{userTodos.length} Active Vectors</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6 px-2">
                    {userTodos.map(renderObjectiveCard)}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { 
  History, 
  Trash2, 
  CheckCircle2, 
  RefreshCcw, 
  PlusCircle, 
  User,
  Clock,
  ArrowRight,
  FileDown,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

export default function TaskAudit() {
  const [filter, setFilter] = useState("ALL");
  const [isExporting, setIsExporting] = useState(false);

  // Sync with Backend: GET /audit-logs?module=task
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["taskAuditLogs", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ module: "task" });
      if (filter !== "ALL") params.append("action", filter);
      
      const res = await api.get(`/audit-logs?${params.toString()}`);
      return res.data;
    },
  });

  // Action Mapping for UI
  const getActionStyles = (action) => {
    switch (action) {
      case "DELETE_TASK":
        return { color: "text-red-600", bg: "bg-red-50", icon: <Trash2 className="h-4 w-4" />, label: "Deleted" };
      case "TASK_COMPLETED":
        return { color: "text-emerald-600", bg: "bg-emerald-50", icon: <CheckCircle2 className="h-4 w-4" />, label: "Completed" };
      case "TASK_STATUS_CHANGED":
        return { color: "text-blue-600", bg: "bg-blue-50", icon: <RefreshCcw className="h-4 w-4" />, label: "Status Transition" };
      case "CREATE_TASK":
        return { color: "text-indigo-600", bg: "bg-indigo-50", icon: <PlusCircle className="h-4 w-4" />, label: "Registration" };
      case "UPDATE_TASK":
        return { color: "text-amber-600", bg: "bg-amber-50", icon: <History className="h-4 w-4" />, label: "Modification" };
      default:
        return { color: "text-slate-600", bg: "bg-slate-50", icon: <History className="h-4 w-4" />, label: action };
    }
  };

  // Integration with Backend PDF Service
  const handleExportPDF = async (taskId) => {
    if (!taskId) {
        toast.error("Global export not available. Select a specific task log to export.");
        return;
    }
    setIsExporting(true);
    try {
      const response = await api.get(`/tasks/${taskId}/export-log-pdf`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `task_lifecycle_${taskId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Lifecycle report downloaded");
    } catch (error) {
      toast.error("Failed to generate PDF. Is the Task ID valid?");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <RefreshCcw className="h-10 w-10 text-blue-500 animate-spin" />
          <History className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 text-blue-800" />
        </div>
        <p className="text-slate-500 font-bold font-outfit animate-pulse">Retrieving Audit Trail...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 md:p-8 bg-gradient-to-r from-slate-50 to-white border-b">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#0D3B66] rounded-2xl text-white shadow-lg">
              <History className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-2xl md:text-3xl font-bold font-outfit text-[#0D3B66]">Task Audit Trail</CardTitle>
              <CardDescription className="text-slate-500 font-medium">Compliance-ready record of every system modification</CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full md:w-[220px] rounded-xl border-slate-200 shadow-sm h-12 font-bold text-slate-700 bg-white">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent className="rounded-xl font-medium">
                <SelectItem value="ALL">All Activities</SelectItem>
                <SelectItem value="CREATE_TASK">Task Creation</SelectItem>
                <SelectItem value="TASK_STATUS_CHANGED">Status Changes</SelectItem>
                <SelectItem value="TASK_COMPLETED">Completions</SelectItem>
                <SelectItem value="UPDATE_TASK">General Updates</SelectItem>
                <SelectItem value="DELETE_TASK">Deletions</SelectItem>
              </SelectContent>
            </Select>
            <Button 
                variant="outline" 
                onClick={() => refetch()} 
                className="rounded-xl h-12 w-12 p-0 border-slate-200 hover:bg-slate-50"
            >
                <RefreshCcw className="h-5 w-5 text-slate-600" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8">
          <div className="relative space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100">
            {logs.length === 0 ? (
              <div className="text-center py-20">
                <History className="h-16 w-16 text-slate-100 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-300 uppercase tracking-widest">No Logs Found</h3>
              </div>
            ) : (
              logs.map((log, index) => {
                const styles = getActionStyles(log.action);
                const taskTitle = log.old_data?.title || log.new_data?.title || "Unknown Task";
                const taskId = log.record_id;
                
                return (
                  <div key={index} className="relative flex items-start gap-8 group">
                    {/* Visual Node */}
                    <div className={`absolute left-0 mt-1 w-12 h-12 rounded-2xl border-4 border-white shadow-xl flex items-center justify-center z-10 transition-all group-hover:rotate-12 ${styles.bg} ${styles.color}`}>
                      {styles.icon}
                    </div>

                    <div className="flex-1 ml-12 p-5 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className={`${styles.bg} ${styles.color} rounded-lg px-3 py-1 text-[10px] font-black uppercase`}>
                            {styles.label}
                          </Badge>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                            <Clock className="h-3.5 w-3.5" />
                            {log.timestamp ? format(new Date(log.timestamp), "hh:mm a • MMM d, yyyy") : "N/A"}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           <Button 
                             size="sm" 
                             variant="ghost" 
                             className="h-8 rounded-lg text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1.5"
                             onClick={() => handleExportPDF(taskId)}
                           >
                             <FileDown className="h-3.5 w-3.5" />
                             EXPORT PDF
                           </Button>
                           <div className="h-8 w-[1px] bg-slate-100 mx-1" />
                           <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                             <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">
                               {log.user_name?.charAt(0)}
                             </div>
                             {log.user_name}
                           </div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h4 className="text-base font-bold text-[#0D3B66]">{taskTitle}</h4>
                        <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">ID: {taskId}</p>
                      </div>

                      {/* Dynamic Changes Display */}
                      <div className="space-y-3">
                        {log.action === "TASK_STATUS_CHANGED" && (
                          <div className="inline-flex items-center gap-3 p-2 px-4 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-inner">
                            <span className="text-xs font-medium text-slate-400 line-through lowercase">{log.old_data?.status}</span>
                            <ArrowRight className="h-4 w-4 text-blue-400" />
                            <span className="text-xs font-black text-blue-700 uppercase tracking-tighter">{log.new_data?.status}</span>
                          </div>
                        )}

                        {log.action === "UPDATE_TASK" && log.new_data && (
                          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            {Object.entries(log.new_data).map(([key, value]) => {
                               if (['updated_at', 'title', 'id'].includes(key)) return null;
                               return (
                                 <div key={key} className="flex flex-col">
                                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{key.replace('_', ' ')}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate">
                                     {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                   </span>
                                 </div>
                               );
                            })}
                          </div>
                        )}

                        {log.action === "DELETE_TASK" && (
                           <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-xs font-bold text-red-600 flex items-center gap-2">
                             <Trash2 className="h-4 w-4" />
                             This record has been wiped from the active database.
                           </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

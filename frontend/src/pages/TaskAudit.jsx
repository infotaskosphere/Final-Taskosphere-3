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
import { format } from "date-fns";
import { 
  History, 
  Trash2, 
  CheckCircle2, 
  RefreshCcw, 
  PlusCircle, 
  User,
  Clock,
  ArrowRight
} from "lucide-react";

export default function TaskAudit() {
  const [filter, setFilter] = useState("ALL");

  // Aligned with Backend: GET /audit-logs?module=task&action=...
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["taskAuditLogs", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ module: "task" });
      if (filter !== "ALL") params.append("action", filter);
      
      const res = await api.get(`/audit-logs?${params.toString()}`);
      return res.data;
    },
  });

  const getActionStyles = (action) => {
    switch (action) {
      case "DELETE_TASK":
        return { color: "text-red-600", bg: "bg-red-50", icon: <Trash2 className="h-4 w-4" />, label: "Deleted" };
      case "TASK_COMPLETED":
        return { color: "text-emerald-600", bg: "bg-emerald-50", icon: <CheckCircle2 className="h-4 w-4" />, label: "Completed" };
      case "TASK_STATUS_CHANGED":
        return { color: "text-blue-600", bg: "bg-blue-50", icon: <RefreshCcw className="h-4 w-4" />, label: "Status Change" };
      case "CREATE_TASK":
        return { color: "text-indigo-600", bg: "bg-indigo-50", icon: <PlusCircle className="h-4 w-4" />, label: "Created" };
      default:
        return { color: "text-slate-600", bg: "bg-slate-50", icon: <History className="h-4 w-4" />, label: "Updated" };
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-4">
        <RefreshCcw className="h-8 w-8 text-blue-500 animate-spin" />
        <p className="text-slate-500 font-medium">Synchronizing audit logs...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card className="border-none shadow-xl bg-white/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <History className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold font-outfit text-[#0D3B66]">Lifecycle Logs</CardTitle>
              <CardDescription>Comprehensive audit trail of all task modifications</CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-sm font-semibold text-slate-500 hidden sm:inline">Filter By:</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full md:w-[220px] rounded-xl border-slate-200 shadow-sm h-11">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="ALL">All Activities</SelectItem>
                <SelectItem value="CREATE_TASK">New Tasks</SelectItem>
                <SelectItem value="TASK_STATUS_CHANGED">Status Transitions</SelectItem>
                <SelectItem value="TASK_COMPLETED">Completions</SelectItem>
                <SelectItem value="UPDATE_TASK">General Updates</SelectItem>
                <SelectItem value="DELETE_TASK">Deletions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
            {logs.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No activity records found for this criteria.</p>
              </div>
            ) : (
              logs.map((log, index) => {
                const styles = getActionStyles(log.action);
                // Backend stores task title in 'title' within old_data/new_data
                const taskTitle = log.old_data?.title || log.new_data?.title || "Untitled Task";
                
                return (
                  <div key={index} className="relative flex items-start gap-6 group">
                    {/* Timeline Node */}
                    <div className={`absolute left-0 mt-1 w-10 h-10 rounded-full border-4 border-white shadow-md flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${styles.bg} ${styles.color}`}>
                      {styles.icon}
                    </div>

                    <div className="flex-1 ml-10 p-4 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all border-l-4" style={{ borderLeftColor: styles.color.includes('red') ? '#ef4444' : styles.color.includes('emerald') ? '#10b981' : '#3b82f6' }}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`${styles.bg} ${styles.color} rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider`}>
                            {styles.label}
                          </Badge>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {log.timestamp ? format(new Date(log.timestamp), "hh:mm a • MMM d, yyyy") : "Date Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                          <User className="h-3 w-3" />
                          {log.user_name}
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-[#0D3B66] mb-1">{taskTitle}</h4>

                      {/* Detail Rendering Aligned with Backend patch_task / create_audit_log */}
                      <div className="mt-3 text-xs space-y-1">
                        {log.action === "TASK_STATUS_CHANGED" && (
                          <div className="flex items-center gap-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100 w-fit">
                            <span className="text-slate-500 line-through">{log.old_data?.status}</span>
                            <ArrowRight className="h-3 w-3 text-blue-400" />
                            <span className="font-bold text-blue-700 capitalize">{log.new_data?.status}</span>
                          </div>
                        )}

                        {log.action === "DELETE_TASK" && (
                          <p className="text-red-500 font-medium bg-red-50 px-2 py-1 rounded w-fit">
                            Task was permanently removed from the system.
                          </p>
                        )}

                        {log.action === "UPDATE_TASK" && log.new_data && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(log.new_data).map(([key, value]) => {
                               if (key === 'updated_at' || key === 'title') return null;
                               return (
                                 <div key={key} className="text-[10px] text-slate-500 italic">
                                   Modified <span className="font-bold text-slate-700">{key.replace('_', ' ')}</span>
                                 </div>
                               );
                            })}
                          </div>
                        )}

                        {(log.action === "TASK_COMPLETED" || log.action === "CREATE_TASK") && (
                          <p className="text-slate-500">
                            Managed by: <span className="font-semibold text-slate-700">{log.old_data?.assigned_to_name || log.new_data?.assigned_to || "Direct Action"}</span>
                          </p>
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

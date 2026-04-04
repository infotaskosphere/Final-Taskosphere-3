// =============================================================================
// TaskAudit.jsx — Full light/dark theme support
// =============================================================================
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GifLoader from "@/components/ui/GifLoader.jsx";
import { useDark } from "@/hooks/useDark";
import api from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  History, Trash2, CheckCircle2, RefreshCcw,
  PlusCircle, Clock, ArrowRight, FileDown,
} from "lucide-react";
import { toast } from "sonner";

const C = { deepBlue: "#0D3B66", mediumBlue: "#1F6FB2" };

export default function TaskAudit() {
  const isDark = useDark();
  const [filter, setFilter] = useState("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["taskAuditLogs", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ module: "task" });
      if (filter !== "ALL") params.append("action", filter);
      const res = await api.get(`/audit-logs?${params.toString()}`);
      return res.data;
    },
  });

  const getActionStyles = (action) => {
    const base = isDark ? {
      DELETE_TASK:         { color: "text-red-400",      bg: "bg-red-900/30",      icon: <Trash2 className="h-4 w-4" />,      label: "Deleted"           },
      TASK_COMPLETED:      { color: "text-emerald-400", bg: "bg-emerald-900/30", icon: <CheckCircle2 className="h-4 w-4" />, label: "Completed"         },
      TASK_STATUS_CHANGED: { color: "text-blue-400",    bg: "bg-blue-900/30",    icon: <RefreshCcw className="h-4 w-4" />,   label: "Status Transition" },
      CREATE_TASK:         { color: "text-indigo-400",  bg: "bg-indigo-900/30",  icon: <PlusCircle className="h-4 w-4" />,   label: "Registration"      },
      UPDATE_TASK:         { color: "text-amber-400",   bg: "bg-amber-900/30",   icon: <History className="h-4 w-4" />,      label: "Modification"      },
    } : {
      DELETE_TASK:         { color: "text-red-600",      bg: "bg-red-50",      icon: <Trash2 className="h-4 w-4" />,      label: "Deleted"           },
      TASK_COMPLETED:      { color: "text-emerald-600", bg: "bg-emerald-50", icon: <CheckCircle2 className="h-4 w-4" />, label: "Completed"         },
      TASK_STATUS_CHANGED: { color: "text-blue-600",    bg: "bg-blue-50",    icon: <RefreshCcw className="h-4 w-4" />,   label: "Status Transition" },
      CREATE_TASK:         { color: "text-indigo-600",  bg: "bg-indigo-50",  icon: <PlusCircle className="h-4 w-4" />,   label: "Registration"      },
      UPDATE_TASK:         { color: "text-amber-600",   bg: "bg-amber-50",   icon: <History className="h-4 w-4" />,      label: "Modification"      },
    };
    const defaults = isDark
      ? { color: "text-slate-400", bg: "bg-slate-700/50", icon: <History className="h-4 w-4" />, label: action }
      : { color: "text-slate-600", bg: "bg-slate-50",     icon: <History className="h-4 w-4" />, label: action };
    return base[action] || defaults;
  };

  const handleExportPDF = async (taskId) => {
    if (!taskId) { toast.error("Select a specific task log to export."); return; }
    setIsExporting(true);
    try {
      const response = await api.get(`/tasks/${taskId}/export-log-pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", `task_lifecycle_${taskId}.pdf`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success("Lifecycle report downloaded");
    } catch { toast.error("Failed to generate PDF."); }
    finally { setIsExporting(false); }
  };

  /* ── theme tokens ── */
  const pageBg   = isDark ? "#0f172a"  : "#f8fafc";
  const cardBg   = isDark ? "#1e293b"  : "#ffffff";
  const cardBdr  = isDark ? "#334155"  : "#e2e8f0";
  const hdrBg    = isDark ? "linear-gradient(to right,#1e293b,#1e293b)" : "linear-gradient(to right,#f8fafc,#ffffff)";
  const headTxt  = isDark ? "#e2e8f0"  : C.deepBlue;
  const subTxt   = isDark ? "#94a3b8"  : "#64748b";
  const logCard  = isDark ? "#263348"  : "#ffffff";
  const logBdr   = isDark ? "#334155"  : "#f1f5f9";
  const metaTxt  = "#94a3b8";
  const metaBg   = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const taskTitleClr = isDark ? "#93c5fd" : C.deepBlue;
  const idTxt    = isDark ? "#475569"  : "#94a3b8";
  const selectBg = isDark ? "#0f172a"  : "#ffffff";
  const selectBdr= isDark ? "#334155"  : "#e2e8f0";

  if (isLoading) {
    return <GifLoader />;
  }

  return (
    <div style={{ background: pageBg, minHeight: "100vh" }} className="transition-colors duration-200">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div
          style={{ background: cardBg, border: `1px solid ${cardBdr}` }}
          className="rounded-3xl overflow-hidden shadow-xl"
        >
          {/* Header */}
          <div
            style={{ background: hdrBg, borderBottom: `1px solid ${cardBdr}` }}
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 md:p-8"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl text-white shadow-lg" style={{ background: C.deepBlue }}>
                <History className="h-7 w-7" />
              </div>
              <div>
                <h1 style={{ color: headTxt }} className="text-2xl md:text-3xl font-bold">Task Audit Trail</h1>
                <p style={{ color: subTxt }} className="font-medium text-sm mt-0.5">Compliance-ready record of modifications</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger
                  style={{ background: selectBg, border: `1px solid ${selectBdr}`, color: isDark ? "#e2e8f0" : "#374151" }}
                  className="w-full md:w-[220px] rounded-xl shadow-sm h-12 font-bold"
                >
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
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
                style={{ border: `1px solid ${selectBdr}`, color: isDark ? "#94a3b8" : "#475569", background: selectBg }}
                className="rounded-xl h-12 w-12 p-0 hover:opacity-80"
              >
                <RefreshCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="p-6 md:p-8">
            <div className="relative space-y-8">
              <div
                className="absolute inset-0 ml-6 -translate-x-px h-full w-0.5"
                style={{ background: isDark ? "#1e293b" : "#f1f5f9" }}
              />

              {logs.length === 0 ? (
                <div className="text-center py-20">
                  <History style={{ color: isDark ? "#1e293b" : "#e2e8f0" }} className="h-16 w-16 mx-auto mb-4" />
                  <h3 style={{ color: isDark ? "#334155" : "#cbd5e1" }} className="text-xl font-bold uppercase tracking-widest">No Logs Found</h3>
                </div>
              ) : (
                logs.map((log, index) => {
                  const styles = getActionStyles(log.action);
                  const taskTitle = log.old_data?.title || log.new_data?.title || "Unknown Task";
                  const taskId = log.record_id;

                  return (
                    <div key={index} className="relative flex items-start gap-8 group">
                      <div className={`absolute left-0 mt-1 w-12 h-12 rounded-2xl border-4 flex items-center justify-center z-10 transition-all group-hover:rotate-12 ${styles.bg} ${styles.color}`}
                        style={{ borderColor: isDark ? "#1e293b" : "#ffffff", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                        {styles.icon}
                      </div>

                      <div
                        style={{ background: logCard, border: `1px solid ${logBdr}` }}
                        className="flex-1 ml-12 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge className={`${styles.bg} ${styles.color} rounded-lg px-3 py-1 text-[10px] font-black uppercase border-0`}>
                              {styles.label}
                            </Badge>
                            <div
                              style={{ background: metaBg, color: metaTxt }}
                              className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg"
                            >
                              <Clock className="h-3.5 w-3.5" />
                              {log.timestamp ? format(new Date(log.timestamp), "hh:mm a • MMM d, yyyy") : "N/A"}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm" variant="ghost"
                              className={`h-8 rounded-lg text-[10px] font-bold gap-1.5 ${isDark ? "text-blue-400 hover:text-blue-300 hover:bg-blue-900/30" : "text-blue-600 hover:text-blue-700 hover:bg-blue-50"}`}
                              onClick={() => handleExportPDF(taskId)}
                            >
                              <FileDown className="h-3.5 w-3.5" /> EXPORT PDF
                            </Button>
                            <div style={{ background: isDark ? "#334155" : "#f1f5f9" }} className="h-8 w-[1px] mx-1" />
                            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: isDark ? "#e2e8f0" : "#374151" }}>
                              <div style={{ background: metaBg, color: metaTxt }} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]">
                                {log.user_name?.charAt(0)}
                              </div>
                              {log.user_name}
                            </div>
                          </div>
                        </div>

                        <div className="mb-4">
                          <h4 style={{ color: taskTitleClr }} className="text-base font-bold">{taskTitle}</h4>
                          <p style={{ color: idTxt }} className="text-[10px] font-mono mt-1 uppercase">ID: {taskId}</p>
                        </div>

                        <div className="space-y-3">
                          {log.action === "TASK_STATUS_CHANGED" && (
                            <div
                              style={{ background: isDark ? "rgba(37,99,235,0.12)" : "rgba(239,246,255,0.8)", border: `1px solid ${isDark ? "#1d4ed8" : "#bfdbfe"}` }}
                              className="inline-flex items-center gap-3 p-2 px-4 rounded-2xl shadow-inner"
                            >
                              <span style={{ color: metaTxt }} className="text-xs font-medium line-through lowercase">{log.old_data?.status}</span>
                              <ArrowRight className="h-4 w-4 text-blue-400" />
                              <span style={{ color: isDark ? "#93c5fd" : "#1d4ed8" }} className="text-xs font-black uppercase tracking-tighter">{log.new_data?.status}</span>
                            </div>
                          )}

                          {log.action === "UPDATE_TASK" && log.new_data && (
                            <div
                              style={{ background: metaBg, border: `1px solid ${logBdr}` }}
                              className="p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2"
                            >
                              {Object.entries(log.new_data).map(([key, value]) => {
                                if (["updated_at", "title", "id"].includes(key)) return null;
                                return (
                                  <div key={key} className="flex flex-col">
                                    <span style={{ color: metaTxt }} className="text-[9px] font-black uppercase tracking-widest">{key.replace("_", " ")}</span>
                                    <span style={{ color: isDark ? "#cbd5e1" : "#374151" }} className="text-xs font-bold truncate">
                                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {log.action === "DELETE_TASK" && (
                            <div
                              className="p-3 rounded-xl text-xs font-bold flex items-center gap-2"
                              style={{ 
                                background: isDark ? "rgba(239,68,68,0.1)" : "#fef2f2", 
                                border: `1px solid ${isDark ? "#7f1d1d" : "#fecaca"}`,
                                color: isDark ? "#f87171" : "#dc2626"
                              }}
                            >
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
          </div>
        </div>
      </div>
    </div>
  );
}

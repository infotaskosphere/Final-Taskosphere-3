import React from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

export default function TaskAudit() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["taskAuditLogs"],
    queryFn: async () => {
      const res = await api.get("/audit-logs?module=task");
      return res.data;
    },
  });

  if (isLoading) return <div className="p-6">Loading audit logs...</div>;

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Task Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logs.length === 0 && (
              <p className="text-slate-500">No audit logs found.</p>
            )}

            {logs.map((log, index) => (
              <div
                key={index}
                className="p-4 border rounded-xl bg-slate-50"
              >
                <p className="text-sm font-medium">
                  {log.user_name} performed <b>{log.action}</b>
                </p>

                <p className="text-xs text-slate-600 mt-1">
                  Task ID: {log.record_id}
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  {format(new Date(log.timestamp), "MMM d, yyyy • hh:mm a")}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

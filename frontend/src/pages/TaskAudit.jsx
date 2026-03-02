import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export default function TaskAudit() {
  const [filter, setFilter] = useState("ALL");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["taskAuditLogs", filter],
    queryFn: async () => {
      const url =
        !filter || filter === "ALL"
          ? "/audit-logs?module=task"
          : `/audit-logs?module=task&action=${filter}`;

      const res = await api.get(url);
      return res.data;
    },
  });

  if (isLoading) {
    return <div className="p-6">Loading audit logs...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Task Audit Log</CardTitle>

          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="DELETE_TASK">Deleted</SelectItem>
              <SelectItem value="TASK_STATUS_CHANGED">
                Status Changed
              </SelectItem>
              <SelectItem value="TASK_COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {logs.length === 0 && (
              <p className="text-slate-500">No audit logs found.</p>
            )}

            {logs.map((log, index) => (
              <div
                key={index}
                className="p-4 border rounded-xl bg-slate-50 space-y-2"
              >
                {/* DELETE */}
                {log.action === "DELETE_TASK" && (
                  <>
                    <p className="text-sm font-medium">
                      <b>{log.user_name}</b> deleted task
                    </p>
                    <p className="text-sm">
                      <b>{log.old_data?.task_title}</b>
                    </p>
                    <p className="text-xs text-slate-600">
                      Assigned to: {log.old_data?.assigned_to_name || "-"}
                    </p>
                  </>
                )}

                {/* STATUS CHANGE */}
                {log.action === "TASK_STATUS_CHANGED" && (
                  <>
                    <p className="text-sm font-medium">
                      <b>{log.user_name}</b> changed status
                    </p>
                    <p className="text-sm">
                      <b>{log.old_data?.task_title}</b>
                    </p>
                    <p className="text-xs text-slate-600">
                      From: {log.old_data?.status}
                    </p>
                    <p className="text-xs text-slate-600">
                      To: {log.new_data?.status}
                    </p>
                  </>
                )}

                {/* COMPLETED */}
                {log.action === "TASK_COMPLETED" && (
                  <>
                    <p className="text-sm font-medium">
                      <b>{log.user_name}</b> completed task
                    </p>
                    <p className="text-sm">
                      <b>{log.old_data?.task_title}</b>
                    </p>
                    <p className="text-xs text-slate-600">
                      Assigned to: {log.old_data?.assigned_to_name || "-"}
                    </p>
                  </>
                )}

                {/* Fallback */}
                {![
                  "DELETE_TASK",
                  "TASK_STATUS_CHANGED",
                  "TASK_COMPLETED",
                ].includes(log.action) && (
                  <p className="text-sm font-medium">
                    {log.user_name} performed {log.action}
                  </p>
                )}

                <p className="text-xs text-slate-400">
                  {log.timestamp
                    ? format(
                        new Date(log.timestamp),
                        "MMM d, yyyy • hh:mm a"
                      )
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

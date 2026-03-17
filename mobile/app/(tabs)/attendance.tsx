import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/screen-container";
import { attendanceAPI } from "@/lib/api-client";
import { useState } from "react";

interface AttendanceRecord {
  id: string;
  date: string;
  punch_in?: string;
  punch_out?: string;
  status: string;
  duration_minutes?: number;
}

export default function AttendanceScreen() {
  const [punchStatus, setPunchStatus] = useState<"in" | "out" | null>(null);
  const queryClient = useQueryClient();

  const { data: todayAttendance, isLoading: todayLoading } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => attendanceAPI.getTodayAttendance(),
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["attendance-history"],
    queryFn: () => attendanceAPI.getAttendanceHistory(),
  });

  const punchMutation = useMutation({
    mutationFn: (action: "punch_in" | "punch_out") =>
      attendanceAPI.punchInOut(action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    },
  });

  const handlePunch = (action: "punch_in" | "punch_out") => {
    punchMutation.mutate(action);
  };

  const formatTime = (time: string) => {
    if (!time) return "—";
    try {
      return new Date(time).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return time;
    }
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return date;
    }
  };

  if (todayLoading) {
    return (
      <ScreenContainer className="justify-center items-center">
        <ActivityIndicator size="large" color="#0a7ea4" />
      </ScreenContainer>
    );
  }

  const isPunchedIn = todayAttendance?.punch_in && !todayAttendance?.punch_out;
  const workDuration = todayAttendance?.duration_minutes
    ? Math.floor(todayAttendance.duration_minutes / 60) +
      "h " +
      (todayAttendance.duration_minutes % 60) +
      "m"
    : "0h 0m";

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-4 gap-6">
        {/* Header */}
        <View className="gap-2">
          <Text className="text-2xl font-bold text-foreground">Attendance</Text>
          <Text className="text-sm text-muted">Track your work hours</Text>
        </View>

        {/* Punch Status Card */}
        <View className="bg-surface rounded-2xl p-6 border border-border gap-4">
          <View className="gap-2">
            <Text className="text-sm text-muted">Today's Status</Text>
            <Text className={`text-2xl font-bold ${isPunchedIn ? "text-primary" : "text-muted"}`}>
              {isPunchedIn ? "Punched In" : "Punched Out"}
            </Text>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xs text-muted mb-1">Punch In</Text>
              <Text className="text-lg font-semibold text-foreground">
                {formatTime(todayAttendance?.punch_in)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted mb-1">Punch Out</Text>
              <Text className="text-lg font-semibold text-foreground">
                {formatTime(todayAttendance?.punch_out)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted mb-1">Duration</Text>
              <Text className="text-lg font-semibold text-foreground">{workDuration}</Text>
            </View>
          </View>

          {/* Punch Buttons */}
          <View className="flex-row gap-3">
            {!isPunchedIn ? (
              <TouchableOpacity
                onPress={() => handlePunch("punch_in")}
                disabled={punchMutation.isPending}
                className="flex-1 bg-success rounded-lg py-4 items-center"
                style={{ opacity: punchMutation.isPending ? 0.6 : 1 }}
              >
                {punchMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold">Punch In</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handlePunch("punch_out")}
                disabled={punchMutation.isPending}
                className="flex-1 bg-error rounded-lg py-4 items-center"
                style={{ opacity: punchMutation.isPending ? 0.6 : 1 }}
              >
                {punchMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold">Punch Out</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Recent History */}
        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">Recent History</Text>

          {historyLoading ? (
            <ActivityIndicator color="#0a7ea4" />
          ) : history.length > 0 ? (
            history.slice(0, 7).map((record: AttendanceRecord) => (
              <View
                key={record.id}
                className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center"
              >
                <View className="flex-1">
                  <Text className="text-foreground font-semibold">
                    {formatDate(record.date)}
                  </Text>
                  <Text className="text-muted text-sm mt-1">
                    {formatTime(record.punch_in || "")} - {formatTime(record.punch_out || "")}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`text-xs font-semibold px-2 py-1 rounded capitalize ${
                      record.status === "present"
                        ? "bg-success/10 text-success"
                        : record.status === "absent"
                          ? "bg-error/10 text-error"
                          : "bg-warning/10 text-warning"
                    }`}
                  >
                    {record.status}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text className="text-muted text-center">No attendance records</Text>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/screen-container";
import { dashboardAPI } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardAPI.getStats(),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <ScreenContainer className="justify-center items-center">
        <ActivityIndicator size="large" color="#0a7ea4" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ flexGrow: 1 }}
        className="p-4"
      >
        <View className="gap-6">
          {/* Header */}
          <View className="gap-2">
            <Text className="text-3xl font-bold text-foreground">Welcome back!</Text>
            <Text className="text-base text-muted">{user?.full_name}</Text>
          </View>

          {/* Quick Stats */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Overview</Text>

            <View className="flex-row gap-3">
              {/* Total Tasks */}
              <View className="flex-1 bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-sm text-muted mb-2">Total Tasks</Text>
                <Text className="text-3xl font-bold text-foreground">
                  {stats?.total_tasks || 0}
                </Text>
              </View>

              {/* Completed Tasks */}
              <View className="flex-1 bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-sm text-muted mb-2">Completed</Text>
                <Text className="text-3xl font-bold text-success">
                  {stats?.completed_tasks || 0}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              {/* Pending Tasks */}
              <View className="flex-1 bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-sm text-muted mb-2">Pending</Text>
                <Text className="text-3xl font-bold text-warning">
                  {stats?.pending_tasks || 0}
                </Text>
              </View>

              {/* Overdue Tasks */}
              <View className="flex-1 bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-sm text-muted mb-2">Overdue</Text>
                <Text className="text-3xl font-bold text-error">
                  {stats?.overdue_tasks || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Quick Actions</Text>

            <TouchableOpacity
              onPress={() => router.push("./tasks")}
              className="bg-primary rounded-2xl p-4 flex-row items-center justify-between"
              style={{ opacity: 0.9 }}
            >
              <View>
                <Text className="text-white font-semibold text-base">View All Tasks</Text>
                <Text className="text-white/80 text-sm">Manage your tasks</Text>
              </View>
              <Text className="text-white text-xl">→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("./todos")}
              className="bg-surface rounded-2xl p-4 flex-row items-center justify-between border border-border"
              style={{ opacity: 0.9 }}
            >
              <View>
                <Text className="text-foreground font-semibold text-base">My Todos</Text>
                <Text className="text-muted text-sm">Personal task list</Text>
              </View>
              <Text className="text-foreground text-xl">→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("./attendance")}
              className="bg-surface rounded-2xl p-4 flex-row items-center justify-between border border-border"
              style={{ opacity: 0.9 }}
            >
              <View>
                <Text className="text-foreground font-semibold text-base">Attendance</Text>
                <Text className="text-muted text-sm">Track your time</Text>
              </View>
              <Text className="text-foreground text-xl">→</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Activity */}
          {stats?.recent_activity && stats.recent_activity.length > 0 && (
            <View className="gap-3">
              <Text className="text-lg font-semibold text-foreground">Recent Activity</Text>

              {stats.recent_activity.slice(0, 3).map((activity: any, index: number) => (
                <View key={index} className="bg-surface rounded-lg p-4 border border-border">
                  <Text className="text-foreground font-semibold text-sm">{activity.title}</Text>
                  <Text className="text-muted text-xs mt-1">{activity.description}</Text>
                  <Text className="text-muted text-xs mt-2">{activity.timestamp}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

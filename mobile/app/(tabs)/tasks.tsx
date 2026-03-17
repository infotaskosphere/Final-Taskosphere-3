import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/screen-container";
import { tasksAPI } from "@/lib/api-client";
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_date?: string;
  assigned_to?: string;
}

export default function TasksScreen() {
  const [filter, setFilter] = useState<string>("all");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", filter],
    queryFn: () => tasksAPI.getTasks(filter !== "all" ? { status: filter } : {}),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-success/10 border-success";
      case "in_progress":
        return "bg-primary/10 border-primary";
      case "pending":
        return "bg-warning/10 border-warning";
      default:
        return "bg-surface border-border";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-error";
      case "medium":
        return "text-warning";
      case "low":
        return "text-success";
      default:
        return "text-muted";
    }
  };

  const renderTaskCard = ({ item }: { item: Task }) => (
    <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border mb-3">
      <View className="flex-row justify-between items-start gap-2">
        <View className="flex-1">
          <Text className="text-foreground font-semibold text-base">{item.title}</Text>
          {item.description && (
            <Text className="text-muted text-sm mt-1 line-clamp-2">{item.description}</Text>
          )}
        </View>
        <View className={`px-2 py-1 rounded ${getPriorityColor(item.priority)}`}>
          <Text className={`text-xs font-semibold ${getPriorityColor(item.priority)}`}>
            {item.priority?.toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-between items-center mt-3 gap-2">
        <View className={`px-3 py-1 rounded-full border ${getStatusColor(item.status)}`}>
          <Text className="text-xs font-semibold text-foreground capitalize">
            {item.status?.replace("_", " ")}
          </Text>
        </View>
        {item.due_date && (
          <Text className="text-xs text-muted">{new Date(item.due_date).toLocaleDateString()}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <ScreenContainer className="justify-center items-center">
        <ActivityIndicator size="large" color="#0a7ea4" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <View className="p-4 gap-4 flex-1">
        {/* Header */}
        <View className="gap-2">
          <Text className="text-2xl font-bold text-foreground">Tasks</Text>
          <Text className="text-sm text-muted">{tasks.length} tasks</Text>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
          {["all", "pending", "in_progress", "completed"].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => setFilter(status)}
              className={`px-4 py-2 rounded-full ${
                filter === status
                  ? "bg-primary"
                  : "bg-surface border border-border"
              }`}
            >
              <Text
                className={`text-sm font-semibold capitalize ${
                  filter === status ? "text-white" : "text-foreground"
                }`}
              >
                {status.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tasks List */}
        {tasks.length > 0 ? (
          <FlatList
            data={tasks}
            renderItem={renderTaskCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ flexGrow: 1 }}
          />
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-muted text-center">No tasks found</Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

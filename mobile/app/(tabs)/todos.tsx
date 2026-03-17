import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/screen-container";
import { todosAPI } from "@/lib/api-client";
import { useState } from "react";

interface Todo {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  is_completed?: boolean;
}

export default function TodosScreen() {
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const queryClient = useQueryClient();

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => todosAPI.getTodos(),
  });

  const createTodoMutation = useMutation({
    mutationFn: (title: string) =>
      todosAPI.createTodo({ title, priority: "medium" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTodoTitle("");
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      todosAPI.updateTodo(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: string) => todosAPI.deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const handleAddTodo = () => {
    if (newTodoTitle.trim()) {
      createTodoMutation.mutate(newTodoTitle);
    }
  };

  const handleToggleTodo = (todo: Todo) => {
    updateTodoMutation.mutate({
      id: todo.id,
      updates: { is_completed: !todo.is_completed },
    });
  };

  const renderTodoItem = ({ item }: { item: Todo }) => (
    <View className="flex-row items-center gap-3 bg-surface rounded-lg p-4 border border-border mb-2">
      <TouchableOpacity
        onPress={() => handleToggleTodo(item)}
        className={`w-6 h-6 rounded border-2 items-center justify-center ${
          item.is_completed ? "bg-success border-success" : "border-border"
        }`}
      >
        {item.is_completed && <Text className="text-white font-bold">✓</Text>}
      </TouchableOpacity>

      <View className="flex-1">
        <Text
          className={`text-foreground font-semibold ${
            item.is_completed ? "line-through text-muted" : ""
          }`}
        >
          {item.title}
        </Text>
        {item.description && (
          <Text className="text-muted text-sm mt-1">{item.description}</Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => deleteTodoMutation.mutate(item.id)}
        className="p-2"
      >
        <Text className="text-error text-lg">×</Text>
      </TouchableOpacity>
    </View>
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
          <Text className="text-2xl font-bold text-foreground">My Todos</Text>
          <Text className="text-sm text-muted">
            {todos.filter((t: Todo) => !t.is_completed).length} pending
          </Text>
        </View>

        {/* Add Todo Input */}
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 border border-border rounded-lg px-4 py-3 text-foreground bg-surface"
            placeholder="Add a new todo..."
            placeholderTextColor="#9BA1A6"
            value={newTodoTitle}
            onChangeText={setNewTodoTitle}
            editable={!createTodoMutation.isPending}
          />
          <TouchableOpacity
            onPress={handleAddTodo}
            disabled={createTodoMutation.isPending || !newTodoTitle.trim()}
            className="bg-primary rounded-lg px-4 py-3 items-center justify-center"
            style={{ opacity: createTodoMutation.isPending ? 0.6 : 1 }}
          >
            {createTodoMutation.isPending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text className="text-white font-semibold">+</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Todos List */}
        {todos.length > 0 ? (
          <FlatList
            data={todos}
            renderItem={renderTodoItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ flexGrow: 1 }}
          />
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-muted text-center">No todos yet. Create one to get started!</Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

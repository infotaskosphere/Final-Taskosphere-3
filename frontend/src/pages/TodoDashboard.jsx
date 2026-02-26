import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "https://final-taskosphere-frontend.onrender.com";

export default function TodoDashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const api = axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 📥 Fetch Todos
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todo-dashboard"],
    queryFn: async () => {
      const res = await api.get("/dashboard/todo-overview");
      return res.data;
    },
  });

  // ➕ Create Todo
  const createTodo = useMutation({
    mutationFn: (data) => api.post("/todos", data),
    onSuccess: () => {
      toast.success("Todo added successfully");
      queryClient.invalidateQueries(["todo-dashboard"]);
      setTitle("");
      setDescription("");
    },
    onError: () => toast.error("Failed to add todo"),
  });

  // 🚀 Promote Todo
  const promoteTodo = useMutation({
    mutationFn: (id) => api.post(`/todos/${id}/promote-to-task`),
    onSuccess: () => {
      toast.success("Promoted to Task");
      queryClient.invalidateQueries(["todo-dashboard"]);
    },
    onError: () => toast.error("Promotion failed"),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createTodo.mutate({ title, description });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Todo Dashboard</h1>

      {/* Create Card */}
      <div className="bg-white shadow-md rounded-2xl p-5 mb-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Enter todo title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-lg p-2"
          />

          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded-lg p-2"
            rows={3}
          />

          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Add Todo
          </button>
        </form>
      </div>

      {/* Todo List */}
      {isLoading ? (
        <p>Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-gray-500">No todos found.</p>
      ) : (
        <div className="space-y-4">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="bg-white shadow rounded-2xl p-5 flex justify-between items-center"
            >
              <div>
                <h3 className="text-lg font-semibold">{todo.title}</h3>
                {todo.description && (
                  <p className="text-sm text-gray-500 mt-1">
                    {todo.description}
                  </p>
                )}
              </div>

              <button
                onClick={() => promoteTodo.mutate(todo.id)}
                className="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition"
              >
                Promote
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "https://final-taskosphere-backend.onrender.com/api";

export default function TodoDashboard() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [promotingId, setPromotingId] = useState(null);

  const api = axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });

  // ==============================
  // FETCH TODOS
  // ==============================

  const { data, isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/dashboard/todo-overview");
      return res.data;
    },
  });

  // ==============================
  // CREATE TODO
  // ==============================

  const createTodo = useMutation({
    mutationFn: (data) => api.post("/todos", data),
    onSuccess: () => {
      toast.success("Todo added successfully");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setTitle("");
      setDescription("");
    },
  });

  // ==============================
  // PROMOTE TODO
  // ==============================

  const promoteTodo = useMutation({
    mutationFn: async (id) => {
      setPromotingId(id);
      return api.post(`/todos/${id}/promote-to-task`);
    },
    onSuccess: () => {
      toast.success("Promoted to Task successfully");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onSettled: () => {
      setPromotingId(null);
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

  const isAdmin = user?.role === "admin";

  // ==============================
  // CARD RENDER
  // ==============================

  const renderTodoCard = (todo) => {
    const isOwner = todo.user_id === user?.id;
    const canPromote = isAdmin || isOwner;

    const isPromoting = promotingId === todo._id;

    return (
      <div
        key={todo._id}
        className={`bg-white shadow rounded-2xl p-5 flex justify-between items-center transition-all duration-300 ${
          isPromoting ? "opacity-50 scale-95" : "opacity-100 scale-100"
        }`}
      >
        <div>
          <h3 className="text-lg font-semibold">{todo.title}</h3>
          {todo.description && (
            <p className="text-sm text-gray-500 mt-1">
              {todo.description}
            </p>
          )}
          {!canPromote && (
            <p className="text-xs text-gray-400 mt-2">Read Only</p>
          )}
        </div>

        {canPromote && (
          <button
            onClick={() => promoteTodo.mutate(todo._id)}
            disabled={isPromoting}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {isPromoting ? "Promoting..." : "Promote to Task"}
          </button>
        )}
      </div>
    );
  };

  // ==============================
  // MAIN UI
  // ==============================

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Todo Dashboard</h1>

      {/* CREATE CARD */}
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

      {isLoading ? (
        <p>Loading...</p>
      ) : !data ? (
        <p>No data found.</p>
      ) : (
        <div className="space-y-8">
          {/* ADMIN VIEW */}
          {isAdmin && data.grouped_todos && (
            <>
              {/* USER FILTER */}
              <div className="mb-6">
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="border rounded-lg p-2"
                >
                  <option value="all">All Users</option>
                  {Object.keys(data.grouped_todos).map((userName) => (
                    <option key={userName} value={userName}>
                      {userName}
                    </option>
                  ))}
                </select>
              </div>

              {/* FILTERED DISPLAY */}
              {Object.entries(data.grouped_todos)
                .filter(([userName]) =>
                  selectedUser === "all"
                    ? true
                    : userName === selectedUser
                )
                .map(([userName, userTodos]) => (
                  <div key={userName}>
                    <h2 className="text-xl font-semibold mb-3">
                      {userName}
                    </h2>
                    <div className="space-y-4">
                      {userTodos.length === 0 ? (
                        <p className="text-gray-500">No todos.</p>
                      ) : (
                        userTodos.map(renderTodoCard)
                      )}
                    </div>
                  </div>
                ))}
            </>
          )}

          {/* STAFF VIEW */}
          {!isAdmin && data.todos && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Todos</h2>
              <div className="space-y-4">
                {data.todos.length === 0 ? (
                  <p className="text-gray-500">No todos found.</p>
                ) : (
                  data.todos.map(renderTodoCard)
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

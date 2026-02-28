import React, { useState, useMemo } from "react";
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

  const isAdmin = user?.role === "admin";

  // ==============================
  // FETCH TODOS
  // ==============================

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    enabled: !!token,
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/todos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    },
  });

  // ==============================
  // GROUP TODOS (ADMIN VIEW)
  // ==============================

  const groupedTodos = useMemo(() => {
    if (!isAdmin) return {};

    return todos.reduce((acc, todo) => {
      const owner = todo.user_name || todo.user_id || "Unknown User";
      if (!acc[owner]) acc[owner] = [];
      acc[owner].push(todo);
      return acc;
    }, {});
  }, [todos, isAdmin]);

  const filteredGroupedTodos = useMemo(() => {
    if (!isAdmin) return {};

    if (selectedUser === "all") return groupedTodos;

    return {
      [selectedUser]: groupedTodos[selectedUser] || [],
    };
  }, [groupedTodos, selectedUser, isAdmin]);

  // ==============================
  // CREATE TODO
  // ==============================

  const createTodo = useMutation({
    mutationFn: async (payload) => {
      return axios.post(`${API_BASE}/todos`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      toast.success("Todo added successfully");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setTitle("");
      setDescription("");
    },
    onError: () => toast.error("Failed to create todo"),
  });

  // ==============================
  // PROMOTE TODO
  // ==============================

  const promoteTodo = useMutation({
    mutationFn: async (id) => {
      setPromotingId(id);
      return axios.post(
        `${API_BASE}/todos/${id}/promote-to-task`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    },
    onSuccess: () => {
      toast.success("Promoted to Task successfully");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: () => toast.error("Promotion failed"),
    onSettled: () => setPromotingId(null),
  });

  // ==============================
  // SUBMIT
  // ==============================

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createTodo.mutate({ title, description });
  };

  // ==============================
  // TODO CARD
  // ==============================

  const renderTodoCard = (todo) => {
    const isOwner = todo.user_id === user?.id;
    const canPromote = isAdmin || isOwner;
    const isPromoting = promotingId === todo._id;

    return (
      <div
        key={todo._id}
        className={`bg-white shadow rounded-2xl p-5 flex justify-between items-center transition ${
          isPromoting ? "opacity-50 scale-95" : ""
        }`}
      >
        <div>
          <h3 className="text-lg font-semibold">{todo.title}</h3>

          {todo.description && (
            <p className="text-sm text-gray-500 mt-1">
              {todo.description}
            </p>
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
  // UI
  // ==============================

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Todo Dashboard</h1>

      {/* CREATE */}
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

      {/* CONTENT */}
      {isLoading ? (
        <p>Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-gray-500">No todos found.</p>
      ) : isAdmin ? (
        <div className="space-y-8">

          {/* FILTER */}
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="border rounded-lg p-2 mb-4"
          >
            <option value="all">All Users</option>
            {Object.keys(groupedTodos).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {Object.entries(filteredGroupedTodos).map(
            ([userName, userTodos]) => (
              <div key={userName}>
                <h2 className="text-xl font-semibold mb-3">
                  {userName}
                </h2>

                <div className="space-y-4">
                  {userTodos.map(renderTodoCard)}
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {todos.map(renderTodoCard)}
        </div>
      )}
    </div>
  );
}

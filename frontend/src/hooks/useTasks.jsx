import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

/* ========================
   GET TASKS
======================== */
export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      // Capped to the 500 most-recently-created tasks — see server.py /tasks
      // docstring. Unwraps the paginated {tasks, total, ...} response shape.
      const { data } = await api.get("/tasks", { params: { page: 1, page_size: 500 } });
      return Array.isArray(data) ? data : (data?.tasks || []);
    },
  });
}

/* ========================
   UPDATE TASK
======================== */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await api.put(`/tasks/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["tasks"]);
    },
  });
}

/* ========================
   CREATE TASK
======================== */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/tasks", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["tasks"]);
    },
  });
}

/* ========================
   DELETE TASK
======================== */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["tasks"]);
    },
  });
}

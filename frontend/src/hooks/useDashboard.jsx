import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/* Dashboard Stats */
export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboardStats"],
    queryFn: async () => {
      const res = await api.get("/dashboard/stats");
      return res.data;
    },
  });
};

/* Upcoming Due Dates */
export const useUpcomingDueDates = () => {
  return useQuery({
    queryKey: ["upcomingDueDates"],
    queryFn: async () => {
      const res = await api.get("/duedates/upcoming?days=30");
      return res.data || [];
    },
  });
};

/* Today Attendance */
export const useTodayAttendance = () => {
  return useQuery({
    queryKey: ["todayAttendance"],
    queryFn: async () => {
      const res = await api.get("/attendance/today");
      return res.data;
    },
  });
};

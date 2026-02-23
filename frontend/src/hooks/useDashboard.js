import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats');
      return res.data;
    },
  });
};

export const useUpcomingDueDates = () => {
  return useQuery({
    queryKey: ['due-dates'],
    queryFn: async () => {
      const res = await api.get('/duedates/upcoming?days=30');
      return res.data || [];
    },
  });
};

export const useTodayAttendance = () => {
  return useQuery({
    queryKey: ['today-attendance'],
    queryFn: async () => {
      const res = await api.get('/attendance/today');
      return res.data;
    },
  });
};

import { useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';

/**
 * Activity Tracker Hook
 * Tracks user activity based on keyboard/mouse events
 * Sends activity data to backend every 30 seconds
 */
export const useActivityTracker = (enabled = true) => {
  const lastActivityTime = useRef(Date.now());
  const activeSeconds = useRef(0);
  const isActive = useRef(true);
  const intervalRef = useRef(null);
  const IDLE_THRESHOLD = 60000; // 1 minute of no activity = idle
  const SYNC_INTERVAL = 30000; // Sync every 30 seconds

  const updateActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime.current;
    
    if (timeSinceLastActivity < IDLE_THRESHOLD) {
      // User is active, count this time
      if (isActive.current) {
        activeSeconds.current += Math.min(timeSinceLastActivity / 1000, 30);
      }
    }
    
    lastActivityTime.current = now;
    isActive.current = true;
  }, []);

  const handleActivity = useCallback(() => {
    updateActivity();
  }, [updateActivity]);

  const syncActivity = useCallback(async () => {
    if (activeSeconds.current > 0) {
      try {
        // Get current page/app context
        const currentPage = window.location.pathname;
        const pageName = getPageName(currentPage);
        
        await api.post('/activity/log', {
          app_name: 'Taskosphere Web',
          window_title: pageName,
          url: window.location.href,
          category: 'productivity',
          duration_seconds: Math.round(activeSeconds.current)
        });
        
        // Reset counter after successful sync
        activeSeconds.current = 0;
      } catch (error) {
        console.error('Failed to sync activity:', error);
      }
    }
  }, []);

  const getPageName = (path) => {
    const pageNames = {
      '/dashboard': 'Dashboard',
      '/tasks': 'Tasks Management',
      '/clients': 'Client Management',
      '/dsc': 'DSC Register',
      '/duedates': 'Due Dates',
      '/attendance': 'Attendance',
      '/reports': 'Reports',
      '/users': 'User Management',
      '/staff-activity': 'Staff Activity Monitor'
    };
    return pageNames[path] || 'Taskosphere';
  };

  useEffect(() => {
    if (!enabled) return;

    // Track keyboard and mouse activity
    const events = ['keydown', 'keypress', 'mousemove', 'mousedown', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Sync activity periodically
    intervalRef.current = setInterval(() => {
      syncActivity();
    }, SYNC_INTERVAL);

    // Sync on page visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        syncActivity();
        isActive.current = false;
      } else {
        lastActivityTime.current = Date.now();
        isActive.current = true;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync before unload
    const handleBeforeUnload = () => {
      syncActivity();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Final sync on cleanup
      syncActivity();
    };
  }, [enabled, handleActivity, syncActivity]);

  return {
    isTracking: enabled,
    getActiveTime: () => activeSeconds.current
  };
};

export default useActivityTracker;

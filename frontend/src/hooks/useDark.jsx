/**
 * useDark — Shared dark-mode hook for Taskosphere
 *
 * Reads the `dark` class on <html> (set by DashboardLayout's theme toggle)
 * and reactively updates whenever it changes via a MutationObserver.
 *
 * Usage (both styles work):
 *   import useDark from '@/hooks/useDark';
 *   import { useDark } from '@/hooks/useDark';
 *   const isDark = useDark();
 */
import { useState, useEffect } from 'react';

export function useDark() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    // Sync immediately in case the class changed between render and effect
    setIsDark(document.documentElement.classList.contains('dark'));

    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );

    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => obs.disconnect();
  }, []);

  return isDark;
}

// Default export so both import styles work:
//   import useDark from '@/hooks/useDark'       ✅
//   import { useDark } from '@/hooks/useDark'   ✅
export default useDark;

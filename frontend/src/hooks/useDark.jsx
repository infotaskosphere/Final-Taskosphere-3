/**
 * useDark — Shared dark-mode hook for Taskosphere
 *
 * Reads the `dark` class on <html> (set by DashboardLayout's theme toggle)
 * and reactively updates whenever it changes via a MutationObserver.
 *
 * Usage:
 *   import { useDark } from '@/hooks/useDark';
 *   const isDark = useDark();
 */
import { useState, useEffect } from 'react';

export function useDark() {
  const [isDark, setIsDark] = useState(
    () => typeof window !== 'undefined' &&
      document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
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

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Bell, CalendarClock, ClipboardCheck, MapPin, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// How often to ask the backend "is anything due right now?"
// Keeping this short (30s) is what makes the popup feel instant for
// newly-assigned tasks, while the actual fire-times (11:00 AM universal,
// custom times, visit day) are controlled server-side.
const POLL_INTERVAL_MS = 30_000;

const TYPE_META = {
  task_assigned: { icon: ClipboardCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
  daily_summary: { icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
  visit: { icon: MapPin, color: "text-emerald-600", bg: "bg-emerald-50" },
  meeting: { icon: CalendarClock, color: "text-purple-600", bg: "bg-purple-50" },
  reminder: { icon: Bell, color: "text-slate-600", bg: "bg-slate-100" },
};

const getMeta = (type) => TYPE_META[type] || TYPE_META.reminder;

/**
 * Mounted once near the root of the app (inside AuthProvider, outside the
 * route switch) so it keeps polling and can pop up on top of ANY page.
 */
export default function ReminderPopupManager() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const pollRef = useRef(null);

  const fetchDuePopups = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/reminders/due-popups");
      if (Array.isArray(data) && data.length > 0) {
        setQueue((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = data.filter((p) => !existingIds.has(p.id));
          return [...prev, ...fresh];
        });
      }
    } catch (err) {
      // Silent — popup polling should never disrupt the rest of the app
      console.error("Failed to fetch due popups:", err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchDuePopups(); // check immediately on login / page load
    pollRef.current = setInterval(fetchDuePopups, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [user, fetchDuePopups]);

  const dismissCurrent = () => {
    setQueue((prev) => prev.slice(1));
  };

  const current = queue[0];
  if (!current || !user) return null;

  const meta = getMeta(current.type);
  const Icon = meta.icon;

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && dismissCurrent()}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="reminder-popup"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${meta.bg}`}>
              <Icon className={`h-5 w-5 ${meta.color}`} />
            </div>
            <div className="flex-1">
              <DialogTitle>{current.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="pt-2 text-sm text-slate-600">
            {current.message}
          </DialogDescription>
        </DialogHeader>

        {queue.length > 1 && (
          <p className="text-xs text-slate-400">
            {queue.length - 1} more reminder{queue.length - 1 !== 1 ? "s" : ""} waiting
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismissCurrent} data-testid="reminder-popup-dismiss">
            <X className="h-4 w-4 mr-1.5" />
            Dismiss
          </Button>
          <Button onClick={dismissCurrent} data-testid="reminder-popup-ok">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

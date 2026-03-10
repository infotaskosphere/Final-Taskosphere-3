import React, { useState, useEffect, useCallback } from "react";
import { Bell, CheckCheck, Trash2, Info, CheckSquare, ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import api from "@/lib/api";
import { toast } from "sonner";

// ── Icon per notification type ────────────────────────────────────────────────
const TYPE_META = {
  task:   { icon: ClipboardList, color: "text-indigo-500",  bg: "bg-indigo-50"  },
  todo:   { icon: CheckSquare,   color: "text-emerald-500", bg: "bg-emerald-50" },
  lead:   { icon: Users,         color: "text-amber-500",   bg: "bg-amber-50"   },
  system: { icon: Info,          color: "text-slate-500",   bg: "bg-slate-100"  },
  dsc:    { icon: Info,          color: "text-purple-500",  bg: "bg-purple-50"  },
};

const getMeta = (type) => TYPE_META[type] ?? TYPE_META.system;

// ── Relative time ─────────────────────────────────────────────────────────────
const formatDate = (dateString) => {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────

export const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // ── Mark single read ───────────────────────────────────────────────────────
  const markAsRead = async (notificationId) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await api.put(`/notifications/${notificationId}/read`);
    } catch (err) {
      toast.error("Failed to mark notification as read");
      fetchNotifications(); // revert on failure
    }
  };

  // ── Mark ALL read — FIX: explicit PUT with correct path ───────────────────
  const markAllRead = async () => {
    if (loading) return;
    setLoading(true);

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await api({
        method: "PUT",           // explicitly set — avoids any axios config issues
        url: "/notifications/read-all",
      });
      toast.success("All notifications marked as read");
    } catch (err) {
      console.error("markAllRead error:", err);
      toast.error("Failed to mark all notifications as read");
      fetchNotifications(); // revert on failure
    } finally {
      setLoading(false);
    }
  };

  // ── Delete single ──────────────────────────────────────────────────────────
  const deleteNotification = async (e, notificationId) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    setUnreadCount((c) =>
      Math.max(
        0,
        c - (notifications.find((n) => n.id === notificationId)?.is_read ? 0 : 1)
      )
    );

    try {
      await api.delete(`/notifications/${notificationId}`);
    } catch (err) {
      toast.error("Failed to delete notification");
      fetchNotifications();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* ── Bell trigger ── */}
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
              data-testid="notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* ── Popover panel ── */}
      <PopoverContent className="w-96 p-0 shadow-xl border border-slate-200 rounded-xl overflow-hidden" align="end">

        {/* Header */}
        <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {loading ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="h-[420px] bg-slate-50">
          {notifications.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full py-16 text-slate-400"
              data-testid="no-notifications"
            >
              <Bell className="h-10 w-10 mb-3 text-slate-200" />
              <p className="text-sm font-medium">You're all caught up!</p>
              <p className="text-xs mt-1 text-slate-300">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => {
                const meta = getMeta(n.type);
                const Icon = meta.icon;

                return (
                  <div
                    key={n.id}
                    className={`group relative flex gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-white ${
                      !n.is_read ? "bg-white border-l-2 border-l-indigo-500" : "bg-slate-50"
                    }`}
                    onClick={() => !n.is_read && markAsRead(n.id)}
                    data-testid={`notification-item-${n.id}`}
                  >
                    {/* Type icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.bg}`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${!n.is_read ? "text-slate-900" : "text-slate-600"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {formatDate(n.created_at)}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!n.is_read && (
                      <div className="flex-shrink-0 w-2 h-2 bg-indigo-500 rounded-full mt-1.5" />
                    )}

                    {/* Delete button — visible on hover */}
                    <button
                      onClick={(e) => deleteNotification(e, n.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                      title="Remove notification"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-300 hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2.5 bg-white border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              {notifications.length} notification{notifications.length !== 1 ? "s" : ""} total
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;

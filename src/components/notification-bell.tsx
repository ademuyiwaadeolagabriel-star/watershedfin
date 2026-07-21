'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAppStore, type ViewKey } from '@/lib/store';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

export interface NotificationBellProps {
  userId?: string | null;
  adminId?: string | null;
}

interface NotificationItem {
  id: string;
  userId: string | null;
  adminId: string | null;
  type: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  readAt: string | null;
  actionLabel: string | null;
  actionView: string | null;
  actionParams: string | null;
  metadata: string | null;
  createdAt: string;
}

/* ---------- helpers ---------- */

function timeAgo(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' });
}

const CATEGORY_STYLES: Record<string, { icon: string; ring: string; bg: string; text: string }> = {
  loan: { icon: 'Banknote', ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  payment: { icon: 'Wallet', ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-600' },
  kyc: { icon: 'ShieldCheck', ring: 'ring-violet-200', bg: 'bg-violet-50', text: 'text-violet-600' },
  ticket: { icon: 'MessageSquare', ring: 'ring-sky-200', bg: 'bg-sky-50', text: 'text-sky-600' },
  system: { icon: 'Bell', ring: 'ring-slate-200', bg: 'bg-slate-50', text: 'text-slate-600' },
};

/* ---------- component ---------- */

export function NotificationBell({ userId, adminId }: NotificationBellProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const setView = useAppStore((s) => s.setView);

  const recipient = useMemo(() => {
    if (userId) return { userId, adminId: undefined };
    if (adminId) return { userId: undefined, adminId };
    return { userId: undefined, adminId: undefined };
  }, [userId, adminId]);

  const fetchList = useCallback(async () => {
    if (!recipient.userId && !recipient.adminId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (recipient.userId) params.set('userId', recipient.userId);
      if (recipient.adminId) params.set('adminId', recipient.adminId);
      params.set('limit', '10');
      const res = await authFetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      /* ignore — bell is non-critical */
    } finally {
      setLoading(false);
    }
  }, [recipient.userId, recipient.adminId]);

  // Initial fetch + when recipient changes
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Live updates via HTTP polling (Vercel-compatible — no socket.io server needed)
  // Polls every 30 seconds for new notifications. This replaces the previous
  // socket.io implementation which caused infinite reconnection loops on Vercel
  // (Vercel doesn't support persistent WebSocket connections without a separate service).
  useEffect(() => {
    if (!recipient.userId && !recipient.adminId) return;

    const pollInterval = setInterval(() => {
      void fetchList();
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [recipient.userId, recipient.adminId, fetchList]);

  const markAllAsRead = useCallback(async () => {
    if (!recipient.userId && !recipient.adminId) return;
    try {
      await authFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recipient.userId,
          adminId: recipient.adminId,
        }),
      });
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }, [recipient.userId, recipient.adminId]);

  const markOneAsRead = useCallback(async (id: string) => {
    try {
      await authFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, isRead: true, readAt: new Date().toISOString() } : i
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }, []);

  const handleItemClick = useCallback(
    (item: NotificationItem) => {
      if (!item.isRead) void markOneAsRead(item.id);
      if (item.actionView) {
        let params: Record<string, any> = {};
        if (item.actionParams) {
          try {
            params = JSON.parse(item.actionParams);
          } catch {
            params = {};
          }
        }
        setView(item.actionView as ViewKey, params);
        setOpen(false);
      }
    },
    [markOneAsRead, setView]
  );

  // "View all" — navigate based on context
  const viewAllTarget = useMemo<ViewKey>(() => {
    if (recipient.adminId) return 'dashboard';
    return 'customer-dashboard';
  }, [recipient.adminId, recipient.userId]);

  const handleViewAll = () => {
    setView(viewAllTarget);
    setOpen(false);
  };

  if (!recipient.userId && !recipient.adminId) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          aria-label="Notifications"
          aria-busy={loading}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(92vw,22rem)] p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[10px] font-bold px-1.5 py-0.5">
                {unreadCount} new
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            disabled={unreadCount === 0}
            onClick={markAllAsRead}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-400">
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">You&apos;re all caught up</p>
              <p className="text-[10px] text-slate-400">No notifications right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.system;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        !item.isRead && 'bg-emerald-50/40 dark:bg-emerald-950/20'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1',
                          style.bg,
                          style.ring,
                          style.text
                        )}
                        aria-hidden
                      >
                        <NotificationGlyph category={item.category} type={item.type} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'text-xs truncate',
                              item.isRead
                                ? 'text-slate-700 dark:text-slate-300 font-medium'
                                : 'text-slate-900 dark:text-slate-100 font-semibold'
                            )}
                          >
                            {item.title}
                          </p>
                          {!item.isRead && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {item.message}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-slate-400">{timeAgo(item.createdAt)}</span>
                          {item.actionLabel && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              {item.actionLabel}
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Footer */}
        <button
          type="button"
          onClick={handleViewAll}
          className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          View all notifications
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- per-type glyph ---------- */

function NotificationGlyph({ category, type }: { category: string; type: string }) {
  // Lightweight inline icons keyed off category + type. Keeping it local keeps
  // the bundle small and avoids dynamic icon-name lookups.
  const key = `${category}:${type}`;
  const size = 14;

  if (key.startsWith('loan:') || type.startsWith('loan_')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    );
  }
  if (key.startsWith('payment:') || type.startsWith('payment_')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    );
  }
  if (key.startsWith('kyc:') || type.startsWith('kyc_') || type.startsWith('cp_')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (key.startsWith('ticket:') || type.startsWith('ticket_')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default NotificationBell;

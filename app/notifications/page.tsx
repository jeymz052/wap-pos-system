"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRbac } from "@/components/RbacProvider";

type NotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  message?: string | null;
  is_read: boolean;
  created_at: string;
  severity?: "info" | "warning" | "critical" | null;
  action_url?: string | null;
  branches?: { name?: string | null } | null;
};

function timeAgo(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsPage() {
  const { canAny } = useRbac();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSync = canAny("notifications:manage", "reports:manage", "settings:manage");

  async function loadNotifications() {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("notifications")
      .select("id, notification_type, title, message, is_read, created_at, severity, action_url, branches(name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);
  const criticalCount = useMemo(
    () => items.filter((item) => item.severity === "critical").length,
    [items],
  );

  async function markAllRead() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "mark_all_read" }),
    });

    if (response.ok) {
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    }
  }

  async function triggerSync() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    setSyncing(true);
    setError(null);

    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to sync alerts.");
      setSyncing(false);
      return;
    }

    await loadNotifications();
    setSyncing(false);
  }

  return (
    <div className="notifications-page">
      <section className="notifications-hero">
        <div>
          <p className="notifications-eyebrow">Module 18</p>
          <h1>Notifications & Alerts</h1>
          <p>Operational alerts for inventory, receivables, payables, shifts, discounts, and warranty follow-up.</p>
        </div>
        <div className="notifications-actions">
          <button type="button" className="notifications-btn notifications-btn--light" onClick={() => void loadNotifications()}>
            <RefreshCw size={15} />
            Refresh
          </button>
          <button type="button" className="notifications-btn" onClick={() => void markAllRead()}>
            <CheckCheck size={15} />
            Mark all read
          </button>
          {canSync ? (
            <button type="button" className="notifications-btn notifications-btn--dark" onClick={() => void triggerSync()} disabled={syncing}>
              {syncing ? <LoaderCircle size={15} className="notifications-spin" /> : <ShieldAlert size={15} />}
              Sync alerts
            </button>
          ) : null}
        </div>
      </section>

      {error ? <div className="notifications-error">{error}</div> : null}

      <section className="notifications-summary">
        <article className="notifications-stat">
          <span>Total alerts</span>
          <strong>{items.length}</strong>
        </article>
        <article className="notifications-stat">
          <span>Unread</span>
          <strong>{unreadCount}</strong>
        </article>
        <article className="notifications-stat">
          <span>Critical</span>
          <strong>{criticalCount}</strong>
        </article>
      </section>

      <section className="notifications-list">
        {loading ? (
          <div className="notifications-empty">
            <LoaderCircle size={16} className="notifications-spin" />
            <span>Loading notifications...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="notifications-empty">
            <Bell size={16} />
            <span>No alerts yet.</span>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className={`notifications-card notifications-card--${item.severity ?? "info"} ${item.is_read ? "notifications-card--read" : ""}`}>
              <div className="notifications-card__top">
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.message || "No additional details."}</p>
                </div>
                {!item.is_read ? <span className="notifications-pill">Unread</span> : null}
              </div>
              <div className="notifications-card__meta">
                <span>{item.notification_type.replace(/_/g, " ")}</span>
                <span>{item.branches?.name ?? "All branches"}</span>
                <span>{timeAgo(item.created_at)}</span>
                {item.action_url ? <a href={item.action_url}>Open</a> : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

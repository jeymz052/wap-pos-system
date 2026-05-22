"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { RbacProvider, useRbac } from "@/components/RbacProvider";
import { PUBLIC_ROUTES } from "@/lib/rbac";
import { useInactivityLogout } from "@/lib/use-inactivity-logout";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";

const routeMeta: Record<string, { title: string; subtitle?: string; searchPlaceholder?: string }> = {
  dashboard:    { title: "Dashboard",        searchPlaceholder: "Search dashboard..." },
  pos:          { title: "POS / Sales",      searchPlaceholder: "Search products, invoices, or customers..." },
  inventory:    { title: "Inventory",        searchPlaceholder: "Search SKU, item name, or brand..." },
  catalog:      { title: "Catalog & Compatibility", subtitle: "Manage categories, brands, fitment data, and product grouping", searchPlaceholder: "Search categories, brands, models, or groups..." },
  purchasing:   { title: "Purchasing",       searchPlaceholder: "Search suppliers, PO numbers, or items..." },
  receivables:  { title: "Receivables",      subtitle: "Manage customer credit invoices and collections", searchPlaceholder: "Search invoice #, customer, or amount..." },
  payables:     { title: "Payables",         subtitle: "Manage your supplier bills and payments", searchPlaceholder: "Search bill #, supplier, or amount..." },
  customers:    { title: "Customers",        searchPlaceholder: "Search customers, contact, or balance..." },
  suppliers:    { title: "Suppliers",        searchPlaceholder: "Search suppliers, parts, or terms..." },
  reports:      { title: "Reports",          searchPlaceholder: "Search report name or metric..." },
  "users-roles": { title: "Users & Roles",   searchPlaceholder: "Search users or permissions..." },
  settings:     { title: "Settings",         searchPlaceholder: "Search settings..." },
  security:     { title: "Security Center",  subtitle: "Login history, sessions, 2FA and password management", searchPlaceholder: "Search security settings..." },
};

// ─── Inactivity Warning Banner ────────────────────────────────────────────────

function InactivityWarning({ onDismiss }: { onDismiss: () => void }) {
  const [countdown, setCountdown] = useState(120); // 2 minutes

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Inactivity warning"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        background: "#1e293b",
        border: "1px solid #f59e0b",
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex", alignItems: "flex-start", gap: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        maxWidth: 340,
        animation: "slideUpIn 0.3s ease",
      }}
    >
      <AlertTriangle size={20} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <p style={{ color: "#f1f5f9", fontWeight: 600, margin: 0, fontSize: 13 }}>
          Session expiring soon
        </p>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0 12px" }}>
          You'll be signed out in <strong style={{ color: "#f59e0b" }}>{timeStr}</strong> due to inactivity.
        </p>
        <button
          id="btn-stay-signed-in"
          type="button"
          onClick={onDismiss}
          style={{
            background: "#3b82f6", color: "#fff", border: "none",
            borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <RefreshCw size={13} /> Stay Signed In
        </button>
      </div>
      <button
        type="button"
        id="btn-dismiss-inactivity"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: "transparent", border: "none", color: "#64748b",
          cursor: "pointer", padding: 0, lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Inner shell — runs inside RbacProvider so it can use useRbac() ───────────

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, user } = useRbac();
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(30);
  const [showWarning, setShowWarning] = useState(false);

  const isAuthScreen = PUBLIC_ROUTES.includes(pathname);
  const isPosScreen  = pathname === "/pos";
  const activeSection = pathname.split("/")[1] || "dashboard";

  // Load session timeout from policy settings
  useEffect(() => {
    if (isAuthScreen || !user) return;
    supabase
      .from("settings")
      .select("value")
      .eq("key", "session_timeout_minutes")
      .is("branch_id", null)
      .maybeSingle()
      .then(({ data }) => {
        const mins = parseInt((data as { value?: string } | null)?.value ?? "30");
        if (!isNaN(mins) && mins > 0) setSessionTimeoutMin(mins);
      });
  }, [user, isAuthScreen]);

  // Heartbeat — update last_active_at every 5 min
  useEffect(() => {
    if (isAuthScreen || !user) return;
    const id = setInterval(async () => {
      try { await supabase.rpc("update_last_active", { p_user_id: user.id }); } catch { /* noop */ }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, isAuthScreen]);

  const handleWarning = useCallback(() => setShowWarning(true), []);
  const handleDismiss = useCallback(() => setShowWarning(false), []);

  // Inactivity logout hook — only when authenticated
  useInactivityLogout({
    timeoutMinutes: isAuthScreen ? 0 : sessionTimeoutMin,
    warningMinutes: 2,
    onWarning: handleWarning,
  });

  if (isAuthScreen) return <>{children}</>;

  // Render immediately — RBAC loads in background, Sidebar/TopBar update reactively
  const topBarMeta = routeMeta[activeSection] ?? { title: "WAP POS", searchPlaceholder: "Search..." };

  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {!isPosScreen && (
            <TopBar
              title={topBarMeta.title}
              subtitle={topBarMeta.subtitle}
              searchPlaceholder={topBarMeta.searchPlaceholder}
            />
          )}
          <main className="app-main">{children}</main>
        </div>
      </div>

      {showWarning && (
        <InactivityWarning onDismiss={handleDismiss} />
      )}

      <style>{`
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ─── Shell wrapper ────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RbacProvider>
      <ShellInner>{children}</ShellInner>
    </RbacProvider>
  );
}

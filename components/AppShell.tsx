"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { RbacProvider, useRbac } from "@/components/RbacProvider";
import { SubscriptionProvider } from "@/components/SubscriptionProvider";
import { PUBLIC_ROUTES } from "@/lib/rbac";
import { useInactivityLogout } from "@/lib/use-inactivity-logout";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { isPasswordExpired, normalizeSecurityPolicy } from "@/lib/security-policy";

const routeMeta: Record<string, { title: string; subtitle?: string; searchPlaceholder?: string }> = {
  dashboard:    { title: "Dashboard",        searchPlaceholder: "Search dashboard..." },
  pos:          { title: "POS / Sales",      searchPlaceholder: "Search products, invoices, or customers..." },
  inventory:    { title: "Inventory",        searchPlaceholder: "Search SKU, item name, or brand..." },
  catalog:      { title: "Catalog & Compatibility", subtitle: "Manage categories, brands, fitment data, and product grouping", searchPlaceholder: "Search categories, brands, models, or groups..." },
  purchasing:   { title: "Purchasing",       searchPlaceholder: "Search suppliers, PO numbers, or items..." },
  "sales-orders": { title: "Quotes & Orders", subtitle: "Quotations, wholesale pricing, stock reservations, and conversion to sale", searchPlaceholder: "Search quote #, sales order #, customer, or email..." },
  receivables:  { title: "Receivables",      subtitle: "Manage customer credit invoices and collections", searchPlaceholder: "Search invoice #, customer, or amount..." },
  payables:     { title: "Payables",         subtitle: "Manage your supplier bills and payments", searchPlaceholder: "Search bill #, supplier, or amount..." },
  customers:    { title: "Customers",        searchPlaceholder: "Search customers, contact, or balance..." },
  suppliers:    { title: "Suppliers",        searchPlaceholder: "Search suppliers, parts, or terms..." },
  reports:      { title: "Reports",          searchPlaceholder: "Search report name or metric..." },
  notifications:{ title: "Notifications",    subtitle: "Low stock, due payments, credit reminders, discounts, and alert delivery", searchPlaceholder: "Search alerts, branches, or modules..." },
  subscription: { title: "Subscription",     subtitle: "Plans, limits, billing, renewals, invoices, and feature locks", searchPlaceholder: "Search plans, invoices, or features..." },
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
          You&apos;ll be signed out in <strong style={{ color: "#f59e0b" }}>{timeStr}</strong> due to inactivity.
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
  const { user, role } = useRbac();
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(30);
  const [requireAdmin2fa, setRequireAdmin2fa] = useState(true);
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
        const policy = normalizeSecurityPolicy({ session_timeout_minutes: (data as { value?: string } | null)?.value });
        if (policy.session_timeout_minutes > 0) setSessionTimeoutMin(policy.session_timeout_minutes);
      });
  }, [user, isAuthScreen]);

  useEffect(() => {
    if (isAuthScreen || !user) return;
    supabase
      .from("settings")
      .select("value")
      .eq("key", "require_2fa_for_admins")
      .is("branch_id", null)
      .maybeSingle()
      .then(({ data }) => {
        const value = ((data as { value?: string } | null)?.value ?? "false").toLowerCase();
        setRequireAdmin2fa(value !== "false");
      });
  }, [user, isAuthScreen]);

  // Heartbeat — update last_active_at every 5 min
  useEffect(() => {
    if (isAuthScreen || !user) return;
    const id = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const tokenPrefix = session?.access_token?.slice(0, 32) ?? null;

        if (tokenPrefix) {
          const { data: trackedSession } = await supabase
            .from("device_sessions")
            .select("id")
            .eq("session_token", tokenPrefix)
            .maybeSingle();

          if (!trackedSession) {
            await supabase.auth.signOut();
            window.location.replace("/?reason=inactivity");
            return;
          }

          await supabase
            .from("device_sessions")
            .update({ last_active_at: new Date().toISOString(), is_current: true })
            .eq("id", trackedSession.id);
        }

        await supabase.rpc("update_last_active", { p_user_id: user.id });
      } catch {
        /* noop */
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, isAuthScreen]);

  const handleWarning = useCallback(() => setShowWarning(true), []);

  // Inactivity logout hook — only when authenticated
  const { restartTimer } = useInactivityLogout({
    timeoutMinutes: isAuthScreen ? 0 : sessionTimeoutMin,
    warningMinutes: 2,
    onWarning: handleWarning,
  });

  const handleDismiss = useCallback(() => {
    setShowWarning(false);
    restartTimer();
  }, [restartTimer]);

  useEffect(() => {
    if (isAuthScreen || !user) return;
    const isPrivilegedRole = role?.name === "super_admin" || role?.name === "admin";
    const mustSetup2fa = requireAdmin2fa && isPrivilegedRole && !user.two_factor_enabled;
    if (mustSetup2fa && pathname !== "/security") {
      window.location.replace("/security?setup2fa=required");
      return;
    }

    if (pathname !== "/security" && (user.require_password_change || isPasswordExpired(user.password_expires_at))) {
      const reason = user.require_password_change ? "password_update_required" : "password_expired";
      window.location.replace(`/security?tab=password&reason=${reason}`);
    }
  }, [isAuthScreen, pathname, requireAdmin2fa, role?.name, user]);

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
      <SubscriptionProvider>
        <ShellInner>{children}</ShellInner>
      </SubscriptionProvider>
    </RbacProvider>
  );
}

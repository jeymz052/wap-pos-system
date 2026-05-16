"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { RbacProvider, useRbac } from "@/components/RbacProvider";
import { PUBLIC_ROUTES } from "@/lib/rbac";

const routeMeta: Record<string, { title: string; subtitle?: string; searchPlaceholder?: string }> = {
  dashboard:    { title: "Dashboard",       searchPlaceholder: "Search dashboard..." },
  pos:          { title: "POS / Sales",     searchPlaceholder: "Search products, invoices, or customers..." },
  inventory:    { title: "Inventory",       searchPlaceholder: "Search SKU, item name, or brand..." },
  purchasing:   { title: "Purchasing",      searchPlaceholder: "Search suppliers, PO numbers, or items..." },
  receivables:  { title: "Receivables",     subtitle: "Manage customer credit invoices and collections", searchPlaceholder: "Search invoice #, customer, or amount..." },
  payables:     { title: "Payables",        subtitle: "Manage your supplier bills and payments",         searchPlaceholder: "Search bill #, supplier, or amount..." },
  customers:    { title: "Customers",       searchPlaceholder: "Search customers, contact, or balance..." },
  suppliers:    { title: "Suppliers",       searchPlaceholder: "Search suppliers, parts, or terms..." },
  reports:      { title: "Reports",         searchPlaceholder: "Search report name or metric..." },
  "users-roles":{ title: "Users & Roles",   searchPlaceholder: "Search users or permissions..." },
  settings:     { title: "Settings",        searchPlaceholder: "Search settings..." },
};

// Inner shell — runs inside RbacProvider so it can use useRbac()
function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { loading } = useRbac();

  const isAuthScreen = PUBLIC_ROUTES.includes(pathname);
  const isPosScreen  = pathname === "/pos";
  const activeSection = pathname.split("/")[1] || "dashboard";

  if (isAuthScreen) return <>{children}</>;

  // Full-screen spinner while checking auth/permissions
  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--bg-primary, #0f172a)",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "3px solid #334155", borderTopColor: "#3181f6",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ color: "#94a3b8", fontSize: 13 }}>Loading permissions…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const topBarMeta = routeMeta[activeSection] ?? { title: "WAP POS", searchPlaceholder: "Search..." };

  return (
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
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RbacProvider>
      <ShellInner>{children}</ShellInner>
    </RbacProvider>
  );
}

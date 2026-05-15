"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthScreen = pathname === "/" || pathname === "/login";

  if (isAuthScreen) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <TopBar title="Dashboard" subtitle="Welcome back, User! Here's what's happening with your business today." />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

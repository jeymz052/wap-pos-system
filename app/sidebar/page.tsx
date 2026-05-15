"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  BookOpen,
  CreditCard,
  Users,
  Truck,
  BarChart2,
  UserCog,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  HelpCircle,
  Download,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",     icon: LayoutDashboard },
  { href: "/pos",         label: "POS / Sales",   icon: ShoppingCart },
  { href: "/inventory",   label: "Inventory",     icon: Package },
  { href: "/purchasing",  label: "Purchasing",    icon: ClipboardList },
  { href: "/receivables", label: "Receivables",   icon: BookOpen },
  { href: "/payables",    label: "Payables",      icon: CreditCard },
  { href: "/customers",   label: "Customers",     icon: Users },
  { href: "/suppliers",   label: "Suppliers",     icon: Truck },
  { href: "/reports",     label: "Reports",       icon: BarChart2 },
  { href: "/users-roles", label: "Users & Roles", icon: UserCog },
  { href: "/settings",    label: "Settings",      icon: Settings },
];

const quickActions = [
  { href: "/customers/new",        label: "Add New Customer",    icon: Plus,       variant: "accent" },
  { href: "/customers/payments",   label: "Customer Payments",   icon: CreditCard, variant: "green"  },
  { href: "/customers/statements", label: "Customer Statements", icon: BookOpen,   variant: ""       },
  { href: "/customers/import",     label: "Import Customers",    icon: Download,   variant: ""       },
];

export default function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}
      style={{ width: collapsed ? 62 : 210 }}
    >
      {/* Logo */}
      <div className="sidebar__brand">
        <Image
          src="/images/poslogo2.png"
          alt="WAP POS"
          width={collapsed ? 30 : 108}
          height={collapsed ? 30 : 52}
          style={{ objectFit: "contain", transition: "all 0.22s" }}
          priority
        />
      </div>

      {/* Collapse toggle */}
      <button
        className="sidebar__collapse-btn"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
      </button>

      {/* Nav */}
      <nav className="sidebar__nav">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
            >
              <span className="sidebar__item-icon">
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
              </span>
              {!collapsed && (
                <span className="sidebar__item-label">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="sidebar__section-divider" />

      {/* Quick Actions */}
      {!collapsed && (
        <div className="sidebar__quick-actions">
          <p className="sidebar__section-title">Quick Actions</p>
          {quickActions.map(({ href, label, icon: Icon, variant }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar__quick-action${variant ? ` sidebar__quick-action--${variant}` : ""}`}
            >
              <span className="sidebar__quick-icon">
                <Icon size={13} strokeWidth={2} />
              </span>
              <span className="sidebar__quick-label">{label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="sidebar__footer">
        {!collapsed && (
          <Link href="/help" className="sidebar__help-link">
            <HelpCircle size={13} strokeWidth={1.6} />
            <span>Need Help?</span>
          </Link>
        )}
        {!collapsed && (
          <div className="sidebar__version">
            <Zap size={10} />
            <span>WAP POS v1.0.0</span>
          </div>
        )}
      </div>
    </aside>
  );
}
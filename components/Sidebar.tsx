"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import {
  FaBoxOpen, FaCalculator, FaClipboardList, FaDownload,
  FaFileAlt, FaHistory, FaHome, FaMoneyBillWave, FaPlus,
  FaShoppingCart, FaTruck, FaUserCog, FaUsers, FaBolt, FaCog,
  FaBarcode, FaExchangeAlt, FaFileInvoiceDollar,
  FaFileInvoice, FaBox, FaUserPlus, FaSignOutAlt,
} from "react-icons/fa";
import { useRbac } from "@/components/RbacProvider";
import { type Permission } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  permission: Permission | null;
}> = [
  { href: "/dashboard",   label: "Dashboard",    icon: FaHome,          permission: null },
  { href: "/pos",         label: "POS / Sales",  icon: FaShoppingCart,  permission: "pos:view" },
  { href: "/inventory",   label: "Inventory",    icon: FaBoxOpen,       permission: "inventory:view" },
  { href: "/purchasing",  label: "Purchasing",   icon: FaClipboardList, permission: "purchasing:view" },
  { href: "/receivables", label: "Receivables",  icon: FaFileAlt,       permission: "receivables:view" },
  { href: "/payables",    label: "Payables",     icon: FaMoneyBillWave, permission: "payables:view" },
  { href: "/customers",   label: "Customers",    icon: FaUsers,         permission: "customers:view" },
  { href: "/suppliers",   label: "Suppliers",    icon: FaTruck,         permission: "suppliers:view" },
  { href: "/reports",     label: "Reports",      icon: FaCalculator,    permission: "reports:view" },
  { href: "/users-roles", label: "Users & Roles",icon: FaUserCog,       permission: "users:view" },
  { href: "/settings",    label: "Settings",     icon: FaCog,           permission: "settings:view" },
];

type QuickAction = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  accent?: boolean;
  success?: boolean;
  muted?: boolean;
  permission?: Permission;
};

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  dashboard: [
    { id: "dashboard-sales", href: "/pos", label: "New Sale (POS)", icon: FaShoppingCart, accent: true, permission: "pos:create" },
    { id: "dashboard-item", href: "/inventory", label: "Add Item", icon: FaBox, permission: "inventory:create" },
    { id: "dashboard-receive", href: "/purchasing", label: "Receive Items", icon: FaDownload, muted: true, permission: "purchasing:view" },
  ],
  pos: [
    { id: "pos-sale", href: "/pos", label: "New Sale (POS)", icon: FaShoppingCart, accent: true, permission: "pos:create" },
    { id: "pos-customer", href: "/customers", label: "Customer Lookup", icon: FaUsers, permission: "customers:view" },
    { id: "pos-hold", href: "/reports", label: "Recent Transactions", icon: FaHistory, muted: true, permission: "reports:view" },
  ],
  inventory: [
    { id: "inventory-item", href: "/inventory", label: "Add New Item", icon: FaPlus, accent: true, permission: "inventory:create" },
    { id: "inventory-adjust", href: "/inventory", label: "Stock Adjustment", icon: FaExchangeAlt, muted: true, permission: "inventory:adjust_stock" },
    { id: "inventory-barcode", href: "/inventory", label: "Barcode Printing", icon: FaBarcode, muted: true, permission: "inventory:print_barcode" },
  ],
  purchasing: [
    { id: "purchasing-po", href: "/purchasing", label: "New Purchase Order", icon: FaClipboardList, accent: true, permission: "purchasing:create" },
    { id: "purchasing-returns", href: "/purchasing", label: "Purchase Returns", icon: FaFileInvoice, muted: true, permission: "purchasing:view" },
    { id: "purchasing-import", href: "/inventory", label: "Import Items", icon: FaDownload, muted: true, permission: "inventory:create" },
  ],
  receivables: [
    { id: "receivables-invoice", href: "/receivables", label: "New Invoice (Credit)", icon: FaFileInvoiceDollar, accent: true, permission: "receivables:create" },
    { id: "receivables-payment", href: "/receivables", label: "Receive Payment", icon: FaMoneyBillWave, success: true, permission: "receivables:edit" },
    { id: "receivables-customers", href: "/customers", label: "Customer List", icon: FaUsers, muted: true, permission: "customers:view" },
    { id: "receivables-aging", href: "/reports", label: "Aging Report", icon: FaCalculator, muted: true, permission: "reports:view" },
  ],
  payables: [
    { id: "payables-bill", href: "/payables", label: "New Bill", icon: FaFileInvoiceDollar, accent: true, permission: "payables:create" },
    { id: "payables-payment", href: "/payables", label: "Make Payment", icon: FaMoneyBillWave, success: true, permission: "payables:edit" },
    { id: "payables-supplier", href: "/suppliers", label: "Supplier List", icon: FaTruck, muted: true, permission: "suppliers:view" },
    { id: "payables-aging", href: "/reports", label: "Aging Report", icon: FaCalculator, muted: true, permission: "reports:view" },
    { id: "payables-history", href: "/payables", label: "Payment History", icon: FaHistory, muted: true, permission: "payables:view" },
  ],
  customers: [
    { id: "customers-add", href: "/customers", label: "Add New Customer", icon: FaUserPlus, accent: true, permission: "customers:create" },
    { id: "customers-payments", href: "/customers", label: "Customer Payments", icon: FaMoneyBillWave, success: true, permission: "customers:view" },
    { id: "customers-statements", href: "/customers", label: "Customer Statements", icon: FaFileAlt, muted: true, permission: "customers:view" },
    { id: "customers-import", href: "/customers", label: "Import Customers", icon: FaDownload, muted: true, permission: "customers:create" },
  ],
  suppliers: [
    { id: "suppliers-add", href: "/suppliers", label: "Add New Supplier", icon: FaTruck, accent: true, permission: "suppliers:create" },
    { id: "suppliers-po", href: "/purchasing", label: "Create Purchase Order", icon: FaClipboardList, muted: true, permission: "purchasing:create" },
    { id: "suppliers-import", href: "/suppliers", label: "Import Suppliers", icon: FaDownload, muted: true, permission: "suppliers:create" },
  ],
  reports: [
    { id: "reports-sales", href: "/reports", label: "Sales Report", icon: FaCalculator, accent: true, permission: "reports:view" },
    { id: "reports-inventory", href: "/reports", label: "Inventory Report", icon: FaBoxOpen, muted: true, permission: "reports:view" },
    { id: "reports-aging", href: "/reports", label: "Aging Report", icon: FaHistory, muted: true, permission: "reports:view" },
  ],
  "users-roles": [
    { id: "users-add", href: "/users-roles", label: "Add New User", icon: FaUserCog, accent: true, permission: "users:create" },
    { id: "users-roles-manage", href: "/users-roles", label: "Manage Roles", icon: FaUsers, muted: true, permission: "users:manage" },
    { id: "users-permissions", href: "/users-roles", label: "Permissions", icon: FaCog, muted: true, permission: "users:manage" },
  ],
  settings: [
    { id: "settings-company", href: "/settings", label: "Company Setup", icon: FaCog, accent: true, permission: "settings:edit" },
    { id: "settings-backup", href: "/settings", label: "Backup Data", icon: FaDownload, muted: true, permission: "settings:manage" },
    { id: "settings-users", href: "/users-roles", label: "Users & Roles", icon: FaUserCog, muted: true, permission: "users:view" },
  ],
};

function getActiveSection(pathname: string) {
  const section = pathname.split("/")[1] || "dashboard";
  return QUICK_ACTIONS[section] ? section : "dashboard";
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useRbac();
  const activeSection = getActiveSection(pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", "156px");
  }, []);

  const visibleNav = NAV_ITEMS.filter((item) =>
    item.permission === null || can(item.permission)
  );

  const quickActions = (QUICK_ACTIONS[activeSection] ?? []).filter((qa) =>
    !qa.permission || can(qa.permission)
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <>
      <button
        className="sidebar__hamburger"
        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        aria-label="Toggle menu"
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
      </button>

      {isMobileMenuOpen && (
        <div className="sidebar__overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? "sidebar--mobile-open" : ""}`}>
        <div className="sidebar__brand">
          <Image
            src="/images/poslogo2.png"
            alt="WAP POS"
            width={120}
            height={80}
            priority
            className="sidebar__logo"
          />
          <p className="sidebar__tagline">Motorparts POS &amp; inventory system</p>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`sidebar__item ${active ? "sidebar__item--active" : ""}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="sidebar__item-icon"><Icon size={12} /></span>
                <span className="sidebar__item-label">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__section-divider" />

        {quickActions.length > 0 && (
          <div className="sidebar__quick-actions">
            <div className="sidebar__section-title">Quick Actions</div>
            {quickActions.map(({ id, href, label, icon: Icon, accent, success, muted }) => (
              <Link
                key={id}
                href={href}
                className={`sidebar__quick-action ${accent ? "sidebar__quick-action--accent" : ""} ${success ? "sidebar__quick-action--success" : ""} ${muted ? "sidebar__quick-action--muted" : ""}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="sidebar__item-icon sidebar__item-icon--quick"><Icon size={11} /></span>
                <span className="sidebar__quick-label">{label}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="sidebar__footer">
          <button
            className="sidebar__help sidebar__help--btn"
            onClick={() => void handleSignOut()}
            title="Sign out"
          >
            <span className="sidebar__help-icon"><FaSignOutAlt size={10} /></span>
            <span>Sign Out</span>
          </button>
          <div className="sidebar__version">
            <FaBolt size={9} />
            <span>WAP POS v1.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}

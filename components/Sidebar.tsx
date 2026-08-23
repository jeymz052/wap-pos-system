"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import {
  FaBoxOpen, FaCalculator, FaClipboardList, FaDownload,
  FaFileAlt, FaHistory, FaHome, FaMoneyBillWave, FaPlus,
  FaShoppingCart, FaTruck, FaUserCog, FaUsers, FaBolt, FaCog,
  FaBarcode, FaExchangeAlt, FaFileInvoiceDollar,
  FaFileInvoice, FaBox, FaUserPlus, FaSignOutAlt, FaShieldAlt, FaReceipt, FaClipboardCheck,
  FaBell, FaCreditCard,
} from "react-icons/fa";
import { useRbac } from "@/components/RbacProvider";
import { useSubscriptionAccess } from "@/components/SubscriptionProvider";
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
  { href: "/catalog",     label: "Catalog",      icon: FaBox,           permission: "inventory:view" },
  { href: "/purchasing",  label: "Purchasing",   icon: FaClipboardList, permission: "purchasing:view" },
  { href: "/sales-orders",label: "Quotes & Orders", icon: FaFileInvoice, permission: "sales_orders:view" },
  { href: "/expenses",    label: "Expenses",     icon: FaReceipt,       permission: "expenses:view" },
  { href: "/receivables", label: "Receivables",  icon: FaFileAlt,       permission: "receivables:view" },
  { href: "/payables",    label: "Payables",     icon: FaMoneyBillWave, permission: "payables:view" },
  { href: "/customers",   label: "Customers",    icon: FaUsers,         permission: "customers:view" },
  { href: "/returns",     label: "Returns",      icon: FaExchangeAlt,   permission: "returns:view" },
  { href: "/suppliers",   label: "Suppliers",    icon: FaTruck,         permission: "suppliers:view" },
  { href: "/branches",    label: "Branches",     icon: FaBoxOpen,        permission: "branches:view" },
  { href: "/reports",     label: "Reports",      icon: FaCalculator,    permission: "reports:view" },
  { href: "/notifications", label: "Notifications", icon: FaBell,       permission: "notifications:view" },
  { href: "/subscription", label: "Subscription", icon: FaCreditCard,   permission: "subscriptions:view" },
  { href: "/audit-logs",  label: "Audit Logs",   icon: FaClipboardCheck, permission: "audit_logs:view" },
  { href: "/users-roles", label: "Users & Roles",icon: FaUserCog,       permission: "users:view" },
  { href: "/settings",    label: "Settings",     icon: FaCog,           permission: "settings:view" },
  { href: "/security",    label: "Security",     icon: FaShieldAlt,     permission: null },
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
    { id: "inventory-catalog", href: "/catalog", label: "Catalog Setup", icon: FaBox, muted: true, permission: "inventory:view" },
    { id: "inventory-adjust", href: "/inventory", label: "Stock Adjustment", icon: FaExchangeAlt, muted: true, permission: "inventory:adjust_stock" },
    { id: "inventory-barcode", href: "/inventory", label: "Barcode Printing", icon: FaBarcode, muted: true, permission: "inventory:print_barcode" },
  ],
  catalog: [
    { id: "catalog-category", href: "/catalog", label: "Category Manager", icon: FaBox, accent: true, permission: "inventory:view" },
    { id: "catalog-compatibility", href: "/catalog", label: "Compatibility Map", icon: FaExchangeAlt, muted: true, permission: "inventory:view" },
    { id: "catalog-products", href: "/inventory", label: "Product Inventory", icon: FaBoxOpen, muted: true, permission: "inventory:view" },
  ],
  purchasing: [
    { id: "purchasing-po", href: "/purchasing", label: "New Purchase Order", icon: FaClipboardList, accent: true, permission: "purchasing:create" },
    { id: "purchasing-returns", href: "/purchasing", label: "Purchase Returns", icon: FaFileInvoice, muted: true, permission: "purchasing:view" },
    { id: "purchasing-import", href: "/inventory", label: "Import Items", icon: FaDownload, muted: true, permission: "inventory:create" },
  ],
  "sales-orders": [
    { id: "sales-orders-quote", href: "/sales-orders", label: "New Quotation", icon: FaFileInvoice, accent: true, permission: "sales_orders:create" },
    { id: "sales-orders-order", href: "/sales-orders", label: "New Sales Order", icon: FaClipboardList, muted: true, permission: "sales_orders:create" },
    { id: "sales-orders-customer", href: "/customers", label: "Customer Pricing", icon: FaUsers, muted: true, permission: "customers:view" },
  ],
  expenses: [
    { id: "expenses-new", href: "/expenses", label: "Record Expense", icon: FaReceipt, accent: true, permission: "expenses:create" },
    { id: "expenses-approve", href: "/expenses", label: "Approval Queue", icon: FaShieldAlt, muted: true, permission: "expenses:approve" },
    { id: "expenses-report", href: "/expenses", label: "Expense Report", icon: FaCalculator, muted: true, permission: "expenses:view" },
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
  returns: [
    { id: "returns-new", href: "/returns", label: "New Return Request", icon: FaExchangeAlt, accent: true, permission: "returns:create" },
    { id: "returns-approvals", href: "/returns", label: "Refund Approvals", icon: FaShieldAlt, muted: true, permission: "returns:manage" },
    { id: "returns-warranty", href: "/returns", label: "Warranty Claims", icon: FaHistory, muted: true, permission: "returns:view" },
  ],
  suppliers: [
    { id: "suppliers-add", href: "/suppliers", label: "Add New Supplier", icon: FaTruck, accent: true, permission: "suppliers:create" },
    { id: "suppliers-po", href: "/purchasing", label: "Create Purchase Order", icon: FaClipboardList, muted: true, permission: "purchasing:create" },
    { id: "suppliers-import", href: "/suppliers", label: "Import Suppliers", icon: FaDownload, muted: true, permission: "suppliers:create" },
  ],
  branches: [
    { id: "branches-view", href: "/branches", label: "Owner Dashboard", icon: FaHome, accent: true, permission: "branches:view" },
    { id: "branches-transfer", href: "/branches", label: "Branch Transfers", icon: FaExchangeAlt, muted: true, permission: "inventory:transfer_stock" },
    { id: "branches-pricing", href: "/branches", label: "Branch Pricing", icon: FaMoneyBillWave, muted: true, permission: "branches:manage" },
  ],
  reports: [
    { id: "reports-sales", href: "/reports", label: "Sales Report", icon: FaCalculator, accent: true, permission: "reports:view" },
    { id: "reports-inventory", href: "/reports", label: "Inventory Report", icon: FaBoxOpen, muted: true, permission: "reports:view" },
    { id: "reports-aging", href: "/reports", label: "Aging Report", icon: FaHistory, muted: true, permission: "reports:view" },
  ],
  notifications: [
    { id: "notifications-inbox", href: "/notifications", label: "Alert Inbox", icon: FaBell, accent: true, permission: "notifications:view" },
    { id: "notifications-inventory", href: "/inventory", label: "Inventory Health", icon: FaBoxOpen, muted: true, permission: "inventory:view" },
    { id: "notifications-receivables", href: "/receivables", label: "Credit Follow-up", icon: FaMoneyBillWave, muted: true, permission: "receivables:view" },
  ],
  subscription: [
    { id: "subscription-plan", href: "/subscription", label: "Plan & Limits", icon: FaCreditCard, accent: true, permission: "subscriptions:view" },
    { id: "subscription-billing", href: "/subscription", label: "Billing History", icon: FaFileInvoiceDollar, muted: true, permission: "subscriptions:view" },
    { id: "subscription-settings", href: "/settings", label: "System Settings", icon: FaCog, muted: true, permission: "settings:view" },
  ],
  "audit-logs": [
    { id: "audit-logs-activity", href: "/audit-logs", label: "Activity Trail", icon: FaClipboardCheck, accent: true, permission: "audit_logs:view" },
    { id: "audit-logs-logins", href: "/audit-logs?kind=login_history", label: "Login History", icon: FaShieldAlt, muted: true, permission: "audit_logs:view" },
    { id: "audit-logs-voids", href: "/audit-logs?kind=void_log", label: "Void & Refund Logs", icon: FaHistory, muted: true, permission: "audit_logs:view" },
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
  security: [
    { id: "security-history", href: "/security", label: "Login History", icon: FaHistory, accent: true },
    { id: "security-password", href: "/security", label: "Change Password", icon: FaShieldAlt, muted: true },
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
  const { hasFeature } = useSubscriptionAccess();
  const activeSection = getActiveSection(pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // mounted guard — prevents SSR/client HTML mismatch from permission filtering
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", "198px");
  }, []);

  // Before mount, show all items (matches SSR output). After mount, apply RBAC filter.
  const visibleNav = mounted
    ? NAV_ITEMS.filter((item) => {
        if (item.href === "/audit-logs" && !hasFeature("audit_logs")) return false;
        return item.permission === null || can(item.permission);
      })
    : NAV_ITEMS;

  const quickActions = mounted
    ? (QUICK_ACTIONS[activeSection] ?? []).filter((qa) => {
        if (qa.id === "branches-transfer" && !hasFeature("multi_branch_transfers")) return false;
        if (qa.id === "inventory-barcode" && !hasFeature("barcode_printing")) return false;
        if (activeSection === "audit-logs" && !hasFeature("audit_logs")) return false;
        return !qa.permission || can(qa.permission);
      })
    : (QUICK_ACTIONS[activeSection] ?? []);

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

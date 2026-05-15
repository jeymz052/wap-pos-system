"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  FaBoxOpen,
  FaCalculator,
  FaClipboardList,
  FaDownload,
  FaFileAlt,
  FaHistory,
  FaHome,
  FaMoneyBillWave,
  FaPlus,
  FaShoppingCart,
  FaTruck,
  FaUserCog,
  FaUsers,
  FaBolt,
  FaCog,
  FaQuestionCircle,
  FaBarcode,
  FaExchangeAlt,
  FaFileInvoiceDollar,
  FaFileInvoice,
  FaBox,
  FaUserPlus,
} from "react-icons/fa";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: FaHome },
  { href: "/pos", label: "POS / Sales", icon: FaShoppingCart },
  { href: "/inventory", label: "Inventory", icon: FaBoxOpen },
  { href: "/purchasing", label: "Purchasing", icon: FaClipboardList },
  { href: "/receivables", label: "Receivables", icon: FaFileAlt },
  { href: "/payables", label: "Payables", icon: FaMoneyBillWave },
  { href: "/customers", label: "Customers", icon: FaUsers },
  { href: "/suppliers", label: "Suppliers", icon: FaTruck },
  { href: "/reports", label: "Reports", icon: FaCalculator },
  { href: "/users-roles", label: "Users & Roles", icon: FaUserCog },
  { href: "/settings", label: "Settings", icon: FaCog },
];

type QuickAction = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  accent?: boolean;
  success?: boolean;
  muted?: boolean;
};

const quickActionsBySection: Record<string, QuickAction[]> = {
  dashboard: [
    { id: "dashboard-sales", href: "/pos", label: "New Sale (POS)", icon: FaShoppingCart, accent: true },
    { id: "dashboard-item", href: "/inventory", label: "Add Item", icon: FaBox },
    { id: "dashboard-receive", href: "/purchasing", label: "Receive Items", icon: FaDownload, muted: true },
  ],
  pos: [
    { id: "pos-sale", href: "/pos", label: "New Sale (POS)", icon: FaShoppingCart, accent: true },
    { id: "pos-customer", href: "/customers", label: "Customer Lookup", icon: FaUsers },
    { id: "pos-hold", href: "/reports", label: "Recent Transactions", icon: FaHistory, muted: true },
  ],
  inventory: [
    { id: "inventory-item", href: "/inventory", label: "Add New Item", icon: FaPlus, accent: true },
    { id: "inventory-adjust", href: "/inventory", label: "Stock Adjustment", icon: FaExchangeAlt, muted: true },
    { id: "inventory-barcode", href: "/inventory", label: "Barcode Printing", icon: FaBarcode, muted: true },
  ],
  purchasing: [
    { id: "purchasing-po", href: "/purchasing", label: "New Purchase Order", icon: FaClipboardList, accent: true },
    { id: "purchasing-returns", href: "/purchasing", label: "Purchase Returns", icon: FaFileInvoice, muted: true },
    { id: "purchasing-import", href: "/inventory", label: "Import Items", icon: FaDownload, muted: true },
  ],
  receivables: [
    { id: "receivables-invoice", href: "/receivables", label: "New Invoice (Credit)", icon: FaFileInvoiceDollar, accent: true },
    { id: "receivables-payment", href: "/receivables", label: "Receive Payment", icon: FaMoneyBillWave, success: true },
    { id: "receivables-customers", href: "/customers", label: "Customer List", icon: FaUsers, muted: true },
    { id: "receivables-aging", href: "/reports", label: "Aging Report", icon: FaCalculator, muted: true },
  ],
  payables: [
    { id: "payables-bill", href: "/payables", label: "New Bill", icon: FaFileInvoiceDollar, accent: true },
    { id: "payables-payment", href: "/payables", label: "Make Payment", icon: FaMoneyBillWave, success: true },
    { id: "payables-supplier", href: "/suppliers", label: "Supplier List", icon: FaTruck, muted: true },
    { id: "payables-aging", href: "/reports", label: "Aging Report", icon: FaCalculator, muted: true },
    { id: "payables-history", href: "/payables", label: "Payment History", icon: FaHistory, muted: true },
  ],
  customers: [
    { id: "customers-add", href: "/customers", label: "Add New Customer", icon: FaUserPlus, accent: true },
    { id: "customers-payments", href: "/customers", label: "Customer Payments", icon: FaMoneyBillWave, success: true },
    { id: "customers-statements", href: "/customers", label: "Customer Statements", icon: FaFileAlt, muted: true },
    { id: "customers-import", href: "/customers", label: "Import Customers", icon: FaDownload, muted: true },
  ],
  suppliers: [
    { id: "suppliers-add", href: "/suppliers", label: "Add New Supplier", icon: FaTruck, accent: true },
    { id: "suppliers-po", href: "/purchasing", label: "Create Purchase Order", icon: FaClipboardList, muted: true },
    { id: "suppliers-import", href: "/suppliers", label: "Import Suppliers", icon: FaDownload, muted: true },
  ],
  reports: [
    { id: "reports-sales", href: "/reports", label: "Sales Report", icon: FaCalculator, accent: true },
    { id: "reports-inventory", href: "/reports", label: "Inventory Report", icon: FaBoxOpen, muted: true },
    { id: "reports-aging", href: "/reports", label: "Aging Report", icon: FaHistory, muted: true },
  ],
  "users-roles": [
    { id: "users-add", href: "/users-roles", label: "Add New User", icon: FaUserCog, accent: true },
    { id: "users-roles-manage", href: "/users-roles", label: "Manage Roles", icon: FaUsers, muted: true },
    { id: "users-permissions", href: "/users-roles", label: "Permissions", icon: FaCog, muted: true },
  ],
  settings: [
    { id: "settings-company", href: "/settings", label: "Company Setup", icon: FaCog, accent: true },
    { id: "settings-backup", href: "/settings", label: "Backup Data", icon: FaDownload, muted: true },
    { id: "settings-users", href: "/users-roles", label: "Users & Roles", icon: FaUserCog, muted: true },
  ],
};

function getActiveSection(pathname: string) {
  const section = pathname.split("/")[1] || "dashboard";

  return quickActionsBySection[section] ? section : "dashboard";
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeSection = getActiveSection(pathname);
  const quickActions = quickActionsBySection[activeSection];

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", "210px");
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Image
          src="/images/poslogo2.png"
          alt="WAP POS"
          width={120}
          height={80}
          priority
          className="sidebar__logo"
        />
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={`sidebar__item ${active ? "sidebar__item--active" : ""}`}
            >
              <span className="sidebar__item-icon">
                <Icon size={12} />
              </span>
              <span className="sidebar__item-label">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__section-divider" />

      <div className="sidebar__quick-actions">
        <div className="sidebar__section-title">Quick Actions</div>
        {quickActions.map(({ id, href, label, icon: Icon, accent, success, muted }) => (
          <Link
            key={id}
            href={href}
            className={`sidebar__quick-action ${accent ? "sidebar__quick-action--accent" : ""} ${success ? "sidebar__quick-action--success" : ""} ${muted ? "sidebar__quick-action--muted" : ""}`}
          >
            <span className="sidebar__item-icon sidebar__item-icon--quick">
              <Icon size={11} />
            </span>
            <span className="sidebar__quick-label">{label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__help">
          <span className="sidebar__help-icon">
            <FaQuestionCircle size={10} />
          </span>
          <span>Need Help?</span>
        </div>
        <div className="sidebar__version">
          <FaBolt size={9} />
          <span>WAP POS v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}

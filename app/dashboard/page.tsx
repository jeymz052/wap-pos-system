"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  DollarSign,
  LayoutDashboard,
  Package,
  Sparkles,
  ShoppingBag,
  Truck,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";

type BranchOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  role_id: string | null;
  branch_id: string | null;
};

type RoleRow = {
  name: string;
};

type SaleRow = {
  id: string;
  invoice_number: string;
  total_amount: string | number;
  created_at: string;
  customer_id: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
};

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: string | number;
  cost_price: string | number | null;
  total_price: string | number;
};

type ProductRow = {
  id: string;
  name: string;
  category_id: string | null;
  reorder_level: number | null;
  critical_stock_level: number | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

type InventoryRow = {
  product_id: string;
  quantity: number;
};

type DashboardMetric = {
  label: string;
  value: string;
  sub: string;
  icon: typeof TrendingUp;
  color: "blue" | "purple" | "green" | "orange" | "red";
};

type DashboardState = {
  metrics: DashboardMetric[];
  salesSummary: Array<{ name: string; sales: number }>;
  categorySummary: Array<{ name: string; value: number; amount: number }>;
  comparison: Array<{ name: string; value: number }>;
  topSelling: Array<{ name: string; qty: string; amount: string }>;
  recentTransactions: Array<{ invoice: string; customer: string; amount: string }>;
  lowStock: Array<{ name: string; stock: number }>;
  businessSummary: Array<{ icon: typeof Package; label: string; value: string; color: string }>;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-PH");

function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace("PHP", "₱");
}

function formatPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue >= 0 ? "+" : ""}${safeValue.toFixed(1)}%`;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  return { start, end };
}

function getPreviousMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return { start, end };
}

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "WA";
}

function sampleSeries(data: Array<{ name: string; sales: number }>, targetPoints: number) {
  if (data.length <= targetPoints) return data;
  const sampled: Array<{ name: string; sales: number }> = [];
  const step = (data.length - 1) / (targetPoints - 1);

  for (let index = 0; index < targetPoints; index += 1) {
    const sourceIndex = Math.round(index * step);
    sampled.push(data[sourceIndex]);
  }

  return sampled;
}

const categoryColors = ["#1e40af", "#ef4444", "#22c55e", "#7c3aed", "#f59e0b"];

export default function DashboardPage() {
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [headerName, setHeaderName] = useState("User");
  const [headerRole, setHeaderRole] = useState("User");
  const [headerEmail, setHeaderEmail] = useState("-");
  const [headerUsername, setHeaderUsername] = useState("User");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [todayLabel] = useState(() =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date())
  );
  const [dashboard, setDashboard] = useState<DashboardState>({
    metrics: [
      { label: "Total Sales", value: formatCurrency(0), sub: "+0.0% vs last month", icon: TrendingUp, color: "blue" },
      { label: "Total Orders", value: "0", sub: "+0.0% vs last month", icon: ShoppingBag, color: "purple" },
      { label: "Gross Profit", value: formatCurrency(0), sub: "+0.0% vs last month", icon: DollarSign, color: "green" },
      { label: "Total Customers", value: "0", sub: "+0.0% vs last month", icon: Users, color: "orange" },
      { label: "Low Stock Items", value: "0", sub: "View Items", icon: AlertTriangle, color: "red" },
    ],
    salesSummary: [],
    categorySummary: [],
    comparison: [
      { name: "This Month", value: 0 },
      { name: "Last Month", value: 0 },
    ],
    topSelling: [],
    recentTransactions: [],
    lowStock: [],
    businessSummary: [
      { icon: Package, label: "Total Products", value: "0", color: "#1e88e5" },
      { icon: Users, label: "Active Customers", value: "0", color: "#2563eb" },
      { icon: Truck, label: "Active Suppliers", value: "0", color: "#f59e0b" },
      { icon: Users, label: "Total Users", value: "0", color: "#7c3aed" },
      { icon: ArrowUpRight, label: "Branches", value: "0", color: "#0f172a" },
      { icon: CheckCircle, label: "System Status", value: "Online", color: "#16a34a" },
    ],
  });

  useEffect(() => {
    let isMounted = true;

    const loadBranches = async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, is_main")
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true });

      if (!isMounted) return;

      const branchList = (data ?? []) as BranchOption[];
      setBranches(branchList);

      if (branchList.length > 0) {
        const mainBranch = branchList.find((branch) => branch.is_main) ?? branchList[0];
        setSelectedBranchId((current) => current || mainBranch.id);
      }
    };

    void loadBranches();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let isMounted = true;

    const loadDashboard = async (authUser: { id: string; email?: string } | null | undefined) => {
      if (!authUser) return;

      console.log("[Dashboard] Auth user:", authUser?.email || "NULL");

      const now = new Date();
      const currentMonth = getMonthRange(now);
      const previousMonth = getPreviousMonthRange(now);

      const profileByAuthPromise = authUser?.id
        ? supabase
            .from("users")
            .select("id, first_name, last_name, username, email, role_id, branch_id")
            .eq("auth_id", authUser.id)
            .maybeSingle()
        : Promise.resolve({ data: null });

      const [currentSalesResult, previousSalesResult, currentCustomersResult, previousCustomersResult, activeCustomersResult, inventoryResult, profileResult, unreadNotificationsResult] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_number, total_amount, created_at, customer_id")
          .eq("branch_id", selectedBranchId)
          .eq("status", "completed")
          .gte("created_at", currentMonth.start.toISOString())
          .lt("created_at", currentMonth.end.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("sales")
          .select("id, invoice_number, total_amount, created_at, customer_id")
          .eq("branch_id", selectedBranchId)
          .eq("status", "completed")
          .gte("created_at", previousMonth.start.toISOString())
          .lt("created_at", previousMonth.end.toISOString()),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gte("created_at", currentMonth.start.toISOString())
          .lt("created_at", currentMonth.end.toISOString()),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gte("created_at", previousMonth.start.toISOString())
          .lt("created_at", previousMonth.end.toISOString()),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase
          .from("inventory_stocks")
          .select("product_id, quantity")
          .eq("branch_id", selectedBranchId)
          .order("quantity", { ascending: true }),
        profileByAuthPromise,
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
      ]);

      const currentSales = (currentSalesResult.data ?? []) as SaleRow[];
      const previousSales = (previousSalesResult.data ?? []) as SaleRow[];
      const customersCurrent = currentCustomersResult.count ?? 0;
      const customersPrevious = previousCustomersResult.count ?? 0;
      const activeCustomers = activeCustomersResult.count ?? 0;
      const inventoryStocks = (inventoryResult.data ?? []) as InventoryRow[];
      const profileUser = (profileResult.data as UserRow | null) ?? null;
      const unreadNotifications = unreadNotificationsResult.count ?? 0;

      console.log("[Dashboard] Profile user:", profileUser?.username || "NULL", "auth_id:", authUser?.id);
      console.log("[Dashboard] profileResult.data:", profileResult.data);

      const roleName = profileUser?.role_id
        ? await supabase.from("roles").select("name").eq("id", profileUser.role_id).maybeSingle()
        : { data: null };

      const saleIds = currentSales.map((sale) => sale.id);
      const saleItemsResult = saleIds.length
        ? await supabase
            .from("sale_items")
            .select("sale_id, product_id, quantity, unit_price, cost_price, total_price")
            .in("sale_id", saleIds)
        : { data: [] };

      const saleItems = (saleItemsResult.data ?? []) as SaleItemRow[];
      const productIds = Array.from(new Set([...saleItems.map((item) => item.product_id), ...inventoryStocks.map((item) => item.product_id)]));

      const productsResult = productIds.length
        ? await supabase.from("products").select("id, name, category_id, reorder_level, critical_stock_level").in("id", productIds)
        : { data: [] };

      const products = (productsResult.data ?? []) as ProductRow[];
      const productMap = new Map(products.map((product) => [product.id, product]));

      const categoryIds = Array.from(new Set(products.map((product) => product.category_id).filter(Boolean))) as string[];
      const categoriesResult = categoryIds.length
        ? await supabase.from("categories").select("id, name").in("id", categoryIds)
        : { data: [] };
      const categories = (categoriesResult.data ?? []) as CategoryRow[];
      const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

      const salesSummaryByDate = new Map<string, number>();
      currentSales.forEach((sale) => {
        const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(sale.created_at));
        salesSummaryByDate.set(day, (salesSummaryByDate.get(day) ?? 0) + parseNumber(sale.total_amount));
      });

      const salesSummary = sampleSeries(
        Array.from(salesSummaryByDate.entries()).map(([name, sales]) => ({ name, sales })),
        5
      );

      const currentSalesTotal = currentSales.reduce((sum, sale) => sum + parseNumber(sale.total_amount), 0);
      const previousSalesTotal = previousSales.reduce((sum, sale) => sum + parseNumber(sale.total_amount), 0);
      const saleItemGrossProfit = saleItems.reduce((sum, item) => {
        const costPrice = parseNumber(item.cost_price ?? item.unit_price);
        return sum + (parseNumber(item.total_price) - costPrice * item.quantity);
      }, 0);
      const previousGrossProfit = 0;

      const currentMonthTopCustomers = customersCurrent;
      const previousMonthTopCustomers = customersPrevious;

      const salesGrowth = previousSalesTotal > 0 ? ((currentSalesTotal - previousSalesTotal) / previousSalesTotal) * 100 : 0;
      const ordersGrowth = previousSales.length > 0 ? ((currentSales.length - previousSales.length) / previousSales.length) * 100 : 0;
      const profitGrowth = previousGrossProfit > 0 ? ((saleItemGrossProfit - previousGrossProfit) / previousGrossProfit) * 100 : salesGrowth;
      const customerGrowth = previousMonthTopCustomers > 0 ? ((currentMonthTopCustomers - previousMonthTopCustomers) / previousMonthTopCustomers) * 100 : 0;

      const topSellingMap = new Map<string, { name: string; qty: number; amount: number }>();
      saleItems.forEach((item) => {
        const product = productMap.get(item.product_id);
        const productName = product?.name ?? "Unknown Item";
        const existing = topSellingMap.get(item.product_id) ?? { name: productName, qty: 0, amount: 0 };
        existing.qty += item.quantity;
        existing.amount += parseNumber(item.total_price);
        topSellingMap.set(item.product_id, existing);
      });

      const topSelling = Array.from(topSellingMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map((item) => ({
          name: item.name,
          qty: `${numberFormatter.format(item.qty)} pcs`,
          amount: formatCurrency(item.amount),
        }));

      const recentTransactions = [...currentSales]
        .slice(-5)
        .reverse();
      const customerIds = Array.from(new Set(recentTransactions.map((sale) => sale.customer_id).filter(Boolean))) as string[];
      const customersResult = customerIds.length
        ? await supabase.from("customers").select("id, name").in("id", customerIds)
        : { data: [] };
      const customerMap = new Map((customersResult.data ?? []).map((customer: CustomerRow) => [customer.id, customer.name]));

      const lowStockItems = inventoryStocks
        .map((stock) => {
          const product = productMap.get(stock.product_id);
          const reorderLevel = product?.reorder_level ?? 0;
          const criticalLevel = product?.critical_stock_level ?? 0;
          const threshold = Math.max(reorderLevel, criticalLevel);
          return {
            name: product?.name ?? "Unknown Item",
            stock: stock.quantity,
            threshold,
          };
        })
        .filter((item) => item.threshold > 0 && item.stock <= item.threshold)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5)
        .map((item) => ({ name: item.name, stock: item.stock }));

      const categoryTotals = new Map<string, number>();
      saleItems.forEach((item) => {
        const product = productMap.get(item.product_id);
        const categoryId = product?.category_id;
        const categoryName = (categoryId && categoryMap.get(categoryId)) || "Others";
        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + parseNumber(item.total_price));
      });

      const categorySummary = Array.from(categoryTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({
          name,
          amount,
          value: currentSalesTotal > 0 ? (amount / currentSalesTotal) * 100 : 0,
        }))
        .slice(0, 5);

      const comparison = [
        { name: "This Month", value: currentSalesTotal },
        { name: "Last Month", value: previousSalesTotal },
      ];

      const resolvedUser = resolveCurrentUserInfo({
        authUser,
        profileUser,
        roleName: (roleName.data as RoleRow | null)?.name ?? null,
      });
      const { username, role, email, displayName } = resolvedUser;

      console.log("[Dashboard] Final display - username:", username, "displayName:", displayName, "email:", email, "role:", role);
      const branchCount = branches.length || 0;

      const updatedDashboard: DashboardState = {
        metrics: [
          {
            label: "Total Sales",
            value: formatCurrency(currentSalesTotal),
            sub: `${formatPercent(salesGrowth)} vs last month`,
            icon: TrendingUp,
            color: "blue",
          },
          {
            label: "Total Orders",
            value: numberFormatter.format(currentSales.length),
            sub: `${formatPercent(ordersGrowth)} vs last month`,
            icon: ShoppingBag,
            color: "purple",
          },
          {
            label: "Gross Profit",
            value: formatCurrency(saleItemGrossProfit),
            sub: `${formatPercent(profitGrowth)} vs last month`,
            icon: DollarSign,
            color: "green",
          },
          {
            label: "Total Customers",
            value: numberFormatter.format(activeCustomers),
            sub: `${formatPercent(customerGrowth)} vs last month`,
            icon: Users,
            color: "orange",
          },
          {
            label: "Low Stock Items",
            value: numberFormatter.format(lowStockItems.length),
            sub: "View Items",
            icon: AlertTriangle,
            color: "red",
          },
        ],
        salesSummary,
        categorySummary,
        comparison,
        topSelling,
        recentTransactions: recentTransactions.map((sale) => ({
          invoice: sale.invoice_number,
          customer: sale.customer_id ? customerMap.get(sale.customer_id) ?? "Walk-in Customer" : "Walk-in Customer",
          amount: formatCurrency(parseNumber(sale.total_amount)),
        })),
        lowStock: lowStockItems,
        businessSummary: [
          { icon: Package, label: "Total Products", value: numberFormatter.format(products.length), color: "#1e88e5" },
          { icon: Users, label: "Active Customers", value: numberFormatter.format(activeCustomers), color: "#2563eb" },
          { icon: Truck, label: "Active Suppliers", value: numberFormatter.format(0), color: "#f59e0b" },
          { icon: Users, label: "Total Users", value: numberFormatter.format(1), color: "#7c3aed" },
          { icon: ArrowUpRight, label: "Branches", value: numberFormatter.format(branchCount), color: "#0f172a" },
          { icon: CheckCircle, label: "System Status", value: "Online", color: "#16a34a" },
        ],
      };

      if (!isMounted) return;

      setHeaderName(username);
      setHeaderRole(role);
      setHeaderEmail(email);
      setHeaderUsername(username);
      setNotificationCount(unreadNotifications);
      setDashboard(updatedDashboard);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      void loadDashboard(session?.user);
    });
    
    const unsubscribe = () => data?.subscription?.unsubscribe();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [selectedBranchId, branches.length]);

  const handleProfileSettings = () => {
    setIsProfileMenuOpen(false);
    router.push("/settings");
  };

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const avatarInitials = getInitials(headerName);

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-header__left">
          <div className="dashboard-header__title-row">
            <LayoutDashboard size={18} className="dashboard-header__title-icon" />
            <h1 className="dashboard-header__title">Dashboard Overview</h1>
          </div>
          <p className="dashboard-header__subtitle">Welcome back, {headerName}! Here&apos;s what&apos;s happening with your business today.</p>
        </div>

        <div className="dashboard-header__right">
          <div className="dashboard-toolbar">
            <button type="button" className="dashboard-toolbar__control">
              <CalendarDays size={12} />
              <span>{todayLabel}</span>
              <ChevronDown size={12} />
            </button>

            <label className="dashboard-toolbar__select-wrap">
              <Building2 size={12} />
              <select
                className="dashboard-toolbar__select"
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="dashboard-toolbar__select-icon" />
            </label>

            <button type="button" className="dashboard-toolbar__notif">
              <Bell size={16} />
              <span className="dashboard-toolbar__badge">{notificationCount > 9 ? "9+" : notificationCount}</span>
            </button>

            <div className="dashboard-toolbar__user-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="dashboard-toolbar__user"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <span className="dashboard-toolbar__avatar">{avatarInitials}</span>
                <span className="dashboard-toolbar__user-text">
                  <span className="dashboard-toolbar__user-name">{headerUsername}</span>
                  <span className="dashboard-toolbar__user-role">{headerRole}</span>
                </span>
                <ChevronDown size={12} />
              </button>

              {isProfileMenuOpen && (
                <div className="dashboard-toolbar__menu" role="menu" aria-label="Profile menu">
                  <div className="dashboard-toolbar__menu-section">
                    <span className="dashboard-toolbar__menu-label">Username</span>
                    <span className="dashboard-toolbar__menu-value">{headerUsername}</span>
                  </div>
                  <div className="dashboard-toolbar__menu-section">
                    <span className="dashboard-toolbar__menu-label">Email</span>
                    <span className="dashboard-toolbar__menu-value">{headerEmail}</span>
                  </div>
                  <div className="dashboard-toolbar__menu-section">
                    <span className="dashboard-toolbar__menu-label">Role</span>
                    <span className="dashboard-toolbar__menu-value">{headerRole}</span>
                  </div>

                  <div className="dashboard-toolbar__menu-actions">
                    <button type="button" className="dashboard-toolbar__menu-btn" onClick={handleProfileSettings} role="menuitem">
                      Profile Settings
                    </button>
                    <button
                      type="button"
                      className="dashboard-toolbar__menu-btn dashboard-toolbar__menu-btn--danger"
                      onClick={handleLogout}
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button type="button" className="dashboard-toolbar__customize">
            <Sparkles size={13} />
            <span>Customize Dashboard</span>
          </button>
        </div>
      </div>

      <div className="dashboard-stats stats-row">
        {dashboard.metrics.map((metric) => (
          <div key={metric.label} className="stat-card dashboard-stat-card">
            <div className={`stat-card__icon stat-card__icon--${metric.color}`}>
              <metric.icon size={20} />
            </div>
            <div>
              <div className="stat-card__label">{metric.label}</div>
              <div className="stat-card__value">{metric.value}</div>
              <div className="stat-card__sub">{metric.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid dashboard-grid--top">
        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Sales Summary</span>
            <span className="dashboard-panel__meta">This Month ▾</span>
          </div>
          <div className="dashboard-chart dashboard-chart--line">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard.salesSummary} margin={{ top: 10, right: 18, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#1e88e5"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#1e88e5" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Sales by Category</span>
            <span className="dashboard-panel__meta">This Month ▾</span>
          </div>
          <div className="dashboard-chart dashboard-chart--pie">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard.categorySummary} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3} dataKey="amount">
                  {dashboard.categorySummary.map((entry, index) => (
                    <Cell key={entry.name} fill={categoryColors[index % categoryColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-pie-legend">
            {dashboard.categorySummary.length > 0 ? (
              dashboard.categorySummary.map((item, index) => (
                <div key={item.name} className="dashboard-pie-legend__item">
                  <span className="dashboard-pie-legend__dot" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
                  <span>{item.name}</span>
                  <span>{item.value.toFixed(0)}%</span>
                </div>
              ))
            ) : (
              <div className="dashboard-empty-note">No category sales found for this month.</div>
            )}
          </div>
        </section>

        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Sales Comparison</span>
            <span className="dashboard-panel__meta">vs Last Month ▾</span>
          </div>
          <div className="dashboard-chart dashboard-chart--bar">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={dashboard.comparison} margin={{ top: 10, right: 18, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={88} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="value" fill="#1e88e5" radius={[0, 999, 999, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-comparison">
            <div className="dashboard-comparison__row">
              <span className="dashboard-comparison__label">This Month</span>
              <span className="dashboard-comparison__value">{formatCurrency(dashboard.comparison[0]?.value ?? 0)}</span>
            </div>
            <div className="dashboard-comparison__row dashboard-comparison__row--muted">
              <span className="dashboard-comparison__label">Last Month</span>
              <span className="dashboard-comparison__value">{formatCurrency(dashboard.comparison[1]?.value ?? 0)}</span>
            </div>
            <div className="dashboard-comparison__note">
              {dashboard.comparison[1]?.value
                ? `${formatPercent(((dashboard.comparison[0]?.value ?? 0) - (dashboard.comparison[1]?.value ?? 0)) / (dashboard.comparison[1]?.value ?? 1) * 100)} increase in sales`
                : "No comparison data yet"}
            </div>
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--tables">
        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Top Selling Items</span>
            <span className="dashboard-panel__meta">This Month ▾</span>
          </div>
          <table className="dashboard-table">
            <tbody>
              {dashboard.topSelling.map((item, index) => (
                <tr key={`${item.name}-${index}`}>
                  <td className="dashboard-table__index">{index + 1}</td>
                  <td className="dashboard-table__item">{item.name}</td>
                  <td className="dashboard-table__qty">{item.qty}</td>
                  <td className="dashboard-table__amount">{item.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Recent Transactions</span>
            <span className="dashboard-panel__meta">View All</span>
          </div>
          <table className="dashboard-table dashboard-table--transactions">
            <tbody>
              {dashboard.recentTransactions.map((tx) => (
                <tr key={tx.invoice}>
                  <td className="dashboard-table__index dashboard-table__index--blue">{tx.invoice}</td>
                  <td className="dashboard-table__item">{tx.customer}</td>
                  <td className="dashboard-table__amount">{tx.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="table-card dashboard-panel">
          <div className="table-card__header">
            <span className="table-card__title">Low Stock Alerts</span>
            <span className="dashboard-panel__meta dashboard-panel__meta--red">View All</span>
          </div>
          <div className="dashboard-low-stock">
            {dashboard.lowStock.length > 0 ? (
              dashboard.lowStock.map((item) => (
                <div key={item.name} className="dashboard-low-stock__row">
                  <div className="dashboard-low-stock__item">{item.name}</div>
                  <div className="dashboard-low-stock__badge">Stock: {item.stock}</div>
                </div>
              ))
            ) : (
              <div className="dashboard-empty-note dashboard-empty-note--padded">No low stock items found.</div>
            )}
          </div>
        </section>
      </div>

      <section className="table-card dashboard-panel dashboard-summary">
        <div className="table-card__header">
          <span className="table-card__title">Business Summary</span>
        </div>
        <div className="dashboard-summary__grid">
          {dashboard.businessSummary.map((item) => (
            <div key={item.label} className="dashboard-summary__item">
              <div className="dashboard-summary__icon" style={{ backgroundColor: `${item.color}18`, color: item.color }}>
                <item.icon size={20} />
              </div>
              <div className="dashboard-summary__value" style={{ color: item.color }}>
                {item.value}
              </div>
              <div className="dashboard-summary__label">{item.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

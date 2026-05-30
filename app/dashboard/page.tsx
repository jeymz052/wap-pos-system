"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, BarChart2, Box, Building2,
  CreditCard, DollarSign, LayoutDashboard, Package, ShoppingBag,
  ShoppingCart, Smartphone, TrendingUp, Truck, Users, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { resolveCurrentUserInfo } from "@/lib/current-user";

type Branch = { id: string; name: string; is_main?: boolean };

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("en-PH");
const fc  = (v: number) => PHP.format(v).replace("PHP", "₱");
const BRAND_COLORS = ["#2563eb","#7c3aed","#0891b2","#16a34a","#dc2626","#d97706"];

function KpiCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; trend?: "up"|"down"|"neutral";
}) {
  return (
    <div className="db2-kpi">
      <div className="db2-kpi__icon" style={{ background: `${color}18`, color }}>
        <Icon size={20} />
      </div>
      <div className="db2-kpi__body">
        <div className="db2-kpi__label">{label}</div>
        <div className="db2-kpi__value">{value}</div>
        <div className={`db2-kpi__sub ${trend === "up" ? "db2-kpi__sub--up" : trend === "down" ? "db2-kpi__sub--down" : ""}`}>
          {trend === "up" && <ArrowUp size={10} />}
          {trend === "down" && <ArrowDown size={10} />}
          {sub}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="db2-panel">
      <div className="db2-panel__hd">
        <span className="db2-panel__title">{title}</span>
        {action && <span className="db2-panel__action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="db2-empty">{msg}</div>;
}

export default function DashboardPage() {
  const isMounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const [branchId,  setBranchId]    = useState("");
  const [userName,  setUserName]    = useState("User");

  // Load branches + user
  useEffect(() => {
    let alive = true;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;

      const [profRes, brRes] = await Promise.all([
        supabase.from("users").select("id,first_name,last_name,username,email,role_id,branch_id").eq("auth_id", user.id).maybeSingle(),
        supabase.from("branches").select("id,name,is_main").eq("is_active", true).order("is_main", { ascending: false }).order("name"),
      ]);
      if (!alive) return;

      const prof = profRes.data as Record<string,unknown> | null;
      const brs  = (brRes.data ?? []) as Branch[];

      const saved   = typeof localStorage !== "undefined" ? localStorage.getItem("active_branch_id") : null;
      const defBr   = brs.find(b => b.id === saved) ?? brs.find(b => b.is_main) ?? brs[0];
      if (defBr && !branchId) setBranchId(defBr.id);

      let roleName: string | null = null;
      if (prof?.role_id) {
        const rr = await supabase.from("roles").select("name").eq("id", prof.role_id).maybeSingle();
        roleName = (rr.data as {name?:string}|null)?.name ?? null;
      }
      const resolved = resolveCurrentUserInfo({ authUser: user, profileUser: prof as never, roleName });
      const profileFullName = [prof?.first_name, prof?.last_name]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .trim();
      if (alive) setUserName(profileFullName || resolved.displayName || resolved.username);
    }
    void init();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for branch changes from TopBar
  useEffect(() => {
    const handler = (e: Event) => {
      const b = (e as CustomEvent<Branch>).detail;
      if (b?.id) setBranchId(b.id);
    };
    window.addEventListener("branch-changed", handler);
    return () => window.removeEventListener("branch-changed", handler);
  }, []);

  const data = useDashboardData(branchId);

  // Payment breakdown total
  const pb = data.paymentBreakdown;
  const payTotal = pb.cash + pb.gcash + pb.card + pb.bank + pb.other;

  const payBreakdownItems = [
    { label: "Cash",       value: pb.cash,  color: "#16a34a", icon: Wallet },
    { label: "GCash/eWallet", value: pb.gcash, color: "#7c3aed", icon: Smartphone },
    { label: "Card",       value: pb.card,  color: "#2563eb", icon: CreditCard },
    { label: "Bank",       value: pb.bank,  color: "#0891b2", icon: Building2 },
    { label: "Other",      value: pb.other, color: "#d97706", icon: DollarSign },
  ];

  return (
    <div className="db2-page">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="db2-header">
        <div className="db2-header__left">
          <LayoutDashboard size={18} className="db2-header__icon" />
          <div className="db2-header__copy">
            <span className="db2-header__eyebrow">Overview Workspace</span>
            <h1 className="db2-header__title">Dashboard Overview</h1>
            <p className="db2-header__sub">Welcome back, {userName}. Here&apos;s what&apos;s happening today.</p>
          </div>
        </div>
      </div>

      {data.error && <div className="db2-error">{data.error}</div>}

      {/* ── 8 KPI Cards ────────────────────────────────────────────── */}
      <div className="db2-kpi-grid">
        <KpiCard label="Today's Sales"   value={fc(data.todaySales)}   sub="Today vs yesterday" icon={TrendingUp}   color="#2563eb" />
        <KpiCard label="Today's Profit"  value={fc(data.todayProfit)}  sub="Gross margin today"  icon={DollarSign}  color="#16a34a" />
        <KpiCard label="Inventory Value" value={fc(data.inventoryValue)} sub="Current stock value" icon={Box}        color="#7c3aed" />
        <KpiCard label="Low Stock Alert" value={NUM.format(data.lowStockCount)} sub={`${data.outOfStockCount} out of stock`} icon={AlertTriangle} color="#ef4444" trend="down" />
        <KpiCard label="Total Products"  value={NUM.format(data.totalProducts)} sub="Active SKUs"       icon={Package}    color="#0891b2" />
        <KpiCard label="Total Customers" value={NUM.format(data.totalCustomers)} sub="Active accounts"  icon={Users}      color="#d97706" />
        <KpiCard label="Pending Orders"  value={NUM.format(data.pendingPOCount)} sub="Purchase orders"  icon={ShoppingCart} color="#6d28d9" />
        <KpiCard label="Total Expense"   value={fc(data.totalExpensesMtd)} sub="Month to date"      icon={Wallet}      color="#dc2626" />
      </div>

      {/* ── Financial summary row ──────────────────────────────────── */}
      <div className="db2-fin-row">
        <KpiCard
          label="Net Sales (Today)"
          value={fc(data.netSales)}
          sub="After discounts and refunds"
          icon={ShoppingBag}
          color="#2563eb"
        />
        <KpiCard
          label="Gross Profit (MTD)"
          value={fc(data.grossProfit)}
          sub={`${NUM.format(data.totalTransactions)} month-to-date transactions`}
          icon={BarChart2}
          color="#16a34a"
        />
        <KpiCard
          label="Customer Credit Balance"
          value={fc(data.customerCreditBalance)}
          sub="Open receivables"
          icon={Users}
          color="#7c3aed"
        />
        <KpiCard
          label="Supplier Payable"
          value={fc(data.supplierPayableBalance)}
          sub="Outstanding payables"
          icon={Truck}
          color="#d97706"
        />
      </div>

      {/* ── Payment Breakdown ──────────────────────────────────────── */}
      <Panel title="Today's Payment Breakdown" action={<span>{fc(payTotal)} collected</span>}>
        <div className="db2-pay-grid">
          {payBreakdownItems.map(item => (
            <div key={item.label} className="db2-pay-item">
              <div className="db2-pay-item__icon" style={{ background: `${item.color}18`, color: item.color }}>
                <item.icon size={16} />
              </div>
              <div className="db2-pay-item__label">{item.label}</div>
              <div className="db2-pay-item__value">{fc(item.value)}</div>
              <div className="db2-pay-item__bar-track">
                <div className="db2-pay-item__bar-fill" style={{ width: payTotal > 0 ? `${(item.value / payTotal) * 100}%` : "0%", background: item.color }} />
              </div>
              <div className="db2-pay-item__pct">{payTotal > 0 ? `${((item.value / payTotal) * 100).toFixed(1)}%` : "0%"}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Charts ─────────────────────────────────────────────────── */}
      <div className="db2-chart-row">
        <Panel title="Daily Sales (Last 14 Days)" action={<span>Sales vs profit</span>}>
          <div className="db2-chart-wrap">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailySales} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5edf7" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v, n) => [fc(Number(v)), n === "sales" ? "Sales" : "Profit"]} />
                  <Area type="monotone" dataKey="sales"  stroke="#2563eb" strokeWidth={2} fill="url(#gradSales)"  dot={false} />
                  <Area type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} fill="url(#gradProfit)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="db2-chart-ph" />}
          </div>
        </Panel>

        <Panel title="Monthly Revenue (Last 6 Months)" action={<span>Trend view</span>}>
          <div className="db2-chart-wrap">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlySales} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5edf7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [fc(Number(v)), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {data.monthlySales.map((_, i) => <Cell key={i} fill={i === data.monthlySales.length - 1 ? "#2563eb" : "#bfdbfe"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="db2-chart-ph" />}
          </div>
        </Panel>
      </div>

      {/* ── Top selling & Slow moving ──────────────────────────────── */}
      <div className="db2-table-row">
        <Panel title="Top-Selling Motor Parts" action={<span className="db2-see-all">Last 30 days</span>}>
          {data.topProducts.length === 0 ? <EmptyState msg="No sales data yet." /> : (
            <table className="db2-table">
              <thead><tr><th>#</th><th>Product</th><th className="db2-ta-r">Qty</th><th className="db2-ta-r">Revenue</th></tr></thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={p.name + i}>
                    <td className="db2-table__rank">{i + 1}</td>
                    <td><div className="db2-name-cell"><span className="db2-avatar" style={{ background: `${BRAND_COLORS[i % BRAND_COLORS.length]}22`, color: BRAND_COLORS[i % BRAND_COLORS.length] }}>{p.initials}</span>{p.name}</div></td>
                    <td className="db2-ta-r db2-table__num">{NUM.format(p.qty)}</td>
                    <td className="db2-ta-r db2-table__amt">{fc(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Slow-Moving Items" action={<span className="db2-badge db2-badge--warn">Watch</span>}>
          {data.slowProducts.length === 0 ? <EmptyState msg="No slow-moving items detected." /> : (
            <table className="db2-table">
              <thead><tr><th>Product</th><th className="db2-ta-r">Stock</th><th className="db2-ta-r">Days/Unit</th></tr></thead>
              <tbody>
                {data.slowProducts.map((p, i) => (
                  <tr key={p.name + i}>
                    <td><div className="db2-name-cell"><span className="db2-avatar db2-avatar--warn">{p.initials}</span>{p.name}</div></td>
                    <td className="db2-ta-r db2-table__num">{NUM.format(p.qty)}</td>
                    <td className="db2-ta-r"><span className={`db2-badge ${p.daysSinceSale >= 15 ? "db2-badge--red" : "db2-badge--warn"}`}>{p.daysSinceSale}d</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* ── Low stock & Out of stock ───────────────────────────────── */}
      <Panel title="Low Stock & Out-of-Stock Alerts" action={<span className="db2-badge db2-badge--red">{data.lowStockCount + data.outOfStockCount} items</span>}>
        {data.lowStockItems.length === 0 ? <EmptyState msg="All items are sufficiently stocked." /> : (
          <div className="db2-stock-grid">
            {data.lowStockItems.map((item, i) => (
              <div key={item.name + i} className={`db2-stock-card ${item.outOfStock ? "db2-stock-card--oos" : "db2-stock-card--low"}`}>
                <div className="db2-stock-card__top">
                  <span className="db2-avatar db2-avatar--sm">{item.initials}</span>
                  <span className={`db2-badge ${item.outOfStock ? "db2-badge--red" : "db2-badge--warn"}`}>{item.outOfStock ? "Out of Stock" : "Low Stock"}</span>
                </div>
                <div className="db2-stock-card__name">{item.name}</div>
                <div className="db2-stock-card__qty">
                  <span>{item.qty} units</span>
                  <span className="db2-stock-card__reorder">Reorder: {item.reorder}</span>
                </div>
                <div className="db2-stock-bar">
                  <div className="db2-stock-bar__fill" style={{ width: item.reorder > 0 ? `${Math.min(100, (item.qty / item.reorder) * 100)}%` : "0%", background: item.outOfStock ? "#ef4444" : "#f59e0b" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Staff Performance & Branch Comparison ─────────────────── */}
      <div className="db2-table-row">
        <Panel title="Staff Performance (MTD)" action={<span className="db2-see-all">This Month</span>}>
          {data.staffStats.length === 0 ? <EmptyState msg="No staff sales recorded this month." /> : (
            <table className="db2-table">
              <thead><tr><th>Staff</th><th className="db2-ta-r">Transactions</th><th className="db2-ta-r">Net Sales</th><th className="db2-ta-r">Profit</th><th className="db2-ta-r">Avg Ticket</th></tr></thead>
              <tbody>
                {data.staffStats.map((s, i) => (
                  <tr key={s.name + i}>
                    <td><div className="db2-name-cell"><span className="db2-avatar" style={{ background: `${BRAND_COLORS[i % BRAND_COLORS.length]}22`, color: BRAND_COLORS[i % BRAND_COLORS.length] }}>{s.initials}</span>{s.name}</div></td>
                    <td className="db2-ta-r db2-table__num">{NUM.format(s.transactions)}</td>
                    <td className="db2-ta-r db2-table__amt">{fc(s.netSales)}</td>
                    <td className="db2-ta-r db2-table__amt">{fc(s.profit)}</td>
                    <td className="db2-ta-r db2-table__amt">{fc(s.avgTicket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Branch Comparison (MTD)" action={<span>All branches</span>}>
          {data.branchStats.length === 0 ? <EmptyState msg="No branch data available." /> : (
            <div className="db2-branch-list">
              {data.branchStats.map((b, i) => {
                const maxSales = Math.max(...data.branchStats.map(x => x.netSales), 1);
                return (
                  <div key={b.name} className="db2-branch-item">
                    <div className="db2-branch-item__top">
                      <span className="db2-branch-item__name"><Building2 size={12} /> {b.name}</span>
                      <span className="db2-branch-item__val">{fc(b.netSales)}</span>
                    </div>
                    <div className="db2-bar-track">
                      <div className="db2-bar-fill" style={{ width: `${(b.netSales / maxSales) * 100}%`, background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                    </div>
                    <div className="db2-kpi__sub">
                      {NUM.format(b.transactions)} txns · Profit {fc(b.profit)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Pending POs ────────────────────────────────────────────── */}
      <div className="db2-summary-row">
        <Panel title="Quick Financials" action={<span>Live snapshot</span>}>
          <div className="db2-quick-grid">
            {[
              { label: "Total Transactions", value: NUM.format(data.todayTransactions), icon: ShoppingBag, color: "#7c3aed" },
              { label: "Cash Sales (Today)", value: fc(pb.cash), icon: Wallet, color: "#16a34a" },
              { label: "GCash Sales", value: fc(pb.gcash), icon: Smartphone, color: "#7c3aed" },
              { label: "Card Sales", value: fc(pb.card), icon: CreditCard, color: "#2563eb" },
              { label: "Bank Sales", value: fc(pb.bank), icon: Building2, color: "#0891b2" },
              { label: "Pending PO Value", value: fc(data.pendingPOValue), icon: Truck, color: "#d97706" },
            ].map(item => (
              <div key={item.label} className="db2-quick-card">
                <div className="db2-quick-card__icon" style={{ background: `${item.color}15`, color: item.color }}>
                  <item.icon size={18} />
                </div>
                <div className="db2-quick-card__label">{item.label}</div>
                <div className="db2-quick-card__value">{item.value}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

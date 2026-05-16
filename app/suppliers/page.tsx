"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Filter,
  LoaderCircle,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Settings2,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type BranchRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type UserRow = {
  id: string;
  branch_id?: string | null;
};

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  supplier_type?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  payment_terms?: number | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  is_active?: boolean | null;
  created_at: string;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  branch_id: string;
  status: string;
  expected_date?: string | null;
  received_date?: string | null;
  supplier_invoice?: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  created_at: string;
};

type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  po_id?: string | null;
  amount: string | number;
  payment_method?: string | null;
  reference_no?: string | null;
  paid_at: string;
  created_at?: string | null;
};

type SupplierStatusTone = "green" | "red" | "amber";
type SupplierActivityTone = "blue" | "green" | "orange";
type AgingKey = "current" | "31-60" | "61-90" | "90+";

type SupplierSummary = SupplierRow & {
  balanceValue: number;
  creditLimitValue: number;
  availableCreditValue: number;
  totalPurchasesThisMonth: number;
  totalPurchasesThisYear: number;
  purchaseOrderCount: number;
  overdueBalanceValue: number;
  currentBalanceValue: number;
  aged31to60Value: number;
  aged61to90Value: number;
  aged90PlusValue: number;
  lastPurchaseAt: string | null;
  lastPaymentAt: string | null;
  statusLabel: "Active" | "Inactive" | "Watchlist";
  statusTone: SupplierStatusTone;
};

type ActivityItem = {
  id: string;
  label: string;
  meta: string;
  amount: number;
  tone: SupplierActivityTone;
  date: string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-PH");

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace("PHP", "\u20b1");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatCompactDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSupplierType(value?: string | null) {
  if (!value) return "Unassigned";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  return { start, end };
}

function getYearRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), 0, 1);
  const end = new Date(referenceDate.getFullYear() + 1, 0, 1);
  return { start, end };
}

function isWithinRange(dateValue: string, start: Date, end: Date) {
  const timestamp = new Date(dateValue).getTime();
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function getDaysBetween(startDate: string | Date, endDate: string | Date) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function getAgingBucket(createdAt: string): AgingKey {
  const ageDays = getDaysBetween(createdAt, new Date());
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

function buildAgingBar(amounts: Record<AgingKey, number>) {
  const total = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return "linear-gradient(90deg, #e2e8f0 0%, #e2e8f0 100%)";

  const palette: Record<AgingKey, string> = {
    current: "#22c55e",
    "31-60": "#2563eb",
    "61-90": "#f59e0b",
    "90+": "#ef4444",
  };

  let start = 0;
  const segments = (Object.entries(amounts) as Array<[AgingKey, number]>).map(([key, value]) => {
    const share = (value / total) * 100;
    const end = start + share;
    const segment = `${palette[key]} ${start}% ${end}%`;
    start = end;
    return segment;
  });

  return `linear-gradient(90deg, ${segments.join(", ")})`;
}

export default function SuppliersPage() {
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierTypeFilter, setSupplierTypeFilter] = useState("all");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [page, setPage] = useState(1);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const pageSize = 10;

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setLoading(true);
      setError("");

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        if (!isMounted) return;
        setError("Please sign in to view suppliers.");
        setLoading(false);
        return;
      }

      const [profileResult, branchesResult] = await Promise.all([
        supabase.from("users").select("id, branch_id").eq("auth_id", authUser.id).maybeSingle(),
        supabase
          .from("branches")
          .select("id, name, is_main")
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true }),
      ]);

      if (!isMounted) return;

      const profile = (profileResult.data as UserRow | null) ?? null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const defaultBranch =
        branchRows.find((branch) => branch.id === profile?.branch_id) ??
        branchRows.find((branch) => branch.is_main) ??
        branchRows[0];

      setSelectedBranchId(defaultBranch?.id ?? "");
      setLoading(false);
    };

    void initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let isMounted = true;

    const loadSuppliersPage = async () => {
      setLoading(true);
      setError("");

      const [suppliersResult, ordersResult] = await Promise.all([
        supabase
          .from("suppliers")
          .select(
            "id, code, name, supplier_type, contact_person, phone, email, address, tax_number, payment_terms, credit_limit, current_balance, is_active, created_at"
          )
          .order("name", { ascending: true }),
        supabase
          .from("purchase_orders")
          .select(
            "id, po_number, supplier_id, branch_id, status, expected_date, received_date, supplier_invoice, total_amount, paid_amount, created_at"
          )
          .eq("branch_id", selectedBranchId)
          .neq("status", "draft")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false }),
      ]);

      if (suppliersResult.error || ordersResult.error) {
        if (!isMounted) return;
        setError("Unable to load supplier records right now.");
        setLoading(false);
        return;
      }

      const supplierRows = (suppliersResult.data ?? []) as SupplierRow[];
      const orderRows = (ordersResult.data ?? []) as PurchaseOrderRow[];
      const orderIds = orderRows.map((order) => order.id);

      const paymentsResult = orderIds.length
        ? await supabase
            .from("supplier_payments")
            .select("id, supplier_id, po_id, amount, payment_method, reference_no, paid_at, created_at")
            .in("po_id", orderIds)
            .order("paid_at", { ascending: false })
        : { data: [] as SupplierPaymentRow[], error: null };

      if (!isMounted) return;

      if (paymentsResult.error) {
        setError("Unable to load supplier payment history right now.");
      }

      setSuppliers(supplierRows);
      setPurchaseOrders(orderRows);
      setPayments((paymentsResult.data ?? []) as SupplierPaymentRow[]);
      setLoading(false);
    };

    void loadSuppliersPage();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId]);

  const supplierSummaries = useMemo(() => {
    const currentMonth = getMonthRange(new Date());
    const currentYear = getYearRange(new Date());

    return suppliers.map((supplier) => {
      const supplierOrders = purchaseOrders.filter((order) => order.supplier_id === supplier.id);
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id);

      let balanceValue = 0;
      let overdueBalanceValue = 0;
      let currentBalanceValue = 0;
      let aged31to60Value = 0;
      let aged61to90Value = 0;
      let aged90PlusValue = 0;

      supplierOrders.forEach((order) => {
        const orderBalance = Math.max(parseNumber(order.total_amount) - parseNumber(order.paid_amount), 0);
        balanceValue += orderBalance;

        if (orderBalance <= 0) return;

        const bucket = getAgingBucket(order.created_at);
        if (bucket === "current") currentBalanceValue += orderBalance;
        if (bucket === "31-60") aged31to60Value += orderBalance;
        if (bucket === "61-90") aged61to90Value += orderBalance;
        if (bucket === "90+") aged90PlusValue += orderBalance;
        if (bucket !== "current") overdueBalanceValue += orderBalance;
      });

      const totalPurchasesThisMonth = supplierOrders
        .filter((order) => isWithinRange(order.created_at, currentMonth.start, currentMonth.end))
        .reduce((sum, order) => sum + parseNumber(order.total_amount), 0);

      const totalPurchasesThisYear = supplierOrders
        .filter((order) => isWithinRange(order.created_at, currentYear.start, currentYear.end))
        .reduce((sum, order) => sum + parseNumber(order.total_amount), 0);

      const creditLimitValue = parseNumber(supplier.credit_limit);
      const storedBalanceValue = parseNumber(supplier.current_balance);
      const computedBalanceValue = balanceValue > 0 ? balanceValue : storedBalanceValue;
      const availableCreditValue = Math.max(creditLimitValue - computedBalanceValue, 0);

      const lastPurchaseAt = supplierOrders[0]?.created_at ?? null;
      const lastPaymentAt = supplierPayments[0]?.paid_at ?? null;

      const statusLabel: SupplierSummary["statusLabel"] = !supplier.is_active
        ? "Inactive"
        : overdueBalanceValue > 0
          ? "Watchlist"
          : "Active";

      const statusTone: SupplierSummary["statusTone"] = !supplier.is_active
        ? "red"
        : overdueBalanceValue > 0
          ? "amber"
          : "green";

      return {
        ...supplier,
        balanceValue: computedBalanceValue,
        creditLimitValue,
        availableCreditValue,
        totalPurchasesThisMonth,
        totalPurchasesThisYear,
        purchaseOrderCount: supplierOrders.length,
        overdueBalanceValue,
        currentBalanceValue,
        aged31to60Value,
        aged61to90Value,
        aged90PlusValue,
        lastPurchaseAt,
        lastPaymentAt,
        statusLabel,
        statusTone,
      };
    });
  }, [payments, purchaseOrders, suppliers]);

  const searchValue = deferredSearchTerm.trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    return supplierSummaries.filter((supplier) => {
      const matchesSearch =
        searchValue.length === 0 ||
        [
          supplier.code,
          supplier.name,
          supplier.contact_person ?? "",
          supplier.phone ?? "",
          supplier.email ?? "",
          supplier.address ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchValue);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && supplier.statusLabel === "Active") ||
        (statusFilter === "watchlist" && supplier.statusLabel === "Watchlist") ||
        (statusFilter === "inactive" && supplier.statusLabel === "Inactive");

      const matchesType = supplierTypeFilter === "all" || (supplier.supplier_type ?? "unassigned") === supplierTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [searchValue, statusFilter, supplierSummaries, supplierTypeFilter]);

  const selectedSupplier =
    filteredSuppliers.find((supplier) => supplier.id === selectedSupplierId) ?? filteredSuppliers[0] ?? null;
  const selectedSupplierOrders = selectedSupplier
    ? purchaseOrders.filter((order) => order.supplier_id === selectedSupplier.id)
    : [];
  const selectedSupplierPayments = selectedSupplier
    ? payments.filter((payment) => payment.supplier_id === selectedSupplier.id)
    : [];

  const selectedSupplierActivities: ActivityItem[] = selectedSupplier
    ? [
        ...selectedSupplierOrders.slice(0, 4).map((order) => ({
          id: `po-${order.id}`,
          label: order.supplier_invoice?.trim() || order.po_number,
          meta: "Purchase Order",
          amount: parseNumber(order.total_amount),
          tone: "orange" as const,
          date: order.created_at,
        })),
        ...selectedSupplierPayments.slice(0, 4).map((payment) => ({
          id: `pay-${payment.id}`,
          label: payment.reference_no?.trim() || `PAY-${payment.id.slice(0, 6).toUpperCase()}`,
          meta: payment.payment_method?.replace(/_/g, " ") || "Supplier Payment",
          amount: parseNumber(payment.amount),
          tone: "green" as const,
          date: payment.paid_at,
        })),
      ]
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        .slice(0, 5)
    : [];

  const totalSuppliers = supplierSummaries.length;
  const activeSuppliers = supplierSummaries.filter((supplier) => supplier.is_active).length;
  const totalPayables = supplierSummaries.reduce((sum, supplier) => sum + supplier.balanceValue, 0);

  const agingTotals = supplierSummaries.reduce<Record<AgingKey, number>>(
    (totals, supplier) => {
      totals.current += supplier.currentBalanceValue;
      totals["31-60"] += supplier.aged31to60Value;
      totals["61-90"] += supplier.aged61to90Value;
      totals["90+"] += supplier.aged90PlusValue;
      return totals;
    },
    { current: 0, "31-60": 0, "61-90": 0, "90+": 0 }
  );

  const overviewCards = [
    {
      label: "Total Suppliers",
      value: numberFormatter.format(totalSuppliers),
      subtext: `${activeSuppliers} active suppliers`,
      tone: "purple",
      icon: Truck,
    },
    {
      label: "Total Payables",
      value: formatCurrency(totalPayables),
      subtext: "Outstanding supplier balances",
      tone: "blue",
      icon: CircleDollarSign,
    },
    {
      label: "Current (0 - 30 Days)",
      value: formatCurrency(agingTotals.current),
      subtext: `${totalPayables > 0 ? ((agingTotals.current / totalPayables) * 100).toFixed(1) : "0.0"}% of total`,
      tone: "green",
      icon: Wallet,
    },
    {
      label: "Overdue (31 - 60 Days)",
      value: formatCurrency(agingTotals["31-60"]),
      subtext: `${totalPayables > 0 ? ((agingTotals["31-60"] / totalPayables) * 100).toFixed(1) : "0.0"}% of total`,
      tone: "blue",
      icon: CalendarDays,
    },
    {
      label: "Overdue (61 - 90 Days)",
      value: formatCurrency(agingTotals["61-90"]),
      subtext: `${totalPayables > 0 ? ((agingTotals["61-90"] / totalPayables) * 100).toFixed(1) : "0.0"}% of total`,
      tone: "amber",
      icon: AlertTriangle,
    },
    {
      label: "Overdue (90+ Days)",
      value: formatCurrency(agingTotals["90+"]),
      subtext: `${totalPayables > 0 ? ((agingTotals["90+"] / totalPayables) * 100).toFixed(1) : "0.0"}% of total`,
      tone: "red",
      icon: ShieldCheck,
    },
  ];

  const supplierTypeBreakdown = Array.from(
    supplierSummaries.reduce((map, supplier) => {
      const key = formatSupplierType(supplier.supplier_type);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([label, count], index) => ({
      label,
      count,
      percentage: totalSuppliers > 0 ? (count / totalSuppliers) * 100 : 0,
      color: ["#2563eb", "#f97316", "#16a34a", "#7c3aed", "#f59e0b"][index % 5],
    }))
    .sort((left, right) => right.count - left.count);

  const supplierTypeChart = supplierTypeBreakdown.length
    ? `conic-gradient(${supplierTypeBreakdown
        .map((item, index) => {
          const start = supplierTypeBreakdown.slice(0, index).reduce((sum, current) => sum + current.percentage, 0);
          const end = start + item.percentage;
          return `${item.color} ${start}% ${end}%`;
        })
        .join(", ")})`
    : "conic-gradient(#e2e8f0 0% 100%)";

  const topSuppliers = [...supplierSummaries]
    .filter((supplier) => supplier.balanceValue > 0)
    .sort((left, right) => right.balanceValue - left.balanceValue)
    .slice(0, 5)
    .map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      balance: supplier.balanceValue,
      share: totalPayables > 0 ? (supplier.balanceValue / totalPayables) * 100 : 0,
    }));

  const agingRows = [
    { key: "current", label: "Current (0 - 30 days)", value: agingTotals.current, tone: "green" },
    { key: "31-60", label: "31 - 60 days", value: agingTotals["31-60"], tone: "blue" },
    { key: "61-90", label: "61 - 90 days", value: agingTotals["61-90"], tone: "amber" },
    { key: "90+", label: "90+ days", value: agingTotals["90+"], tone: "red" },
  ] as const;

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedSuppliers = filteredSuppliers.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="suppliers-page">
      {error ? <div className="suppliers-alert suppliers-alert--error">{error}</div> : null}

      <section className="suppliers-overview">
        {overviewCards.map((card) => {
          const Icon = card.icon;

          return (
            <article key={card.label} className="suppliers-metric">
              <div className={`suppliers-metric__icon suppliers-metric__icon--${card.tone}`}>
                <Icon size={20} />
              </div>
              <div className="suppliers-metric__content">
                <span className="suppliers-metric__label">{card.label}</span>
                <strong className="suppliers-metric__value">{card.value}</strong>
                <small className="suppliers-metric__sub">{card.subtext}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className="suppliers-layout">
        <div className="suppliers-layout__main">
          <article className="suppliers-panel">
            <div className="suppliers-toolbar">
              <div className="suppliers-toolbar__filters">
                <label className="suppliers-search">
                  <input
                    type="search"
                    placeholder="Search supplier name, code, contact, or email..."
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>

                <label className="suppliers-select">
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="watchlist">Watchlist</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <ChevronDown size={14} />
                </label>

                <label className="suppliers-select">
                  <select
                    value={supplierTypeFilter}
                    onChange={(event) => {
                      setSupplierTypeFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Supplier Type</option>
                    {Array.from(new Set(suppliers.map((supplier) => supplier.supplier_type).filter(Boolean))).map((type) => (
                      <option key={type} value={type ?? ""}>
                        {formatSupplierType(type)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>

              <button type="button" className="suppliers-filter-button">
                <Filter size={14} />
                <span>Filters</span>
              </button>
            </div>

            <div className="suppliers-table-wrap">
              <table className="suppliers-table">
                <thead>
                  <tr>
                    <th>Supplier Code</th>
                    <th>Supplier Name</th>
                    <th>Contact Person</th>
                    <th>Email</th>
                    <th>Supplier Type</th>
                    <th>Current Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="suppliers-empty">
                        <LoaderCircle size={16} className="suppliers-spin" />
                        <span>Loading suppliers...</span>
                      </td>
                    </tr>
                  ) : paginatedSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="suppliers-empty">
                        No supplier records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedSuppliers.map((supplier) => (
                      <tr
                        key={supplier.id}
                        className={selectedSupplier?.id === supplier.id ? "suppliers-table__row--active" : ""}
                        onClick={() => setSelectedSupplierId(supplier.id)}
                      >
                        <td className="suppliers-table__code">{supplier.code}</td>
                        <td>
                          <div className="suppliers-table__name">{supplier.name}</div>
                        </td>
                        <td>{supplier.contact_person?.trim() || "-"}</td>
                        <td>{supplier.email?.trim() || "-"}</td>
                        <td>{formatSupplierType(supplier.supplier_type)}</td>
                        <td className="suppliers-table__balance">{formatCurrency(supplier.balanceValue)}</td>
                        <td>
                          <span className={`suppliers-status suppliers-status--${supplier.statusTone}`}>
                            {supplier.statusLabel}
                          </span>
                        </td>
                        <td>
                          <div className="suppliers-table__actions">
                            <button type="button" aria-label={`View ${supplier.name}`} onClick={() => setSelectedSupplierId(supplier.id)}>
                              <Eye size={14} />
                            </button>
                            <button type="button" aria-label={`More actions for ${supplier.name}`}>
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="suppliers-pagination">
              <span>
                Showing {filteredSuppliers.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to{" "}
                {Math.min(safePage * pageSize, filteredSuppliers.length)} of {filteredSuppliers.length} suppliers
              </span>

              <div className="suppliers-pagination__controls">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={safePage === pageNumber ? "suppliers-pagination__controls--active" : ""}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  Next
                </button>
              </div>

              <button type="button" className="suppliers-pagination__size">
                {pageSize} / page
              </button>
            </div>
          </article>

          <div className="suppliers-bottom-grid">
            <article className="suppliers-panel">
              <div className="suppliers-panel__heading">
                <h3>Supplier Types</h3>
              </div>

              <div className="suppliers-chart-card">
                <div className="suppliers-donut" style={{ background: supplierTypeChart }}>
                  <div className="suppliers-donut__center">
                    <span>Total Suppliers</span>
                    <strong>{numberFormatter.format(totalSuppliers)}</strong>
                  </div>
                </div>

                <div className="suppliers-chart-legend">
                  {supplierTypeBreakdown.length === 0 ? (
                    <div className="suppliers-empty suppliers-empty--stack">No supplier type data available.</div>
                  ) : (
                    supplierTypeBreakdown.map((item) => (
                      <div key={item.label} className="suppliers-legend">
                        <span className="suppliers-legend__dot" style={{ background: item.color }} />
                        <div className="suppliers-legend__copy">
                          <span>{item.label}</span>
                          <strong>{item.count}</strong>
                        </div>
                        <span className="suppliers-legend__share">{item.percentage.toFixed(1)}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>

            <article className="suppliers-panel">
              <div className="suppliers-panel__heading">
                <h3>Aging of Payables</h3>
              </div>

              <div className="suppliers-aging">
                {agingRows.map((row) => {
                  const percentage = totalPayables > 0 ? (row.value / totalPayables) * 100 : 0;
                  return (
                    <div key={row.key} className="suppliers-aging__row">
                      <div className="suppliers-aging__copy">
                        <span>{row.label}</span>
                        <strong>{formatCurrency(row.value)}</strong>
                      </div>
                      <div className="suppliers-aging__bar">
                        <div
                          className={`suppliers-aging__fill suppliers-aging__fill--${row.tone}`}
                          style={{ width: `${Math.max(percentage, row.value > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                      <span className="suppliers-aging__share">{percentage.toFixed(1)}%</span>
                    </div>
                  );
                })}

                <div className="suppliers-aging__total" style={{ backgroundImage: buildAgingBar(agingTotals) }}>
                  <span>Total Payables</span>
                  <strong>{formatCurrency(totalPayables)}</strong>
                </div>
              </div>
            </article>
          </div>
        </div>

        <aside className="suppliers-layout__side">
          <article className="suppliers-panel">
            <div className="suppliers-panel__heading suppliers-panel__heading--details">
              <h3>Supplier Details</h3>
            </div>

            {selectedSupplier ? (
              <div className="suppliers-details">
                <div className="suppliers-details__hero">
                  <div className="suppliers-details__avatar">
                    {selectedSupplier.name
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("")}
                  </div>
                  <div className="suppliers-details__copy">
                    <strong>{selectedSupplier.name}</strong>
                    <span>
                      {selectedSupplier.code} • {formatSupplierType(selectedSupplier.supplier_type)}
                    </span>
                  </div>
                  <span className={`suppliers-status suppliers-status--${selectedSupplier.statusTone}`}>
                    {selectedSupplier.statusLabel}
                  </span>
                </div>

                <div className="suppliers-details__list">
                  <div className="suppliers-details__item">
                    <Phone size={15} />
                    <span>{selectedSupplier.phone?.trim() || "-"}</span>
                  </div>
                  <div className="suppliers-details__item">
                    <Mail size={15} />
                    <span>{selectedSupplier.email?.trim() || "-"}</span>
                  </div>
                  <div className="suppliers-details__item">
                    <MapPin size={15} />
                    <span>{selectedSupplier.address?.trim() || "-"}</span>
                  </div>
                  <div className="suppliers-details__item">
                    <UserRound size={15} />
                    <span>{selectedSupplier.contact_person?.trim() || "No contact person"}</span>
                  </div>
                  <div className="suppliers-details__item">
                    <Building2 size={15} />
                    <span>Terms: {selectedSupplier.payment_terms ?? 0} days</span>
                  </div>
                </div>

                <div className="suppliers-details__stats">
                  <div className="suppliers-side-stat">
                    <span>Current Limit</span>
                    <strong>{formatCurrency(selectedSupplier.creditLimitValue)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Available Credit</span>
                    <strong>{formatCurrency(selectedSupplier.availableCreditValue)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Total Purchases (This Month)</span>
                    <strong>{formatCurrency(selectedSupplier.totalPurchasesThisMonth)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Total Purchases (This Year)</span>
                    <strong>{formatCurrency(selectedSupplier.totalPurchasesThisYear)}</strong>
                  </div>
                </div>

                <div className="suppliers-summary">
                  <div className="suppliers-summary__row">
                    <span>Current Balance</span>
                    <strong>{formatCurrency(selectedSupplier.balanceValue)}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Overdue Balance</span>
                    <strong>{formatCurrency(selectedSupplier.overdueBalanceValue)}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Purchase Orders</span>
                    <strong>{numberFormatter.format(selectedSupplier.purchaseOrderCount)}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Last Purchase</span>
                    <strong>{formatDate(selectedSupplier.lastPurchaseAt)}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Last Payment</span>
                    <strong>{formatDate(selectedSupplier.lastPaymentAt)}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Since</span>
                    <strong>{formatDate(selectedSupplier.created_at)}</strong>
                  </div>
                </div>

                <div className="suppliers-panel__heading suppliers-panel__heading--sub">
                  <h3>Recent Transactions</h3>
                </div>

                <div className="suppliers-activities">
                  {selectedSupplierActivities.length === 0 ? (
                    <div className="suppliers-empty suppliers-empty--stack">No transactions recorded yet.</div>
                  ) : (
                    selectedSupplierActivities.map((activity) => (
                      <div key={activity.id} className="suppliers-activities__row">
                        <div className={`suppliers-activities__icon suppliers-activities__icon--${activity.tone}`}>
                          {activity.meta === "Purchase Order" ? <Truck size={14} /> : <Wallet size={14} />}
                        </div>
                        <div className="suppliers-activities__copy">
                          <strong>{activity.label}</strong>
                          <span>{activity.meta}</span>
                          <small>{formatCompactDate(activity.date)}</small>
                        </div>
                        <strong className="suppliers-activities__amount">{formatCurrency(activity.amount)}</strong>
                      </div>
                    ))
                  )}
                </div>

                <div className="suppliers-detail-actions">
                  <button type="button" className="suppliers-button suppliers-button--outline">
                    <Settings2 size={15} />
                    <span>Edit Supplier</span>
                  </button>
                  <button type="button" className="suppliers-button suppliers-button--primary">
                    <Wallet size={15} />
                    <span>Supplier Statement</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="suppliers-empty suppliers-empty--stack">Select a supplier to view details.</div>
            )}
          </article>

          <article className="suppliers-panel">
            <div className="suppliers-panel__heading">
              <h3>Top Suppliers by Balance</h3>
            </div>

            <div className="suppliers-ranking">
              {topSuppliers.length === 0 ? (
                <div className="suppliers-empty suppliers-empty--stack">No supplier balances available.</div>
              ) : (
                topSuppliers.map((supplier, index) => (
                  <button
                    key={supplier.id}
                    type="button"
                    className="suppliers-ranking__row"
                    onClick={() => setSelectedSupplierId(supplier.id)}
                  >
                    <span>{index + 1}. {supplier.name}</span>
                    <strong>{formatCurrency(supplier.balance)}</strong>
                    <span>{supplier.share.toFixed(1)}%</span>
                  </button>
                ))
              )}
            </div>
          </article>
        </aside>
      </section>

      <section className="suppliers-footer-banner">
        <div className="suppliers-footer-banner__copy">
          <div className="suppliers-footer-banner__icon">
            <CircleDollarSign size={18} />
          </div>
          <div>
            <strong>Keep your supplier information up to date for accurate purchasing and payment tracking.</strong>
            <p>You can use these live balances, terms, and contact details to stay aligned with your database records.</p>
          </div>
        </div>

        <button type="button" className="suppliers-button suppliers-button--outline">
          Supplier Settings
        </button>
      </section>
    </div>
  );
}

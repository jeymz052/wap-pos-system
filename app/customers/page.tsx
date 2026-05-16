"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  FileText,
  Eye,
  Filter,
  LoaderCircle,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Settings2,
  Search,
  ShieldCheck,
  UserRound,
  Users,
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
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  branch_id?: string | null;
  is_active?: boolean | null;
};

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  customer_type?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  loyalty_points?: number | null;
  salesperson_id?: string | null;
  branch_id?: string | null;
  is_active?: boolean | null;
  created_at: string;
};

type SaleRow = {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  branch_id: string;
  total_amount: string | number;
  status?: string | null;
  created_at: string;
};

type ReceivableRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  branch_id: string;
  total_amount: string | number;
  paid_amount: string | number;
  balance: string | number;
  due_date?: string | null;
  status?: string | null;
  created_at: string;
};

type ReceivablePaymentRow = {
  id: string;
  receivable_id: string;
  amount: string | number;
  payment_method?: string | null;
  reference_no?: string | null;
  paid_at: string;
  created_at?: string | null;
};

type CustomerSummary = CustomerRow & {
  salespersonName: string;
  creditLimitValue: number;
  balanceValue: number;
  availableCreditValue: number;
  salesThisMonthValue: number;
  salesThisYearValue: number;
  lifetimeSalesValue: number;
  overdueBalanceValue: number;
  overdueCount: number;
  lastTransactionAt: string | null;
  totalInvoices: number;
  statusLabel: "Active" | "Inactive" | "Overdue";
  statusTone: "green" | "slate" | "red";
};

type ActivityItem = {
  id: string;
  label: string;
  meta: string;
  amount: number;
  tone: "blue" | "green" | "orange";
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

function getAgingBucket(createdAt: string) {
  const ageDays = getDaysBetween(createdAt, new Date());
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "91+";
}

function formatCustomerType(value?: string | null) {
  if (!value) return "Unclassified";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatUserName(user?: UserRow | null) {
  if (!user) return "Unassigned";
  const fullName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
  return fullName || user.username?.trim() || user.email?.split("@")[0] || "Unassigned";
}

function getInitials(value: string) {
  return (
    value
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "CU"
  );
}

export default function CustomersPage() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [payments, setPayments] = useState<ReceivablePaymentRow[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
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
        setError("Please sign in to view customers.");
        setLoading(false);
        return;
      }

      const [profileResult, branchesResult] = await Promise.all([
        supabase
          .from("users")
          .select("id, branch_id")
          .eq("auth_id", authUser.id)
          .maybeSingle(),
        supabase
          .from("branches")
          .select("id, name, is_main")
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true }),
      ]);

      if (!isMounted) return;

      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const profile = (profileResult.data as { branch_id?: string | null } | null) ?? null;
      const defaultBranch =
        branchRows.find((branch) => branch.id === profile?.branch_id) ??
        branchRows.find((branch) => branch.is_main) ??
        branchRows[0];

      setBranches(branchRows);
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

    const loadBranchData = async () => {
      setLoading(true);
      setError("");

      const [customersResult, usersResult, salesResult, receivablesResult] = await Promise.all([
        supabase
          .from("customers")
          .select("id, code, name, customer_type, phone, email, address, credit_limit, current_balance, loyalty_points, salesperson_id, branch_id, is_active, created_at")
          .eq("branch_id", selectedBranchId)
          .order("name", { ascending: true }),
        supabase
          .from("users")
          .select("id, first_name, last_name, username, email, branch_id, is_active")
          .eq("is_active", true)
          .order("first_name", { ascending: true }),
        supabase
          .from("sales")
          .select("id, invoice_number, customer_id, branch_id, total_amount, status, created_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("receivables")
          .select("id, invoice_number, customer_id, branch_id, total_amount, paid_amount, balance, due_date, status, created_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
      ]);

      if (customersResult.error || usersResult.error || salesResult.error || receivablesResult.error) {
        if (!isMounted) return;
        setError(
          customersResult.error?.message ||
            usersResult.error?.message ||
            salesResult.error?.message ||
            receivablesResult.error?.message ||
            "Unable to load customers."
        );
        setLoading(false);
        return;
      }

      const receivableRows = (receivablesResult.data ?? []) as ReceivableRow[];
      const receivableIds = receivableRows.map((item) => item.id);
      const paymentsResult = receivableIds.length
        ? await supabase
            .from("receivable_payments")
            .select("id, receivable_id, amount, payment_method, reference_no, paid_at, created_at")
            .in("receivable_id", receivableIds)
            .order("paid_at", { ascending: false })
        : { data: [], error: null };

      if (paymentsResult.error) {
        if (!isMounted) return;
        setError(paymentsResult.error.message);
        setLoading(false);
        return;
      }

      if (!isMounted) return;

      setCustomers((customersResult.data ?? []) as CustomerRow[]);
      setUsers((usersResult.data ?? []) as UserRow[]);
      setSales((salesResult.data ?? []) as SaleRow[]);
      setReceivables(receivableRows);
      setPayments((paymentsResult.data ?? []) as ReceivablePaymentRow[]);
      setPage(1);
      setLoading(false);
    };

    void loadBranchData();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId]);

  const monthRange = getMonthRange(new Date());
  const yearRange = getYearRange(new Date());
  const branchName = branches.find((branch) => branch.id === selectedBranchId)?.name ?? "Main Branch";

  const userMap = new Map(users.map((user) => [user.id, user]));
  const receivableMap = new Map(receivables.map((item) => [item.id, item]));
  const salesByCustomer = new Map<string, SaleRow[]>();
  const receivablesByCustomer = new Map<string, ReceivableRow[]>();
  const paymentsByCustomer = new Map<string, ReceivablePaymentRow[]>();

  sales.forEach((sale) => {
    if (!sale.customer_id) return;
    const list = salesByCustomer.get(sale.customer_id) ?? [];
    list.push(sale);
    salesByCustomer.set(sale.customer_id, list);
  });

  receivables.forEach((receivable) => {
    const list = receivablesByCustomer.get(receivable.customer_id) ?? [];
    list.push(receivable);
    receivablesByCustomer.set(receivable.customer_id, list);
  });

  payments.forEach((payment) => {
    const receivable = receivableMap.get(payment.receivable_id);
    if (!receivable) return;
    const list = paymentsByCustomer.get(receivable.customer_id) ?? [];
    list.push(payment);
    paymentsByCustomer.set(receivable.customer_id, list);
  });

  const customerSummaries: CustomerSummary[] = customers.map((customer) => {
    const customerSales = salesByCustomer.get(customer.id) ?? [];
    const customerReceivables = receivablesByCustomer.get(customer.id) ?? [];
    const creditLimitValue = parseNumber(customer.credit_limit);
    const receivableBalance = customerReceivables.reduce((sum, item) => sum + parseNumber(item.balance), 0);
    const balanceValue = receivableBalance || parseNumber(customer.current_balance);
    const overdueBalanceValue = customerReceivables
      .filter((item) => parseNumber(item.balance) > 0 && item.due_date && new Date(item.due_date).getTime() < Date.now())
      .reduce((sum, item) => sum + parseNumber(item.balance), 0);
    const overdueCount = customerReceivables.filter(
      (item) => parseNumber(item.balance) > 0 && item.due_date && new Date(item.due_date).getTime() < Date.now()
    ).length;
    const salesThisMonthValue = customerSales
      .filter((item) => isWithinRange(item.created_at, monthRange.start, monthRange.end))
      .reduce((sum, item) => sum + parseNumber(item.total_amount), 0);
    const salesThisYearValue = customerSales
      .filter((item) => isWithinRange(item.created_at, yearRange.start, yearRange.end))
      .reduce((sum, item) => sum + parseNumber(item.total_amount), 0);
    const lifetimeSalesValue = customerSales.reduce((sum, item) => sum + parseNumber(item.total_amount), 0);
    const timeline = [
      ...customerSales.map((item) => item.created_at),
      ...customerReceivables.map((item) => item.created_at),
      ...(paymentsByCustomer.get(customer.id) ?? []).map((item) => item.paid_at),
    ].sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

    const statusLabel = !customer.is_active ? "Inactive" : overdueCount > 0 ? "Overdue" : "Active";
    const statusTone = !customer.is_active ? "slate" : overdueCount > 0 ? "red" : "green";

    return {
      ...customer,
      salespersonName: formatUserName(customer.salesperson_id ? userMap.get(customer.salesperson_id) : null),
      creditLimitValue,
      balanceValue,
      availableCreditValue: Math.max(0, creditLimitValue - balanceValue),
      salesThisMonthValue,
      salesThisYearValue,
      lifetimeSalesValue,
      overdueBalanceValue,
      overdueCount,
      lastTransactionAt: timeline[0] ?? null,
      totalInvoices: customerSales.length,
      statusLabel,
      statusTone,
    };
  });

  const searchNeedle = deferredSearchTerm.trim().toLowerCase();
  const filteredCustomers = customerSummaries.filter((customer) => {
    const matchesSearch =
      !searchNeedle ||
      [
        customer.code,
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.salespersonName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchNeedle));

    if (!matchesSearch) return false;
    if (statusFilter !== "all" && customer.statusLabel.toLowerCase() !== statusFilter) return false;
    if (customerTypeFilter !== "all" && (customer.customer_type ?? "unclassified") !== customerTypeFilter) return false;
    if (salespersonFilter !== "all" && customer.salesperson_id !== salespersonFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedCustomers = filteredCustomers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const effectiveSelectedCustomerId = filteredCustomers.some((customer) => customer.id === selectedCustomerId)
    ? selectedCustomerId
    : filteredCustomers[0]?.id ?? "";

  const selectedCustomer =
    customerSummaries.find((customer) => customer.id === effectiveSelectedCustomerId) ??
    filteredCustomers[0] ??
    customerSummaries[0] ??
    null;

  const selectedCustomerSales = selectedCustomer ? salesByCustomer.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerPayments = selectedCustomer ? paymentsByCustomer.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerReceivables = selectedCustomer ? receivablesByCustomer.get(selectedCustomer.id) ?? [] : [];

  const selectedActivity: ActivityItem[] = [
    ...selectedCustomerSales.map((sale) => ({
      id: `sale-${sale.id}`,
      label: sale.invoice_number,
      meta: `Invoice • ${formatCompactDate(sale.created_at)}`,
      amount: parseNumber(sale.total_amount),
      tone: "blue" as const,
      date: sale.created_at,
    })),
    ...selectedCustomerPayments.map((payment) => {
      const receivable = receivableMap.get(payment.receivable_id);
      const activityLabel = receivable?.invoice_number ?? payment.reference_no?.trim() ?? "Payment";
      return {
        id: `payment-${payment.id}`,
        label: activityLabel,
        meta: `${payment.payment_method ? formatCustomerType(payment.payment_method) : "Payment"} • ${formatCompactDate(payment.paid_at)}`,
        amount: parseNumber(payment.amount),
        tone: "green" as const,
        date: payment.paid_at,
      };
    }),
    ...selectedCustomerReceivables
      .filter((item) => parseNumber(item.balance) > 0)
      .map((receivable) => ({
        id: `receivable-${receivable.id}`,
        label: receivable.invoice_number,
        meta: `Open balance • ${formatCompactDate(receivable.created_at)}`,
        amount: parseNumber(receivable.balance),
        tone: "orange" as const,
        date: receivable.created_at,
      })),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);

  const activeCustomersCount = customerSummaries.filter((customer) => customer.is_active).length;
  const creditCustomers = customerSummaries.filter(
    (customer) => customer.creditLimitValue > 0 || customer.balanceValue > 0
  );
  const totalCreditLimit = customerSummaries.reduce((sum, customer) => sum + customer.creditLimitValue, 0);
  const totalOutstandingBalance = customerSummaries.reduce((sum, customer) => sum + customer.balanceValue, 0);
  const newThisMonth = customerSummaries.filter((customer) =>
    isWithinRange(customer.created_at, monthRange.start, monthRange.end)
  ).length;
  const overdueAccounts = customerSummaries.filter((customer) => customer.overdueCount > 0).length;
  const averageCreditUtilization = totalCreditLimit > 0 ? (totalOutstandingBalance / totalCreditLimit) * 100 : 0;

  const customerTypeCounts = new Map<string, number>();
  customerSummaries.forEach((customer) => {
    const key = formatCustomerType(customer.customer_type);
    customerTypeCounts.set(key, (customerTypeCounts.get(key) ?? 0) + 1);
  });

  const totalCustomers = customerSummaries.length;
  const customerTypePalette = ["#2563eb", "#ef4444", "#f59e0b", "#16a34a", "#7c3aed", "#0f766e"];
  const customerTypeLegend = Array.from(customerTypeCounts.entries()).map(([label, count], index) => ({
    label,
    count,
    color: customerTypePalette[index % customerTypePalette.length],
    share: totalCustomers > 0 ? (count / totalCustomers) * 100 : 0,
  }));

  let donutStart = 0;
  const donutGradient = customerTypeLegend.length
    ? `conic-gradient(${customerTypeLegend
        .map((item) => {
          const degrees = (item.count / totalCustomers) * 360;
          const segment = `${item.color} ${donutStart}deg ${donutStart + degrees}deg`;
          donutStart += degrees;
          return segment;
        })
        .join(", ")})`
    : "conic-gradient(#e2e8f0 0deg 360deg)";

  const agingAmounts = {
    current: 0,
    "31-60": 0,
    "61-90": 0,
    "91+": 0,
  };

  receivables
    .filter((item) => parseNumber(item.balance) > 0)
    .forEach((item) => {
      agingAmounts[getAgingBucket(item.created_at)] += parseNumber(item.balance);
    });

  const topCustomers = customerSummaries
    .filter((customer) => customer.balanceValue > 0 || customer.lifetimeSalesValue > 0)
    .sort((left, right) => right.balanceValue - left.balanceValue || right.lifetimeSalesValue - left.lifetimeSalesValue)
    .slice(0, 5);

  const customerTypeOptions = Array.from(
    new Set(customers.map((customer) => customer.customer_type).filter(Boolean) as string[])
  ).sort((left, right) => left.localeCompare(right));

  const salespersonOptions = Array.from(
    new Map(
      customerSummaries
        .filter((customer) => customer.salesperson_id)
        .map((customer) => [customer.salesperson_id as string, { id: customer.salesperson_id as string, name: customer.salespersonName }])
    ).values()
  );

  if (loading && customers.length === 0 && !selectedBranchId) {
    return (
      <div className="customers-page customers-page--state">
        <div className="customers-state-card">
          <LoaderCircle size={20} className="customers-spin" />
          <span>Loading customer workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <div className="customers-stats stats-row">
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--blue"><Users size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">Total Customers</div>
            <div className="stat-card__value">{numberFormatter.format(totalCustomers)}</div>
            <div className="stat-card__sub">{numberFormatter.format(activeCustomersCount)} active accounts</div>
          </div>
        </article>
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--green"><CreditCard size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">Credit Customers</div>
            <div className="stat-card__value">{numberFormatter.format(creditCustomers.length)}</div>
            <div className="stat-card__sub">
              {totalCustomers > 0 ? `${((creditCustomers.length / totalCustomers) * 100).toFixed(1)}% of total customers` : "0% of total customers"}
            </div>
          </div>
        </article>
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--orange"><CircleDollarSign size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">Total Credit Limit</div>
            <div className="stat-card__value">{formatCurrency(totalCreditLimit)}</div>
            <div className="stat-card__sub">{averageCreditUtilization.toFixed(1)}% utilization</div>
          </div>
        </article>
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--purple"><Wallet size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">Outstanding Balance</div>
            <div className="stat-card__value">{formatCurrency(totalOutstandingBalance)}</div>
            <div className="stat-card__sub">{formatCurrency(totalCreditLimit - totalOutstandingBalance)} headroom left</div>
          </div>
        </article>
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--green"><ShieldCheck size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">New This Month</div>
            <div className="stat-card__value">{numberFormatter.format(newThisMonth)}</div>
            <div className="stat-card__sub">Added in {monthRange.start.toLocaleString("en-US", { month: "long" })}</div>
          </div>
        </article>
        <article className="customers-stat-card stat-card">
          <div className="stat-card__icon stat-card__icon--red"><AlertTriangle size={20} /></div>
          <div className="stat-card__content">
            <div className="stat-card__label">Overdue Accounts</div>
            <div className="stat-card__value">{numberFormatter.format(overdueAccounts)}</div>
            <div className="stat-card__sub">Customers with overdue receivables</div>
          </div>
        </article>
      </div>

      <div className="customers-board">
        <section className="customers-main-card">
          <div className="customers-toolbar">
            <label className="customers-search">
              <Search size={16} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search customer name, code, phone, email..."
              />
            </label>

            <select
              className="customers-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              className="customers-filter"
              value={customerTypeFilter}
              onChange={(event) => {
                setCustomerTypeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Customer Type</option>
              {customerTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {formatCustomerType(option)}
                </option>
              ))}
            </select>

            <select
              className="customers-filter"
              value={salespersonFilter}
              onChange={(event) => {
                setSalespersonFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Salesperson</option>
              {salespersonOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>

            <div className="customers-toolbar__actions">
              <label className="customers-filter customers-filter--branch">
                <MapPin size={14} />
                <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="customers-ghost-button">
                <Filter size={14} />
                <span>Filters</span>
              </button>
            </div>
          </div>

          {error ? (
            <div className="customers-inline-state customers-inline-state--error">{error}</div>
          ) : (
            <>
              <div className="customers-table-wrap">
                <table className="customers-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer Code</th>
                      <th>Customer Name</th>
                      <th>Phone</th>
                      <th>Customer Type</th>
                      <th>Credit Limit</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="customers-empty">No customers matched your current filters.</div>
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((customer, index) => (
                        <tr
                          key={customer.id}
                          className={customer.id === selectedCustomer?.id ? "customers-table__row--active" : ""}
                        >
                          <td>{(safePage - 1) * pageSize + index + 1}</td>
                          <td className="customers-table__mono">{customer.code}</td>
                          <td>
                            <button
                              type="button"
                              className="customers-name-button"
                              onClick={() => setSelectedCustomerId(customer.id)}
                            >
                              <strong>{customer.name}</strong>
                              <span>{customer.salespersonName}</span>
                            </button>
                          </td>
                          <td>{customer.phone?.trim() || "-"}</td>
                          <td>
                            <span className="customers-type-pill">{formatCustomerType(customer.customer_type)}</span>
                          </td>
                          <td className="customers-table__amount">{formatCurrency(customer.creditLimitValue)}</td>
                          <td className="customers-table__amount">{formatCurrency(customer.balanceValue)}</td>
                          <td>
                            <span className={`badge ${customer.statusTone === "green" ? "badge--green" : customer.statusTone === "red" ? "badge--red" : "customers-badge--slate"}`}>
                              {customer.statusLabel}
                            </span>
                          </td>
                          <td>
                            <div className="customers-table__actions">
                              <button type="button" onClick={() => setSelectedCustomerId(customer.id)} aria-label={`View ${customer.name}`}>
                                <Eye size={15} />
                              </button>
                              <button type="button" onClick={() => setSelectedCustomerId(customer.id)} aria-label={`Edit ${customer.name}`}>
                                <Pencil size={15} />
                              </button>
                              <button type="button" onClick={() => setSelectedCustomerId(customer.id)} aria-label={`More options for ${customer.name}`}>
                                <MoreHorizontal size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="customers-table-footer">
              <span>
                  Showing {filteredCustomers.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to{" "}
                  {Math.min(safePage * pageSize, filteredCustomers.length)} of {numberFormatter.format(filteredCustomers.length)} customers
                </span>
                <div className="customers-pagination">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
                    Previous
                  </button>
                  <span>{safePage} / {totalPages}</span>
                  <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="customers-detail-card">
          <div className="customers-detail-card__header">
            <div>
              <p className="customers-section-label">Customer Details</p>
              <h2>{selectedCustomer?.name ?? "No customer selected"}</h2>
              <span className="customers-section-subtitle">{branchName}</span>
            </div>
            {selectedCustomer ? (
              <span className={`badge ${selectedCustomer.statusTone === "green" ? "badge--green" : selectedCustomer.statusTone === "red" ? "badge--red" : "customers-badge--slate"}`}>
                {selectedCustomer.statusLabel}
              </span>
            ) : null}
          </div>

          {selectedCustomer ? (
            <>
              <div className="customers-detail-profile">
                <div className="customers-detail-avatar">{getInitials(selectedCustomer.name)}</div>
                <div>
                  <strong>{selectedCustomer.code}</strong>
                  <span>{formatCustomerType(selectedCustomer.customer_type)}</span>
                </div>
              </div>

              <div className="customers-detail-list">
                <div><Phone size={14} /><span>{selectedCustomer.phone?.trim() || "-"}</span></div>
                <div><Mail size={14} /><span>{selectedCustomer.email?.trim() || "-"}</span></div>
                <div><MapPin size={14} /><span>{selectedCustomer.address?.trim() || "-"}</span></div>
                <div><UserRound size={14} /><span>{selectedCustomer.salespersonName}</span></div>
              </div>

              <div className="customers-detail-section">
                <div className="customers-detail-section__title">Credit Summary</div>
                <div className="customers-summary-grid">
                  <div><span>Credit Limit</span><strong>{formatCurrency(selectedCustomer.creditLimitValue)}</strong></div>
                  <div><span>Current Balance</span><strong>{formatCurrency(selectedCustomer.balanceValue)}</strong></div>
                  <div><span>Available Credit</span><strong className="customers-text-green">{formatCurrency(selectedCustomer.availableCreditValue)}</strong></div>
                  <div><span>Sales This Month</span><strong>{formatCurrency(selectedCustomer.salesThisMonthValue)}</strong></div>
                  <div><span>Sales This Year</span><strong>{formatCurrency(selectedCustomer.salesThisYearValue)}</strong></div>
                  <div><span>Total Invoices</span><strong>{numberFormatter.format(selectedCustomer.totalInvoices)}</strong></div>
                  <div><span>Last Transaction</span><strong>{formatDate(selectedCustomer.lastTransactionAt)}</strong></div>
                </div>
              </div>

              <div className="customers-detail-section">
                <div className="customers-detail-section__title">Recent Activity</div>
                <div className="customers-activity-list">
                  {selectedActivity.length === 0 ? (
                    <div className="customers-empty customers-empty--compact">No activity found for this customer yet.</div>
                  ) : (
                    selectedActivity.map((activity) => (
                      <div key={activity.id} className="customers-activity-item">
                        <div>
                          <strong>{activity.label}</strong>
                          <span>{activity.meta}</span>
                        </div>
                        <div className={`customers-activity-item__amount customers-activity-item__amount--${activity.tone}`}>
                          {formatCurrency(activity.amount)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="customers-detail-actions">
                <button type="button" className="customers-secondary-action">Edit Customer</button>
                <button type="button" className="customers-primary-action">Customer Statement</button>
              </div>
            </>
          ) : (
            <div className="customers-empty customers-empty--panel">Select a customer to view details.</div>
          )}
        </aside>
      </div>

      <div className="customers-bottom-grid">
        <section className="customers-analytics-card">
          <div className="customers-analytics-card__header">
            <h3>Customer Statistics</h3>
            <span>{numberFormatter.format(totalCustomers)} accounts</span>
          </div>
          <div className="customers-type-panel">
            <div className="customers-donut" style={{ background: donutGradient }}>
              <div className="customers-donut__center">
                <strong>{numberFormatter.format(totalCustomers)}</strong>
                <span>Customers</span>
              </div>
            </div>
            <div className="customers-legend">
              {customerTypeLegend.length === 0 ? (
                <div className="customers-empty customers-empty--compact">No customer types available yet.</div>
              ) : (
                customerTypeLegend.map((item) => (
                  <div key={item.label} className="customers-legend__item">
                    <span className="customers-legend__dot" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                    <strong>{numberFormatter.format(item.count)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="customers-analytics-card">
          <div className="customers-analytics-card__header">
            <h3>Aging of Receivables</h3>
            <span>{formatCurrency(totalOutstandingBalance)}</span>
          </div>
          <div className="customers-aging-list">
            {[
              { key: "current", label: "Current (0 - 30 days)", color: "blue" },
              { key: "31-60", label: "31 - 60 days", color: "green" },
              { key: "61-90", label: "61 - 90 days", color: "orange" },
              { key: "91+", label: "91+ days", color: "red" },
            ].map((item) => {
              const value = agingAmounts[item.key as keyof typeof agingAmounts];
              const width = totalOutstandingBalance > 0 ? (value / totalOutstandingBalance) * 100 : 0;

              return (
                <div key={item.key} className="customers-aging-row">
                  <div className="customers-aging-row__head">
                    <span>{item.label}</span>
                    <strong>{formatCurrency(value)}</strong>
                  </div>
                  <div className="customers-aging-row__track">
                    <span className={`customers-aging-row__fill customers-aging-row__fill--${item.color}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="customers-analytics-card">
          <div className="customers-analytics-card__header">
            <h3>Top Customers</h3>
            <span>By outstanding balance</span>
          </div>
          <div className="customers-ranking-list">
            {topCustomers.length === 0 ? (
              <div className="customers-empty customers-empty--compact">No ranked customer data yet.</div>
            ) : (
              topCustomers.map((customer, index) => (
                <div key={customer.id} className="customers-ranking-item">
                  <span className="customers-ranking-item__index">{index + 1}</span>
                  <div className="customers-ranking-item__body">
                    <strong>{customer.name}</strong>
                    <span>{formatCustomerType(customer.customer_type)}</span>
                  </div>
                  <div className="customers-ranking-item__metric">
                    <strong>{formatCurrency(customer.balanceValue)}</strong>
                    <span>{formatCurrency(customer.lifetimeSalesValue)} lifetime sales</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="customers-footer-bar">
        <div className="customers-footer-bar__note">
          <div className="customers-footer-bar__icon">
            <FileText size={16} />
          </div>
          <div>
            <strong>Well-managed customer relationships lead to increased sales and long-term business growth.</strong>
            <p>Monitor credit limits, payments, and outstanding balances regularly.</p>
          </div>
        </div>
        <button type="button" className="customers-footer-bar__button">
          <Settings2 size={15} />
          <span>Customer Settings</span>
        </button>
      </div>
    </div>
  );
}

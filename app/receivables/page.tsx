"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Ellipsis,
  Eye,
  FileSpreadsheet,
  Filter,
  Landmark,
  LoaderCircle,
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
  name: string;
  salesperson_id?: string | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  branch_id?: string | null;
  is_active?: boolean | null;
};

type ReceivableStatus = "unpaid" | "partial" | "paid" | "overdue";
type PaymentMethod = "cash" | "card" | "bank_transfer" | "gcash" | "ewallet" | "customer_credit" | "split";

type ReceivableRow = {
  id: string;
  invoice_number: string;
  customer_id: string;
  sale_id?: string | null;
  branch_id: string;
  total_amount: string | number;
  paid_amount: string | number;
  balance: string | number;
  due_date?: string | null;
  status: ReceivableStatus;
  created_at: string;
  updated_at?: string | null;
};

type ReceivablePaymentRow = {
  id: string;
  receivable_id: string;
  amount: string | number;
  payment_method: PaymentMethod;
  reference_no?: string | null;
  paid_at: string;
  received_by?: string | null;
  created_at?: string | null;
};

type TabKey = "all" | "unpaid" | "partial" | "paid" | "overdue";
type AgingKey = "current" | "31-60" | "61-90" | "90+";

type EnrichedReceivable = ReceivableRow & {
  customerName: string;
  salespersonId: string | null;
  salespersonName: string;
  daysOverdue: number;
  ageDays: number;
  statusLabel: string;
  statusTone: "green" | "red" | "amber" | "orange" | "rose";
  baseStatus: TabKey;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All Invoices" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
];

const paymentMethodOptions: Array<{ value: PaymentMethod; label: string; tone: "green" | "blue" | "purple" }> = [
  { value: "cash", label: "Cash", tone: "green" },
  { value: "card", label: "Card", tone: "purple" },
  { value: "bank_transfer", label: "Bank Transfer", tone: "blue" },
  { value: "gcash", label: "GCash", tone: "blue" },
  { value: "ewallet", label: "E-Wallet", tone: "blue" },
  { value: "customer_credit", label: "Customer Credit", tone: "amber" as "green" | "blue" | "purple" },
  { value: "split", label: "Split", tone: "purple" },
];

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
  return currencyFormatter.format(value).replace("PHP", "₱");
}

function formatPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(1)}%`;
}

function formatDeltaPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue >= 0 ? "+" : ""}${safeValue.toFixed(1)}%`;
}

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateValue));
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return { start, end };
}

function getPreviousMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
  return { start, end };
}

function isWithinRange(dateValue: string, start: Date, end: Date) {
  const timestamp = new Date(dateValue).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function getDaysBetween(startDate: string | Date, endDate: string | Date) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function getDaysOverdue(dueDate?: string | null) {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(dueDate);
  const diff = today.getTime() - due.getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
}

function getInvoiceAgeDays(createdAt: string) {
  return getDaysBetween(createdAt, new Date());
}

function getAgingBucket(createdAt: string): AgingKey {
  const age = getInvoiceAgeDays(createdAt);
  if (age <= 30) return "current";
  if (age <= 60) return "31-60";
  if (age <= 90) return "61-90";
  return "90+";
}

function formatUserName(user?: UserRow | null) {
  if (!user) return "Unassigned";
  const fullName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
  return fullName || user.username?.trim() || user.email?.split("@")[0] || "Unassigned";
}

function buildReceiptNumber(payment: ReceivablePaymentRow) {
  const seed = payment.reference_no?.trim() || payment.id.slice(0, 6).toUpperCase();
  return `RCV-${seed}`;
}

function buildInvoiceStatus(receivable: ReceivableRow) {
  const paidAmount = parseNumber(receivable.paid_amount);
  const balance = parseNumber(receivable.balance);
  const daysOverdue = getDaysOverdue(receivable.due_date);

  if (balance <= 0 || receivable.status === "paid") {
    return { baseStatus: "paid" as TabKey, statusLabel: "Paid", statusTone: "green" as const };
  }

  if (daysOverdue > 90) {
    return { baseStatus: "overdue" as TabKey, statusLabel: "Overdue 90+", statusTone: "rose" as const };
  }

  if (daysOverdue > 60) {
    return { baseStatus: "overdue" as TabKey, statusLabel: "Overdue 61-90", statusTone: "red" as const };
  }

  if (daysOverdue > 30) {
    return { baseStatus: "overdue" as TabKey, statusLabel: "Overdue 31-60", statusTone: "orange" as const };
  }

  if (daysOverdue > 0) {
    return { baseStatus: "overdue" as TabKey, statusLabel: "Overdue", statusTone: "red" as const };
  }

  if (paidAmount > 0) {
    return { baseStatus: "partial" as TabKey, statusLabel: "Partial", statusTone: "amber" as const };
  }

  return { baseStatus: "unpaid" as TabKey, statusLabel: "Unpaid", statusTone: "red" as const };
}

function buildUpdatedStatus(receivable: ReceivableRow, nextPaidAmount: number) {
  const totalAmount = parseNumber(receivable.total_amount);
  if (nextPaidAmount >= totalAmount) return "paid" as ReceivableStatus;
  if (getDaysOverdue(receivable.due_date) > 0) return "overdue" as ReceivableStatus;
  return "partial" as ReceivableStatus;
}

function buildDonutGradient(amounts: Record<AgingKey, number>) {
  const total = Object.values(amounts).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return "conic-gradient(#e2e8f0 0deg 360deg)";
  }

  const palette: Record<AgingKey, string> = {
    current: "#2563eb",
    "31-60": "#16a34a",
    "61-90": "#f59e0b",
    "90+": "#f97316",
  };

  let start = 0;
  const segments = (Object.entries(amounts) as Array<[AgingKey, number]>).map(([key, value]) => {
    const degrees = (value / total) * 360;
    const end = start + degrees;
    const segment = `${palette[key]} ${start}deg ${end}deg`;
    start = end;
    return segment;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

export default function ReceivablesPage() {
  const monthRange = getMonthRange(new Date());
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [currentUserProfileId, setCurrentUserProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [notice, setNotice] = useState("");

  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [payments, setPayments] = useState<ReceivablePaymentRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(formatDateInput(monthRange.start));
  const [dateTo, setDateTo] = useState(formatDateInput(monthRange.end));
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    receivableId: "",
    paymentMethod: "cash" as PaymentMethod,
    referenceNo: "",
    amount: "",
  });

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
        setError("Please sign in to view receivables.");
        setLoading(false);
        return;
      }

      const [profileResult, branchesResult] = await Promise.all([
        supabase
          .from("users")
          .select("id, first_name, last_name, username, email, branch_id, is_active")
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

      const profile = (profileResult.data as UserRow | null) ?? null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const defaultBranch = branchRows.find((branch) => branch.id === profile?.branch_id) ??
        branchRows.find((branch) => branch.is_main) ??
        branchRows[0];

      setCurrentUserProfileId(profile?.id ?? null);
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

    const loadReceivables = async () => {
      setLoading(true);
      setError("");

      const [receivablesResult, customersResult, usersResult] = await Promise.all([
        supabase
          .from("receivables")
          .select("id, invoice_number, customer_id, sale_id, branch_id, total_amount, paid_amount, balance, due_date, status, created_at, updated_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customers")
          .select("id, name, salesperson_id, credit_limit, current_balance, branch_id, is_active")
          .eq("branch_id", selectedBranchId)
          .order("name", { ascending: true }),
        supabase
          .from("users")
          .select("id, first_name, last_name, username, email, branch_id, is_active")
          .eq("is_active", true)
          .order("first_name", { ascending: true }),
      ]);

      const receivableRows = (receivablesResult.data ?? []) as ReceivableRow[];
      const customerRows = (customersResult.data ?? []) as CustomerRow[];
      const userRows = (usersResult.data ?? []) as UserRow[];
      const receivableIds = receivableRows.map((item) => item.id);

      const paymentsResult = receivableIds.length
        ? await supabase
            .from("receivable_payments")
            .select("id, receivable_id, amount, payment_method, reference_no, paid_at, received_by, created_at")
            .in("receivable_id", receivableIds)
            .order("paid_at", { ascending: false })
        : { data: [] };

      if (!isMounted) return;

      setReceivables(receivableRows);
      setCustomers(customerRows);
      setUsers(userRows);
      setPayments((paymentsResult.data ?? []) as ReceivablePaymentRow[]);
      setLoading(false);
    };

    void loadReceivables();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId]);

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  const enrichedReceivables: EnrichedReceivable[] = receivables.map((receivable) => {
    const customer = customerMap.get(receivable.customer_id);
    const salespersonId = customer?.salesperson_id ?? null;
    const salesperson = salespersonId ? userMap.get(salespersonId) : null;
    const status = buildInvoiceStatus(receivable);

    return {
      ...receivable,
      customerName: customer?.name ?? "Unknown Customer",
      salespersonId,
      salespersonName: formatUserName(salesperson),
      daysOverdue: getDaysOverdue(receivable.due_date),
      ageDays: getInvoiceAgeDays(receivable.created_at),
      statusLabel: status.statusLabel,
      statusTone: status.statusTone,
      baseStatus: status.baseStatus,
    };
  });

  const openReceivables = enrichedReceivables.filter((item) => parseNumber(item.balance) > 0);
  const customerOutstandingMap = new Map<string, number>();

  openReceivables.forEach((item) => {
    customerOutstandingMap.set(
      item.customer_id,
      (customerOutstandingMap.get(item.customer_id) ?? 0) + parseNumber(item.balance)
    );
  });

  const currentMonth = getMonthRange(new Date());
  const previousMonth = getPreviousMonthRange(new Date());

  const currentMonthIssued = receivables
    .filter((item) => isWithinRange(item.created_at, currentMonth.start, currentMonth.end))
    .reduce((sum, item) => sum + parseNumber(item.total_amount), 0);
  const previousMonthIssued = receivables
    .filter((item) => isWithinRange(item.created_at, previousMonth.start, previousMonth.end))
    .reduce((sum, item) => sum + parseNumber(item.total_amount), 0);
  const totalOutstanding = openReceivables.reduce((sum, item) => sum + parseNumber(item.balance), 0);
  const totalOutstandingChange = previousMonthIssued > 0
    ? ((currentMonthIssued - previousMonthIssued) / previousMonthIssued) * 100
    : 0;

  const agingAmounts: Record<AgingKey, number> = {
    current: 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };

  openReceivables.forEach((item) => {
    agingAmounts[getAgingBucket(item.created_at)] += parseNumber(item.balance);
  });

  const distinctCreditCustomers = new Set(openReceivables.map((item) => item.customer_id)).size;
  const donutGradient = buildDonutGradient(agingAmounts);

  const paymentGroups = new Map<string, ReceivablePaymentRow[]>();
  payments.forEach((payment) => {
    const list = paymentGroups.get(payment.receivable_id) ?? [];
    list.push(payment);
    paymentGroups.set(payment.receivable_id, list);
  });

  const currentMonthCollections = payments
    .filter((payment) => isWithinRange(payment.paid_at, currentMonth.start, currentMonth.end))
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
  const previousMonthCollections = payments
    .filter((payment) => isWithinRange(payment.paid_at, previousMonth.start, previousMonth.end))
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);

  const currentCollectionRate = currentMonthIssued > 0 ? (currentMonthCollections / currentMonthIssued) * 100 : 0;
  const previousCollectionRate = previousMonthIssued > 0 ? (previousMonthCollections / previousMonthIssued) * 100 : 0;

  const currentPaidInvoiceDays: number[] = [];
  const previousPaidInvoiceDays: number[] = [];

  enrichedReceivables.forEach((item) => {
    if (parseNumber(item.balance) > 0) return;
    const invoicePayments = paymentGroups.get(item.id) ?? [];
    if (invoicePayments.length === 0) return;

    const latestPayment = [...invoicePayments].sort((left, right) => (
      new Date(right.paid_at).getTime() - new Date(left.paid_at).getTime()
    ))[0];

    const daysToCollect = getDaysBetween(item.created_at, latestPayment.paid_at);

    if (isWithinRange(latestPayment.paid_at, currentMonth.start, currentMonth.end)) {
      currentPaidInvoiceDays.push(daysToCollect);
    }

    if (isWithinRange(latestPayment.paid_at, previousMonth.start, previousMonth.end)) {
      previousPaidInvoiceDays.push(daysToCollect);
    }
  });

  const averageDaysToCollect = currentPaidInvoiceDays.length
    ? currentPaidInvoiceDays.reduce((sum, value) => sum + value, 0) / currentPaidInvoiceDays.length
    : 0;
  const previousAverageDaysToCollect = previousPaidInvoiceDays.length
    ? previousPaidInvoiceDays.reduce((sum, value) => sum + value, 0) / previousPaidInvoiceDays.length
    : 0;
  const averageDaysDelta = averageDaysToCollect - previousAverageDaysToCollect;

  const overviewCards = [
    {
      label: "Total Receivables",
      value: formatCurrency(totalOutstanding),
      subtext: `${formatDeltaPercent(totalOutstandingChange)} vs last month`,
      color: "blue",
      icon: FileSpreadsheet,
    },
    {
      label: "Current (0 - 30 days)",
      value: formatCurrency(agingAmounts.current),
      subtext: `${formatPercent(totalOutstanding > 0 ? (agingAmounts.current / totalOutstanding) * 100 : 0)} of total`,
      color: "green",
      icon: Wallet,
    },
    {
      label: "Overdue (31 - 60 days)",
      value: formatCurrency(agingAmounts["31-60"]),
      subtext: `${formatPercent(totalOutstanding > 0 ? (agingAmounts["31-60"] / totalOutstanding) * 100 : 0)} of total`,
      color: "amber",
      icon: Clock3,
    },
    {
      label: "Overdue (61 - 90 days)",
      value: formatCurrency(agingAmounts["61-90"]),
      subtext: `${formatPercent(totalOutstanding > 0 ? (agingAmounts["61-90"] / totalOutstanding) * 100 : 0)} of total`,
      color: "red",
      icon: CalendarDays,
    },
    {
      label: "Overdue (90+ days)",
      value: formatCurrency(agingAmounts["90+"]),
      subtext: `${formatPercent(totalOutstanding > 0 ? (agingAmounts["90+"] / totalOutstanding) * 100 : 0)} of total`,
      color: "rose",
      icon: AlertTriangle,
    },
    {
      label: "Total Customers (Credit)",
      value: numberFormatter.format(distinctCreditCustomers),
      subtext: "Active credit customers",
      color: "purple",
      icon: Users,
    },
  ];

  const customerOptions = Array.from(
    new Map(
      openReceivables.map((item) => [item.customer_id, { id: item.customer_id, name: item.customerName }])
    ).values()
  );

  const salespersonOptions = Array.from(
    new Map(
      enrichedReceivables
        .filter((item) => item.salespersonId)
        .map((item) => [item.salespersonId as string, { id: item.salespersonId as string, name: item.salespersonName }])
    ).values()
  );

  const filteredInvoices = enrichedReceivables.filter((item) => {
    const createdDate = new Date(item.created_at);
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);

    if (activeTab !== "all" && item.baseStatus !== activeTab) return false;
    if (statusFilter !== "all" && item.baseStatus !== statusFilter) return false;
    if (customerFilter !== "all" && item.customer_id !== customerFilter) return false;
    if (salespersonFilter !== "all" && item.salespersonId !== salespersonFilter) return false;
    if (createdDate < fromDate || createdDate > toDate) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedInvoices = filteredInvoices.slice((safePage - 1) * pageSize, safePage * pageSize);

  const recentCollections = payments
    .slice()
    .sort((left, right) => new Date(right.paid_at).getTime() - new Date(left.paid_at).getTime())
    .slice(0, 5)
    .map((payment) => {
      const receivable = enrichedReceivables.find((item) => item.id === payment.receivable_id);
      const methodMeta = paymentMethodOptions.find((option) => option.value === payment.payment_method);

      return {
        receiptNo: buildReceiptNumber(payment),
        customer: receivable?.customerName ?? "Unknown Customer",
        date: formatDate(payment.paid_at),
        amount: formatCurrency(parseNumber(payment.amount)),
        method: methodMeta?.label ?? payment.payment_method,
        tone: methodMeta?.tone ?? "green",
      };
    });

  const overdueInvoices = enrichedReceivables
    .filter((item) => item.daysOverdue > 0 && parseNumber(item.balance) > 0)
    .sort((left, right) => right.daysOverdue - left.daysOverdue)
    .slice(0, 5);

  const topBalances = Array.from(customerOutstandingMap.entries())
    .map(([customerId, outstandingBalance]) => ({
      customerId,
      customer: customerMap.get(customerId)?.name ?? "Unknown Customer",
      balance: outstandingBalance,
      share: totalOutstanding > 0 ? (outstandingBalance / totalOutstanding) * 100 : 0,
    }))
    .sort((left, right) => right.balance - left.balance)
    .slice(0, 5);

  const invoiceOptions = openReceivables.filter((item) => {
    if (!paymentForm.customerId) return true;
    return item.customer_id === paymentForm.customerId;
  });

  const selectedReceivable = openReceivables.find((item) => item.id === paymentForm.receivableId) ?? null;

  const handlePaymentFormChange = (field: "customerId" | "receivableId" | "paymentMethod" | "referenceNo" | "amount", value: string) => {
    setPaymentForm((current) => {
      if (field === "customerId") {
        const fallbackInvoice = openReceivables.find((item) => item.customer_id === value);
        return {
          ...current,
          customerId: value,
          receivableId: current.receivableId && openReceivables.some((item) => item.id === current.receivableId && item.customer_id === value)
            ? current.receivableId
            : fallbackInvoice?.id ?? "",
          amount: "",
        };
      }

      if (field === "receivableId") {
        const invoice = openReceivables.find((item) => item.id === value);
        return {
          ...current,
          receivableId: value,
          customerId: invoice?.customer_id ?? current.customerId,
          amount: "",
        };
      }

      return { ...current, [field]: value };
    });
  };

  const refreshReceivables = async () => {
    if (!selectedBranchId) return;

    const receivablesResult = await supabase
      .from("receivables")
      .select("id, invoice_number, customer_id, sale_id, branch_id, total_amount, paid_amount, balance, due_date, status, created_at, updated_at")
      .eq("branch_id", selectedBranchId)
      .order("created_at", { ascending: false });

    const receivableRows = (receivablesResult.data ?? []) as ReceivableRow[];
    const receivableIds = receivableRows.map((item) => item.id);
    const paymentsResult = receivableIds.length
      ? await supabase
          .from("receivable_payments")
          .select("id, receivable_id, amount, payment_method, reference_no, paid_at, received_by, created_at")
          .in("receivable_id", receivableIds)
          .order("paid_at", { ascending: false })
      : { data: [] };

    setReceivables(receivableRows);
    setPayments((paymentsResult.data ?? []) as ReceivablePaymentRow[]);
  };

  const handleReceivePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!selectedReceivable) {
      setError("Please select an invoice with an outstanding balance.");
      return;
    }

    const amount = parseNumber(paymentForm.amount);
    const currentBalance = parseNumber(selectedReceivable.balance);
    const currentPaid = parseNumber(selectedReceivable.paid_amount);
    const totalAmount = parseNumber(selectedReceivable.total_amount);

    if (amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    if (amount > currentBalance) {
      setError("Payment amount cannot be greater than the remaining balance.");
      return;
    }

    setSavingPayment(true);

    const insertPaymentResult = await supabase.from("receivable_payments").insert({
      receivable_id: selectedReceivable.id,
      amount,
      payment_method: paymentForm.paymentMethod,
      reference_no: paymentForm.referenceNo.trim() || null,
      received_by: currentUserProfileId,
    });

    if (insertPaymentResult.error) {
      setSavingPayment(false);
      setError(insertPaymentResult.error.message);
      return;
    }

    const nextPaidAmount = Math.min(totalAmount, currentPaid + amount);
    const nextStatus = buildUpdatedStatus(selectedReceivable, nextPaidAmount);

    const updateReceivableResult = await supabase
      .from("receivables")
      .update({
        paid_amount: nextPaidAmount,
        status: nextStatus,
      })
      .eq("id", selectedReceivable.id);

    if (updateReceivableResult.error) {
      setSavingPayment(false);
      setError(updateReceivableResult.error.message);
      return;
    }

    const currentOutstanding = customerOutstandingMap.get(selectedReceivable.customer_id) ?? 0;
    const nextCustomerBalance = Math.max(0, currentOutstanding - amount);

    const updateCustomerResult = await supabase
      .from("customers")
      .update({ current_balance: nextCustomerBalance })
      .eq("id", selectedReceivable.customer_id);

    if (updateCustomerResult.error) {
      console.error("[Receivables] Failed to update customer balance:", updateCustomerResult.error.message);
    }

    await refreshReceivables();

    setSavingPayment(false);
    setNotice(`Payment recorded for ${selectedReceivable.invoice_number}.`);
    setPaymentForm({
      customerId: "",
      receivableId: "",
      paymentMethod: "cash",
      referenceNo: "",
      amount: "",
    });
  };

  return (
    <div className="receivables-page">
      {error ? <div className="receivables-alert receivables-alert--error">{error}</div> : null}
      {notice ? <div className="receivables-alert receivables-alert--success">{notice}</div> : null}

      <section className="receivables-overview">
        {overviewCards.map((card) => {
          const Icon = card.icon;

          return (
            <article key={card.label} className="receivables-metric">
              <div className={`receivables-metric__icon receivables-metric__icon--${card.color}`}>
                <Icon size={20} />
              </div>
              <div className="receivables-metric__content">
                <span className="receivables-metric__label">{card.label}</span>
                <strong className="receivables-metric__value">{card.value}</strong>
                <span className="receivables-metric__sub">{card.subtext}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="receivables-layout">
        <div className="receivables-layout__main">
          <article className="receivables-panel">
            <div className="receivables-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`receivables-tabs__item ${activeTab === tab.key ? "receivables-tabs__item--active" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setPage(1);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="receivables-toolbar">
              <div className="receivables-toolbar__filters">
                <label className="receivables-select">
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Status</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <ChevronDown size={14} />
                </label>

                <label className="receivables-select">
                  <select
                    value={customerFilter}
                    onChange={(event) => {
                      setCustomerFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Customers</option>
                    {customerOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>

                <label className="receivables-select">
                  <select
                    value={salespersonFilter}
                    onChange={(event) => {
                      setSalespersonFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Salesperson</option>
                    {salespersonOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>

                <div className="receivables-date-range">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => {
                      setDateFrom(event.target.value);
                      setPage(1);
                    }}
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => {
                      setDateTo(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              <button type="button" className="receivables-filter-button">
                <Filter size={14} />
                <span>Filters</span>
              </button>
            </div>

            <div className="receivables-table-wrap">
              <table className="receivables-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th>Total Amount</th>
                    <th>Paid Amount</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Days Overdue</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="receivables-empty">
                        <LoaderCircle size={16} className="receivables-spin" />
                        <span>Loading receivables...</span>
                      </td>
                    </tr>
                  ) : paginatedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="receivables-empty">No receivables found for the selected filters.</td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="receivables-table__invoice">{invoice.invoice_number}</td>
                        <td>{invoice.customerName}</td>
                        <td>{formatDate(invoice.created_at)}</td>
                        <td>{formatDate(invoice.due_date)}</td>
                        <td>{formatCurrency(parseNumber(invoice.total_amount))}</td>
                        <td>{formatCurrency(parseNumber(invoice.paid_amount))}</td>
                        <td className="receivables-table__balance">{formatCurrency(parseNumber(invoice.balance))}</td>
                        <td>
                          <span className={`receivables-status receivables-status--${invoice.statusTone}`}>
                            {invoice.statusLabel}
                          </span>
                        </td>
                        <td>{invoice.daysOverdue}</td>
                        <td>
                          <div className="receivables-table__actions">
                            <button type="button" aria-label={`View ${invoice.invoice_number}`}>
                              <Eye size={14} />
                            </button>
                            <button type="button" aria-label={`More actions for ${invoice.invoice_number}`}>
                              <Ellipsis size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="receivables-pagination">
              <span>
                Showing {filteredInvoices.length === 0 ? 0 : (safePage - 1) * pageSize + 1}
                {" "}to{" "}
                {Math.min(safePage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} entries
              </span>

              <div className="receivables-pagination__controls">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={safePage === pageNumber ? "receivables-pagination__controls--active" : ""}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>›</button>
              </div>

              <button type="button" className="receivables-pagination__size">{pageSize} / page</button>
            </div>
          </article>

          <div className="receivables-bottom-grid">
            <article className="receivables-panel">
              <div className="receivables-panel__heading">
                <h3>Recent Collections</h3>
                <button type="button">View All</button>
              </div>

              <table className="receivables-mini-table">
                <thead>
                  <tr>
                    <th>OR #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCollections.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="receivables-empty">No collections recorded yet.</td>
                    </tr>
                  ) : (
                    recentCollections.map((collection) => (
                      <tr key={collection.receiptNo}>
                        <td className="receivables-table__invoice">{collection.receiptNo}</td>
                        <td>{collection.customer}</td>
                        <td>{collection.date}</td>
                        <td>{collection.amount}</td>
                        <td>
                          <span className={`receivables-method receivables-method--${collection.tone}`}>
                            {collection.method}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </article>

            <article className="receivables-panel">
              <div className="receivables-panel__heading">
                <h3>Overdue Invoices</h3>
                <button type="button">View All</button>
              </div>

              <table className="receivables-mini-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Due Date</th>
                    <th>Days</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="receivables-empty">No overdue invoices found.</td>
                    </tr>
                  ) : (
                    overdueInvoices.map((item) => (
                      <tr key={item.id}>
                        <td className="receivables-table__invoice">{item.invoice_number}</td>
                        <td>{item.customerName}</td>
                        <td>{formatDate(item.due_date)}</td>
                        <td><span className="receivables-days-pill">{item.daysOverdue}</span></td>
                        <td>{formatCurrency(parseNumber(item.balance))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </article>
          </div>
        </div>

        <aside className="receivables-layout__side">
          <article className="receivables-panel">
            <div className="receivables-panel__heading receivables-panel__heading--stack">
              <div>
                <h3>Receivables Aging Report</h3>
              </div>
            </div>

            <div className="receivables-aging">
              <div className="receivables-aging__chart">
                <div className="receivables-donut" style={{ background: donutGradient }}>
                  <div className="receivables-donut__center">
                    <span>Total</span>
                    <strong>{formatCurrency(totalOutstanding)}</strong>
                  </div>
                </div>
              </div>

              <div className="receivables-aging__legend">
                {[
                  { label: "Current (0 - 30 days)", value: agingAmounts.current, share: totalOutstanding > 0 ? (agingAmounts.current / totalOutstanding) * 100 : 0, tone: "blue" },
                  { label: "Overdue (31 - 60 days)", value: agingAmounts["31-60"], share: totalOutstanding > 0 ? (agingAmounts["31-60"] / totalOutstanding) * 100 : 0, tone: "green" },
                  { label: "Overdue (61 - 90 days)", value: agingAmounts["61-90"], share: totalOutstanding > 0 ? (agingAmounts["61-90"] / totalOutstanding) * 100 : 0, tone: "amber" },
                  { label: "Overdue (90+ days)", value: agingAmounts["90+"], share: totalOutstanding > 0 ? (agingAmounts["90+"] / totalOutstanding) * 100 : 0, tone: "orange" },
                ].map((item) => (
                  <div key={item.label} className="receivables-legend">
                    <span className={`receivables-legend__dot receivables-legend__dot--${item.tone}`} />
                    <div className="receivables-legend__copy">
                      <span>{item.label}</span>
                      <strong>{formatCurrency(item.value)}</strong>
                    </div>
                    <span className="receivables-legend__share">{formatPercent(item.share)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="receivables-side-stats">
              <div className="receivables-side-stat">
                <span>Average Days to Collect</span>
                <strong>{Math.round(averageDaysToCollect)} days</strong>
                <small>
                  {`${averageDaysDelta >= 0 ? "+" : ""}${Math.round(averageDaysDelta)} days vs last month`}
                </small>
              </div>
              <div className="receivables-side-stat">
                <span>Collection Rate (This Month)</span>
                <strong>{formatPercent(currentCollectionRate)}</strong>
                <small>{`${formatDeltaPercent(currentCollectionRate - previousCollectionRate)} vs last month`}</small>
              </div>
            </div>
          </article>

          <article className="receivables-panel">
            <div className="receivables-panel__heading">
              <h3>Top Customer Balances</h3>
              <button type="button">View All</button>
            </div>

            <div className="receivables-ranking">
              {topBalances.length === 0 ? (
                <div className="receivables-empty receivables-empty--stack">No customer balances available.</div>
              ) : (
                topBalances.map((balance) => (
                  <div key={balance.customerId} className="receivables-ranking__row">
                    <span>{balance.customer}</span>
                    <strong>{formatCurrency(balance.balance)}</strong>
                    <span>{formatPercent(balance.share)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="receivables-panel">
            <div className="receivables-panel__heading">
              <h3>Quick Receive Payment</h3>
            </div>

            <form className="receivables-form" onSubmit={handleReceivePayment}>
              <label>
                <span>Customer</span>
                <div className="receivables-select receivables-select--field">
                  <select
                    value={paymentForm.customerId}
                    onChange={(event) => handlePaymentFormChange("customerId", event.target.value)}
                  >
                    <option value="">Select customer</option>
                    {customerOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>

              <label>
                <span>Invoice #</span>
                <div className="receivables-select receivables-select--field">
                  <select
                    value={paymentForm.receivableId}
                    onChange={(event) => handlePaymentFormChange("receivableId", event.target.value)}
                  >
                    <option value="">Select invoice</option>
                    {invoiceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.invoice_number} - {formatCurrency(parseNumber(option.balance))}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>

              <label>
                <span>Payment Method</span>
                <div className="receivables-select receivables-select--field">
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(event) => handlePaymentFormChange("paymentMethod", event.target.value)}
                  >
                    {paymentMethodOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>

              <label>
                <span>Reference #</span>
                <input
                  type="text"
                  placeholder="Enter reference #"
                  value={paymentForm.referenceNo}
                  onChange={(event) => handlePaymentFormChange("referenceNo", event.target.value)}
                />
              </label>

              <label className="receivables-form__full">
                <span>Amount Received</span>
                <div className="receivables-form__money">
                  <span>₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(event) => handlePaymentFormChange("amount", event.target.value)}
                  />
                </div>
                {selectedReceivable ? (
                  <small className="receivables-form__hint">
                    Remaining balance: {formatCurrency(parseNumber(selectedReceivable.balance))}
                  </small>
                ) : null}
              </label>

              <div className="receivables-form__actions">
                <button
                  type="button"
                  className="receivables-button receivables-button--light"
                  onClick={() => {
                    if (!selectedReceivable) return;
                    setPaymentForm((current) => ({
                      ...current,
                      amount: parseNumber(selectedReceivable.balance).toFixed(2),
                    }));
                  }}
                >
                  <Landmark size={15} />
                  <span>Apply Full Balance</span>
                </button>

                <button type="submit" className="receivables-button receivables-button--success" disabled={savingPayment}>
                  {savingPayment ? <LoaderCircle size={15} className="receivables-spin" /> : <CreditCard size={15} />}
                  <span>{savingPayment ? "Saving Payment..." : "Receive Payment"}</span>
                </button>
              </div>
            </form>
          </article>
        </aside>
      </section>

      <section className="receivables-footer-banner">
        <div className="receivables-footer-banner__copy">
          <div className="receivables-footer-banner__icon">
            <CircleDollarSign size={18} />
          </div>
          <div>
            <strong>Set credit limits for customers and manage collections effectively.</strong>
            <p>Go to Settings &gt; Credit Limits to configure customer credit terms and limits.</p>
          </div>
        </div>

        <button type="button" className="receivables-button receivables-button--outline">
          Manage Credit Limits
        </button>
      </section>
    </div>
  );
}

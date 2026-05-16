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
  branch_id?: string | null;
};

type SupplierRow = {
  id: string;
  name: string;
  payment_terms?: number | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  is_active?: boolean | null;
};

type PurchaseOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "fully_received"
  | "cancelled";

type PaymentMethod = "cash" | "card" | "bank_transfer" | "gcash" | "ewallet" | "customer_credit" | "split";

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  branch_id: string;
  status: PurchaseOrderStatus;
  due_date?: string | null;
  expected_date?: string | null;
  supplier_invoice?: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  created_at: string;
  updated_at?: string | null;
};

type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  po_id?: string | null;
  amount: string | number;
  payment_method: PaymentMethod;
  reference_no?: string | null;
  paid_at: string;
  created_at?: string | null;
};

type TabKey = "all" | "unpaid" | "partial" | "paid" | "overdue";
type AgingKey = "current" | "31-60" | "61-90" | "90+";

type EnrichedPayable = PurchaseOrderRow & {
  supplierName: string;
  dueDate: string | null;
  billNumber: string;
  daysOverdue: number;
  ageDays: number;
  statusLabel: string;
  statusTone: "green" | "red" | "amber" | "orange" | "rose";
  baseStatus: TabKey;
  balance: number;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All Bills" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
];

const paymentMethodOptions: Array<{ value: PaymentMethod; label: string; tone: "green" | "blue" | "purple" | "amber" }> = [
  { value: "cash", label: "Cash", tone: "green" },
  { value: "card", label: "Card", tone: "purple" },
  { value: "bank_transfer", label: "Bank Transfer", tone: "blue" },
  { value: "gcash", label: "GCash", tone: "blue" },
  { value: "ewallet", label: "E-Wallet", tone: "blue" },
  { value: "split", label: "Split", tone: "amber" },
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
  return currencyFormatter.format(value);
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
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - due.getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
}

function getBillAgeDays(createdAt: string) {
  return getDaysBetween(createdAt, new Date());
}

function getAgingBucket(createdAt: string): AgingKey {
  const age = getBillAgeDays(createdAt);
  if (age <= 30) return "current";
  if (age <= 60) return "31-60";
  if (age <= 90) return "61-90";
  return "90+";
}

function buildReceiptNumber(payment: SupplierPaymentRow) {
  const seed = payment.reference_no?.trim() || payment.id.slice(0, 6).toUpperCase();
  return `PAY-${seed}`;
}

function buildBillStatus(balance: number, paidAmount: number, daysOverdue: number) {
  if (balance <= 0) {
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

function buildUpdatedStatus(payable: PurchaseOrderRow, nextPaidAmount: number, dueDate: string | null) {
  const totalAmount = parseNumber(payable.total_amount);
  if (nextPaidAmount >= totalAmount) return "fully_received";
  if (getDaysOverdue(dueDate) > 0) return "ordered";
  return "partially_received";
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

export default function PayablesPage() {
  const monthRange = getMonthRange(new Date());
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [currentUserProfileId, setCurrentUserProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [notice, setNotice] = useState("");

  const [payables, setPayables] = useState<PurchaseOrderRow[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(formatDateInput(monthRange.start));
  const [dateTo, setDateTo] = useState(formatDateInput(monthRange.end));
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [paymentForm, setPaymentForm] = useState({
    supplierId: "",
    payableId: "",
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
        setError("Please sign in to view payables.");
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

      const profile = (profileResult.data as UserRow | null) ?? null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const defaultBranch =
        branchRows.find((branch) => branch.id === profile?.branch_id) ??
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

    const loadPayables = async () => {
      setLoading(true);
      setError("");

      const [payablesResult, suppliersResult] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("id, po_number, supplier_id, branch_id, status, due_date, expected_date, supplier_invoice, total_amount, paid_amount, created_at, updated_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("suppliers")
          .select("id, name, payment_terms, credit_limit, current_balance, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      const payableRows = ((payablesResult.data ?? []) as PurchaseOrderRow[]).filter(
        (item) => item.status !== "draft" && item.status !== "cancelled"
      );
      const supplierRows = (suppliersResult.data ?? []) as SupplierRow[];
      const payableIds = payableRows.map((item) => item.id);

      const paymentsResult = payableIds.length
        ? await supabase
            .from("supplier_payments")
            .select("id, supplier_id, po_id, amount, payment_method, reference_no, paid_at, created_at")
            .in("po_id", payableIds)
            .order("paid_at", { ascending: false })
        : { data: [] };

      if (!isMounted) return;

      setPayables(payableRows);
      setSuppliers(supplierRows);
      setPayments((paymentsResult.data ?? []) as SupplierPaymentRow[]);
      setLoading(false);
    };

    void loadPayables();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId]);

  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const enrichedPayables: EnrichedPayable[] = payables.map((payable) => {
    const supplier = supplierMap.get(payable.supplier_id);
    const dueDate = payable.due_date ?? payable.expected_date ?? null;
    const paidAmount = parseNumber(payable.paid_amount);
    const totalAmount = parseNumber(payable.total_amount);
    const balance = Math.max(totalAmount - paidAmount, 0);
    const daysOverdue = getDaysOverdue(dueDate);
    const status = buildBillStatus(balance, paidAmount, daysOverdue);

    return {
      ...payable,
      supplierName: supplier?.name ?? "Unknown Supplier",
      dueDate,
      billNumber: payable.supplier_invoice?.trim() || payable.po_number,
      daysOverdue,
      ageDays: getBillAgeDays(payable.created_at),
      statusLabel: status.statusLabel,
      statusTone: status.statusTone,
      baseStatus: status.baseStatus,
      balance,
    };
  });

  const openPayables = enrichedPayables.filter((item) => item.balance > 0);
  const supplierOutstandingMap = new Map<string, number>();

  openPayables.forEach((item) => {
    supplierOutstandingMap.set(item.supplier_id, (supplierOutstandingMap.get(item.supplier_id) ?? 0) + item.balance);
  });

  const currentMonth = getMonthRange(new Date());
  const previousMonth = getPreviousMonthRange(new Date());

  const currentMonthIssued = payables
    .filter((item) => isWithinRange(item.created_at, currentMonth.start, currentMonth.end))
    .reduce((sum, item) => sum + Math.max(parseNumber(item.total_amount) - parseNumber(item.paid_amount), 0), 0);
  const previousMonthIssued = payables
    .filter((item) => isWithinRange(item.created_at, previousMonth.start, previousMonth.end))
    .reduce((sum, item) => sum + Math.max(parseNumber(item.total_amount) - parseNumber(item.paid_amount), 0), 0);
  const totalOutstanding = openPayables.reduce((sum, item) => sum + item.balance, 0);
  const totalOutstandingChange = previousMonthIssued > 0
    ? ((currentMonthIssued - previousMonthIssued) / previousMonthIssued) * 100
    : 0;

  const agingAmounts: Record<AgingKey, number> = {
    current: 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };

  openPayables.forEach((item) => {
    agingAmounts[getAgingBucket(item.created_at)] += item.balance;
  });

  const distinctCreditSuppliers = new Set(openPayables.map((item) => item.supplier_id)).size;
  const donutGradient = buildDonutGradient(agingAmounts);

  const paymentGroups = new Map<string, SupplierPaymentRow[]>();
  payments.forEach((payment) => {
    if (!payment.po_id) return;
    const list = paymentGroups.get(payment.po_id) ?? [];
    list.push(payment);
    paymentGroups.set(payment.po_id, list);
  });

  const currentMonthPayments = payments
    .filter((payment) => isWithinRange(payment.paid_at, currentMonth.start, currentMonth.end))
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
  const previousMonthPayments = payments
    .filter((payment) => isWithinRange(payment.paid_at, previousMonth.start, previousMonth.end))
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);

  const payablesTurnover = totalOutstanding > 0 ? currentMonthPayments / totalOutstanding : 0;
  const previousPayablesTurnover = previousMonthIssued > 0 ? previousMonthPayments / previousMonthIssued : 0;

  const currentPaidBillDays: number[] = [];
  const previousPaidBillDays: number[] = [];

  enrichedPayables.forEach((item) => {
    if (item.balance > 0) return;
    const billPayments = paymentGroups.get(item.id) ?? [];
    if (billPayments.length === 0) return;

    const latestPayment = [...billPayments].sort(
      (left, right) => new Date(right.paid_at).getTime() - new Date(left.paid_at).getTime()
    )[0];

    const daysToPay = getDaysBetween(item.created_at, latestPayment.paid_at);

    if (isWithinRange(latestPayment.paid_at, currentMonth.start, currentMonth.end)) {
      currentPaidBillDays.push(daysToPay);
    }

    if (isWithinRange(latestPayment.paid_at, previousMonth.start, previousMonth.end)) {
      previousPaidBillDays.push(daysToPay);
    }
  });

  const averageDaysToPay = currentPaidBillDays.length
    ? currentPaidBillDays.reduce((sum, value) => sum + value, 0) / currentPaidBillDays.length
    : 0;
  const previousAverageDaysToPay = previousPaidBillDays.length
    ? previousPaidBillDays.reduce((sum, value) => sum + value, 0) / previousPaidBillDays.length
    : 0;
  const averageDaysDelta = averageDaysToPay - previousAverageDaysToPay;

  const overviewCards = [
    {
      label: "Total Payables",
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
      label: "Total Suppliers (Credit)",
      value: numberFormatter.format(distinctCreditSuppliers),
      subtext: "Active credit suppliers",
      color: "purple",
      icon: Users,
    },
  ];

  const supplierOptions = Array.from(
    new Map(openPayables.map((item) => [item.supplier_id, { id: item.supplier_id, name: item.supplierName }])).values()
  );

  const filteredBills = enrichedPayables.filter((item) => {
    const createdDate = new Date(item.created_at);
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);

    if (activeTab !== "all" && item.baseStatus !== activeTab) return false;
    if (statusFilter !== "all" && item.baseStatus !== statusFilter) return false;
    if (supplierFilter !== "all" && item.supplier_id !== supplierFilter) return false;
    if (createdDate < fromDate || createdDate > toDate) return false;

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedBills = filteredBills.slice((safePage - 1) * pageSize, safePage * pageSize);

  const recentPayments = payments.slice(0, 5).map((payment) => {
    const supplier = supplierMap.get(payment.supplier_id);
    const methodMeta = paymentMethodOptions.find((option) => option.value === payment.payment_method);

    return {
      receiptNo: buildReceiptNumber(payment),
      supplier: supplier?.name ?? "Unknown Supplier",
      date: formatDate(payment.paid_at),
      amount: formatCurrency(parseNumber(payment.amount)),
      method: methodMeta?.label ?? payment.payment_method,
      tone: methodMeta?.tone ?? "green",
    };
  });

  const upcomingDue = openPayables
    .filter((item) => {
      if (!item.dueDate) return false;
      const daysUntilDue = getDaysBetween(new Date(), item.dueDate);
      return new Date(item.dueDate).getTime() >= new Date().setHours(0, 0, 0, 0) && daysUntilDue <= 7;
    })
    .sort((left, right) => new Date(left.dueDate ?? "").getTime() - new Date(right.dueDate ?? "").getTime())
    .slice(0, 5);

  const topBalances = Array.from(supplierOutstandingMap.entries())
    .map(([supplierId, balance]) => ({
      supplierId,
      supplier: supplierMap.get(supplierId)?.name ?? "Unknown Supplier",
      balance,
      share: totalOutstanding > 0 ? (balance / totalOutstanding) * 100 : 0,
    }))
    .sort((left, right) => right.balance - left.balance)
    .slice(0, 5);

  const supplierBillOptions = openPayables.filter(
    (item) => !paymentForm.supplierId || item.supplier_id === paymentForm.supplierId
  );
  const selectedPayable = openPayables.find((item) => item.id === paymentForm.payableId) ?? null;

  const resetForm = () => {
    setPaymentForm({
      supplierId: "",
      payableId: "",
      paymentMethod: "cash",
      referenceNo: "",
      amount: "",
    });
  };

  const handlePaymentFormChange = (field: keyof typeof paymentForm, value: string) => {
    setPaymentForm((current) => {
      if (field === "supplierId") {
        return {
          ...current,
          supplierId: value,
          payableId: "",
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleMakePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");

    if (!currentUserProfileId) {
      setError("Your user profile is not linked yet. Please sign in again.");
      return;
    }

    const payable = openPayables.find((item) => item.id === paymentForm.payableId);
    if (!payable) {
      setError("Please select an open bill to pay.");
      return;
    }

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (amount > payable.balance) {
      setError(`Payment amount cannot exceed the remaining balance of ${formatCurrency(payable.balance)}.`);
      return;
    }

    setSavingPayment(true);
    setError("");

    const nextPaidAmount = parseNumber(payable.paid_amount) + amount;
    const nextStatus = buildUpdatedStatus(payable, nextPaidAmount, payable.dueDate);

    const insertPayment = await supabase.from("supplier_payments").insert({
      supplier_id: payable.supplier_id,
      po_id: payable.id,
      amount,
      payment_method: paymentForm.paymentMethod,
      reference_no: paymentForm.referenceNo.trim() || null,
      created_by: currentUserProfileId,
    });

    if (insertPayment.error) {
      setSavingPayment(false);
      setError(insertPayment.error.message);
      return;
    }

    const updatePayable = await supabase
      .from("purchase_orders")
      .update({
        paid_amount: nextPaidAmount,
        status: nextStatus,
      })
      .eq("id", payable.id);

    if (updatePayable.error) {
      setSavingPayment(false);
      setError(updatePayable.error.message);
      return;
    }

    const refreshedPayableRows = payables.map((item) => (
      item.id === payable.id
        ? {
            ...item,
            paid_amount: nextPaidAmount,
            status: nextStatus as PurchaseOrderStatus,
          }
        : item
    ));

    const insertedPayment: SupplierPaymentRow = {
      id: crypto.randomUUID(),
      supplier_id: payable.supplier_id,
      po_id: payable.id,
      amount,
      payment_method: paymentForm.paymentMethod,
      reference_no: paymentForm.referenceNo.trim() || null,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    setPayables(refreshedPayableRows);
    setPayments((current) => [insertedPayment, ...current]);
    setNotice(`Payment of ${formatCurrency(amount)} recorded for ${payable.billNumber}.`);
    resetForm();
    setSavingPayment(false);
  };

  return (
    <div className="receivables-page">
      {error ? (
        <div className="receivables-alert receivables-alert--error">{error}</div>
      ) : null}

      {notice ? (
        <div className="receivables-alert receivables-alert--success">{notice}</div>
      ) : null}

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
                <small className="receivables-metric__sub">{card.subtext}</small>
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
                    value={supplierFilter}
                    onChange={(event) => {
                      setSupplierFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All Suppliers</option>
                    {supplierOptions.map((option) => (
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
                    <th>Bill #</th>
                    <th>Supplier</th>
                    <th>Bill Date</th>
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
                        <span>Loading payables...</span>
                      </td>
                    </tr>
                  ) : paginatedBills.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="receivables-empty">No supplier bills found for the selected filters.</td>
                    </tr>
                  ) : (
                    paginatedBills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="receivables-table__invoice">{bill.billNumber}</td>
                        <td>{bill.supplierName}</td>
                        <td>{formatDate(bill.created_at)}</td>
                        <td>{formatDate(bill.dueDate)}</td>
                        <td>{formatCurrency(parseNumber(bill.total_amount))}</td>
                        <td>{formatCurrency(parseNumber(bill.paid_amount))}</td>
                        <td className="receivables-table__balance">{formatCurrency(bill.balance)}</td>
                        <td>
                          <span className={`receivables-status receivables-status--${bill.statusTone}`}>
                            {bill.statusLabel}
                          </span>
                        </td>
                        <td>{bill.daysOverdue}</td>
                        <td>
                          <div className="receivables-table__actions">
                            <button type="button" aria-label={`View ${bill.billNumber}`}>
                              <Eye size={14} />
                            </button>
                            <button type="button" aria-label={`More actions for ${bill.billNumber}`}>
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
                Showing {filteredBills.length === 0 ? 0 : (safePage - 1) * pageSize + 1}
                {" "}to{" "}
                {Math.min(safePage * pageSize, filteredBills.length)} of {filteredBills.length} entries
              </span>

              <div className="receivables-pagination__controls">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</button>
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
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
              </div>

              <button type="button" className="receivables-pagination__size">{pageSize} / page</button>
            </div>
          </article>

          <div className="receivables-bottom-grid">
            <article className="receivables-panel">
              <div className="receivables-panel__heading">
                <h3>Recent Payments</h3>
                <button type="button">View All</button>
              </div>

              <table className="receivables-mini-table">
                <thead>
                  <tr>
                    <th>OR #</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="receivables-empty">No supplier payments recorded yet.</td>
                    </tr>
                  ) : (
                    recentPayments.map((payment) => (
                      <tr key={payment.receiptNo}>
                        <td className="receivables-table__invoice">{payment.receiptNo}</td>
                        <td>{payment.supplier}</td>
                        <td>{payment.date}</td>
                        <td>{payment.amount}</td>
                        <td>
                          <span className={`receivables-method receivables-method--${payment.tone}`}>
                            {payment.method}
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
                <h3>Upcoming Due (Next 7 Days)</h3>
                <button type="button">View All</button>
              </div>

              <table className="receivables-mini-table">
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Supplier</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDue.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="receivables-empty">No payables due in the next 7 days.</td>
                    </tr>
                  ) : (
                    upcomingDue.map((item) => (
                      <tr key={item.id}>
                        <td className="receivables-table__invoice">{item.billNumber}</td>
                        <td>{item.supplierName}</td>
                        <td>{formatDate(item.dueDate)}</td>
                        <td>{formatCurrency(item.balance)}</td>
                        <td><span className="receivables-days-pill">{getDaysBetween(new Date(), item.dueDate ?? new Date())}</span></td>
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
                <h3>Payables Aging Report</h3>
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
                <span>Average Days to Pay</span>
                <strong>{Math.round(averageDaysToPay)} days</strong>
                <small>{`${averageDaysDelta >= 0 ? "+" : ""}${Math.round(averageDaysDelta)} days vs last month`}</small>
              </div>
              <div className="receivables-side-stat">
                <span>Payables Turnover (This Month)</span>
                <strong>{payablesTurnover.toFixed(2)}x</strong>
                <small>{`${formatDeltaPercent((payablesTurnover - previousPayablesTurnover) * 100)} vs last month`}</small>
              </div>
            </div>
          </article>

          <article className="receivables-panel">
            <div className="receivables-panel__heading">
              <h3>Top Suppliers by Balance</h3>
              <button type="button">View All</button>
            </div>

            <div className="receivables-ranking">
              {topBalances.length === 0 ? (
                <div className="receivables-empty receivables-empty--stack">No supplier balances available.</div>
              ) : (
                topBalances.map((balance) => (
                  <div key={balance.supplierId} className="receivables-ranking__row">
                    <span>{balance.supplier}</span>
                    <strong>{formatCurrency(balance.balance)}</strong>
                    <span>{formatPercent(balance.share)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="receivables-panel">
            <div className="receivables-panel__heading">
              <h3>Quick Pay</h3>
            </div>

            <form className="receivables-form" onSubmit={handleMakePayment}>
              <label>
                <span>Supplier</span>
                <div className="receivables-select receivables-select--field">
                  <select
                    value={paymentForm.supplierId}
                    onChange={(event) => handlePaymentFormChange("supplierId", event.target.value)}
                  >
                    <option value="">Select supplier</option>
                    {supplierOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>

              <label>
                <span>Bill #</span>
                <div className="receivables-select receivables-select--field">
                  <select
                    value={paymentForm.payableId}
                    onChange={(event) => handlePaymentFormChange("payableId", event.target.value)}
                  >
                    <option value="">Select bill</option>
                    {supplierBillOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.billNumber} - {formatCurrency(option.balance)}
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
                <span>Amount</span>
                <div className="receivables-form__money">
                  <span>PHP</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(event) => handlePaymentFormChange("amount", event.target.value)}
                  />
                </div>
                {selectedPayable ? (
                  <small className="receivables-form__hint">
                    Remaining balance: {formatCurrency(selectedPayable.balance)}
                  </small>
                ) : null}
              </label>

              <div className="receivables-form__actions">
                <button
                  type="button"
                  className="receivables-button receivables-button--outline"
                  onClick={resetForm}
                >
                  Clear
                </button>

                <button type="submit" className="receivables-button receivables-button--success" disabled={savingPayment}>
                  {savingPayment ? <LoaderCircle size={15} className="receivables-spin" /> : <CreditCard size={15} />}
                  <span>{savingPayment ? "Saving Payment..." : "Make Payment"}</span>
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
            <strong>Stay on top of your payables to maintain good supplier relationships.</strong>
            <p>Pay on time and avoid late fees or service interruptions.</p>
          </div>
        </div>

        <button type="button" className="receivables-button receivables-button--outline">
          Payables Settings
        </button>
      </section>
    </div>
  );
}

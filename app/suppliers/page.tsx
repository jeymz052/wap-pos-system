"use client";

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Filter,
  LoaderCircle,
  Mail,
  MapPin,
  Package,
  PencilLine,
  Percent,
  Phone,
  Plus,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Wallet,
  X,
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

type SupplierType = "retailer" | "distributor" | "wholesaler" | "manufacturer" | "service_provider";

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  supplier_type?: SupplierType | null;
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
  invoice_image_url?: string | null;
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

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  supplier_id?: string | null;
  cost_price?: string | number | null;
  selling_price?: string | number | null;
  reorder_level?: number | null;
  status?: string | null;
};

type InventoryStockRow = {
  product_id: string;
  branch_id: string;
  quantity: string | number;
};

type PurchaseOrderItemRow = {
  id: string;
  po_id: string;
  product_id: string;
  quantity: number;
  received_qty?: number | null;
  unit_cost: string | number;
  notes?: string | null;
};

type SupplierStatusTone = "green" | "red" | "amber";
type SupplierActivityTone = "blue" | "green" | "orange";
type AgingKey = "current" | "31-60" | "61-90" | "90+";
type DetailTab = "overview" | "products" | "history" | "invoices" | "performance";
type ModalMode = "create" | "edit";

type SupplierSummary = SupplierRow & {
  balanceValue: number;
  creditLimitValue: number;
  availableCreditValue: number;
  totalPurchasesThisMonth: number;
  totalPurchasesThisYear: number;
  purchaseOrderCount: number;
  invoiceCount: number;
  overdueBalanceValue: number;
  currentBalanceValue: number;
  aged31to60Value: number;
  aged61to90Value: number;
  aged90PlusValue: number;
  lastPurchaseAt: string | null;
  lastPaymentAt: string | null;
  productCount: number;
  activeProductCount: number;
  totalPaidValue: number;
  onTimeRate: number;
  fillRate: number;
  averageLeadDays: number;
  averageOrderValue: number;
  paymentCompletionRate: number;
  performanceScore: number;
  performanceLabel: "Exceptional" | "Stable" | "Watch";
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

type SupplierFormState = {
  code: string;
  name: string;
  supplier_type: SupplierType;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  tax_number: string;
  payment_terms: string;
  credit_limit: string;
  is_active: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-PH");

const supplierTypeOptions: Array<{ value: SupplierType; label: string }> = [
  { value: "distributor", label: "Distributor" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "retailer", label: "Retailer" },
  { value: "service_provider", label: "Service Provider" },
  { value: "wholesaler", label: "Wholesaler" },
];

const detailTabs: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "products", label: "Products" },
  { key: "history", label: "Purchase History" },
  { key: "invoices", label: "Invoices" },
  { key: "performance", label: "Performance" },
];

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

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
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

function formatStatusLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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

function getPerformanceLabel(score: number): SupplierSummary["performanceLabel"] {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Stable";
  return "Watch";
}

function buildSupplierCode(name: string) {
  const cleanedName = name.replace(/[^A-Za-z0-9 ]/g, "").trim();
  const prefix = cleanedName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("")
    .slice(0, 6);
  return `${prefix || "SUP"}-${Date.now().toString().slice(-6)}`;
}

function createInitialFormState(supplier?: SupplierRow | null): SupplierFormState {
  return {
    code: supplier?.code ?? "",
    name: supplier?.name ?? "",
    supplier_type: supplier?.supplier_type ?? "distributor",
    contact_person: supplier?.contact_person ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    tax_number: supplier?.tax_number ?? "",
    payment_terms: supplier?.payment_terms != null ? String(supplier.payment_terms) : "30",
    credit_limit: supplier?.credit_limit != null ? String(parseNumber(supplier.credit_limit)) : "0",
    is_active: supplier?.is_active ?? true,
  };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SuppliersPage() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [inventoryStocks, setInventoryStocks] = useState<InventoryStockRow[]>([]);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<PurchaseOrderItemRow[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierTypeFilter, setSupplierTypeFilter] = useState("all");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [page, setPage] = useState(1);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [formState, setFormState] = useState<SupplierFormState>(createInitialFormState());

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

    const loadSupplierWorkspace = async () => {
      setLoading(true);
      setError("");
      setNotice("");

      const [suppliersResult, ordersResult, productsResult, stocksResult] = await Promise.all([
        supabase
          .from("suppliers")
          .select(
            "id, code, name, supplier_type, contact_person, phone, email, address, tax_number, payment_terms, credit_limit, current_balance, is_active, created_at"
          )
          .order("name", { ascending: true }),
        supabase
          .from("purchase_orders")
          .select(
            "id, po_number, supplier_id, branch_id, status, expected_date, received_date, supplier_invoice, invoice_image_url, total_amount, paid_amount, created_at"
          )
          .eq("branch_id", selectedBranchId)
          .neq("status", "draft")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false }),
        supabase
          .from("products")
          .select("id, name, sku, supplier_id, cost_price, selling_price, reorder_level, status")
          .order("name", { ascending: true }),
        supabase
          .from("inventory_stocks")
          .select("product_id, branch_id, quantity")
          .eq("branch_id", selectedBranchId),
      ]);

      if (!isMounted) return;

      if (suppliersResult.error || ordersResult.error || productsResult.error || stocksResult.error) {
        setError("Unable to load supplier records right now.");
        setLoading(false);
        return;
      }

      const supplierRows = (suppliersResult.data ?? []) as SupplierRow[];
      const orderRows = (ordersResult.data ?? []) as PurchaseOrderRow[];
      const productRows = (productsResult.data ?? []) as ProductRow[];
      const stockRows = (stocksResult.data ?? []) as InventoryStockRow[];
      const orderIds = orderRows.map((order) => order.id);

      const [paymentsResult, itemsResult] = await Promise.all([
        orderIds.length
          ? supabase
              .from("supplier_payments")
              .select("id, supplier_id, po_id, amount, payment_method, reference_no, paid_at, created_at")
              .in("po_id", orderIds)
              .order("paid_at", { ascending: false })
          : Promise.resolve({ data: [] as SupplierPaymentRow[], error: null }),
        orderIds.length
          ? supabase
              .from("purchase_order_items")
              .select("id, po_id, product_id, quantity, received_qty, unit_cost, notes")
              .in("po_id", orderIds)
          : Promise.resolve({ data: [] as PurchaseOrderItemRow[], error: null }),
      ]);

      if (!isMounted) return;

      if (paymentsResult.error || itemsResult.error) {
        setError("Unable to load supplier transactions right now.");
        setLoading(false);
        return;
      }

      setSuppliers(supplierRows);
      setPurchaseOrders(orderRows);
      setPayments((paymentsResult.data ?? []) as SupplierPaymentRow[]);
      setProducts(productRows);
      setInventoryStocks(stockRows);
      setPurchaseOrderItems((itemsResult.data ?? []) as PurchaseOrderItemRow[]);
      setLoading(false);
    };

    void loadSupplierWorkspace();

    return () => {
      isMounted = false;
    };
  }, [refreshKey, selectedBranchId]);

  const stockMap = useMemo(
    () => new Map(inventoryStocks.map((stock) => [stock.product_id, parseNumber(stock.quantity)])),
    [inventoryStocks]
  );

  const supplierSummaries = useMemo(() => {
    const currentMonth = getMonthRange(new Date());
    const currentYear = getYearRange(new Date());

    return suppliers.map((supplier) => {
      const supplierOrders = purchaseOrders.filter((order) => order.supplier_id === supplier.id);
      const supplierPayments = payments.filter((payment) => payment.supplier_id === supplier.id);
      const supplierProducts = products.filter((product) => product.supplier_id === supplier.id);
      const supplierOrderIds = new Set(supplierOrders.map((order) => order.id));
      const supplierItems = purchaseOrderItems.filter((item) => supplierOrderIds.has(item.po_id));

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

      const totalPaidValue = supplierPayments.reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
      const creditLimitValue = parseNumber(supplier.credit_limit);
      const storedBalanceValue = parseNumber(supplier.current_balance);
      const computedBalanceValue = balanceValue > 0 ? balanceValue : storedBalanceValue;
      const availableCreditValue = Math.max(creditLimitValue - computedBalanceValue, 0);

      const onTimeOrders = supplierOrders.filter((order) => order.expected_date && order.received_date);
      const onTimeDelivered = onTimeOrders.filter(
        (order) => new Date(order.received_date as string).getTime() <= new Date(order.expected_date as string).getTime()
      ).length;
      const onTimeRate = onTimeOrders.length ? (onTimeDelivered / onTimeOrders.length) * 100 : 0;

      const orderedUnits = supplierItems.reduce((sum, item) => sum + parseNumber(item.quantity), 0);
      const receivedUnits = supplierItems.reduce((sum, item) => sum + parseNumber(item.received_qty), 0);
      const fillRate = orderedUnits > 0 ? (receivedUnits / orderedUnits) * 100 : 0;

      const leadDays = supplierOrders
        .filter((order) => order.received_date)
        .map((order) => getDaysBetween(order.created_at, order.received_date as string));
      const averageLeadDays =
        leadDays.length > 0 ? leadDays.reduce((sum, value) => sum + value, 0) / leadDays.length : 0;

      const totalOrderValue = supplierOrders.reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
      const paymentCompletionRate = totalOrderValue > 0 ? (totalPaidValue / totalOrderValue) * 100 : 0;
      const performanceScore = Math.round(
        onTimeRate * 0.35 +
          fillRate * 0.35 +
          paymentCompletionRate * 0.15 +
          Math.max(0, 100 - (overdueBalanceValue > 0 && computedBalanceValue > 0 ? (overdueBalanceValue / computedBalanceValue) * 100 : 0)) *
            0.15
      );

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
        invoiceCount: supplierOrders.filter((order) => Boolean(order.supplier_invoice?.trim())).length,
        overdueBalanceValue,
        currentBalanceValue,
        aged31to60Value,
        aged61to90Value,
        aged90PlusValue,
        lastPurchaseAt,
        lastPaymentAt,
        productCount: supplierProducts.length,
        activeProductCount: supplierProducts.filter((product) => (product.status ?? "active") === "active").length,
        totalPaidValue,
        onTimeRate,
        fillRate,
        averageLeadDays,
        averageOrderValue: supplierOrders.length ? totalOrderValue / supplierOrders.length : 0,
        paymentCompletionRate,
        performanceScore,
        performanceLabel: getPerformanceLabel(performanceScore),
        statusLabel,
        statusTone,
      };
    });
  }, [payments, products, purchaseOrderItems, purchaseOrders, suppliers]);

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
          supplier.tax_number ?? "",
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
    filteredSuppliers.find((supplier) => supplier.id === selectedSupplierId) ??
    supplierSummaries.find((supplier) => supplier.id === selectedSupplierId) ??
    filteredSuppliers[0] ??
    null;

  const selectedSupplierOrders = useMemo(
    () =>
      selectedSupplier
        ? purchaseOrders.filter((order) => order.supplier_id === selectedSupplier.id)
        : [],
    [purchaseOrders, selectedSupplier]
  );

  const selectedSupplierPayments = useMemo(
    () =>
      selectedSupplier
        ? payments.filter((payment) => payment.supplier_id === selectedSupplier.id)
        : [],
    [payments, selectedSupplier]
  );

  const selectedSupplierProducts = useMemo(
    () =>
      selectedSupplier
        ? products.filter((product) => product.supplier_id === selectedSupplier.id)
        : [],
    [products, selectedSupplier]
  );

  const selectedSupplierItems = useMemo(() => {
    if (!selectedSupplier) return [];
    const supplierOrderIds = new Set(selectedSupplierOrders.map((order) => order.id));
    return purchaseOrderItems.filter((item) => supplierOrderIds.has(item.po_id));
  }, [purchaseOrderItems, selectedSupplier, selectedSupplierOrders]);

  const selectedSupplierActivities: ActivityItem[] = selectedSupplier
    ? [
        ...selectedSupplierOrders.slice(0, 5).map((order) => ({
          id: `po-${order.id}`,
          label: order.supplier_invoice?.trim() || order.po_number,
          meta: order.supplier_invoice?.trim() ? `Invoice linked to ${order.po_number}` : "Purchase Order",
          amount: parseNumber(order.total_amount),
          tone: "orange" as const,
          date: order.created_at,
        })),
        ...selectedSupplierPayments.slice(0, 5).map((payment) => ({
          id: `pay-${payment.id}`,
          label: payment.reference_no?.trim() || `PAY-${payment.id.slice(0, 6).toUpperCase()}`,
          meta: payment.payment_method?.replace(/_/g, " ") || "Supplier Payment",
          amount: parseNumber(payment.amount),
          tone: "green" as const,
          date: payment.paid_at,
        })),
      ]
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
        .slice(0, 6)
    : [];

  const totalSuppliers = supplierSummaries.length;
  const activeSuppliers = supplierSummaries.filter((supplier) => supplier.is_active).length;
  const totalPayables = supplierSummaries.reduce((sum, supplier) => sum + supplier.balanceValue, 0);
  const totalProducts = supplierSummaries.reduce((sum, supplier) => sum + supplier.productCount, 0);
  const openInvoices = purchaseOrders.filter(
    (order) => Math.max(parseNumber(order.total_amount) - parseNumber(order.paid_amount), 0) > 0
  ).length;

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

  const deliveredSuppliers = supplierSummaries.filter((supplier) => supplier.purchaseOrderCount > 0);
  const averageOnTimeRate =
    deliveredSuppliers.length > 0
      ? deliveredSuppliers.reduce((sum, supplier) => sum + supplier.onTimeRate, 0) / deliveredSuppliers.length
      : 0;
  const averageFillRate =
    deliveredSuppliers.length > 0
      ? deliveredSuppliers.reduce((sum, supplier) => sum + supplier.fillRate, 0) / deliveredSuppliers.length
      : 0;

  const overviewCards = [
    {
      label: "Total Suppliers",
      value: numberFormatter.format(totalSuppliers),
      subtext: `${activeSuppliers} active suppliers`,
      tone: "purple",
      icon: Truck,
    },
    {
      label: "Supplier Products",
      value: numberFormatter.format(totalProducts),
      subtext: "Assigned supplier SKUs",
      tone: "blue",
      icon: Package,
    },
    {
      label: "Total Payables",
      value: formatCurrency(totalPayables),
      subtext: `${openInvoices} open supplier invoices`,
      tone: "green",
      icon: CircleDollarSign,
    },
    {
      label: "On-Time Delivery",
      value: formatPercent(averageOnTimeRate),
      subtext: "Average across suppliers",
      tone: "blue",
      icon: CalendarDays,
    },
    {
      label: "Fill Rate",
      value: formatPercent(averageFillRate),
      subtext: "Ordered vs received",
      tone: "amber",
      icon: Percent,
    },
    {
      label: "90+ Day Exposure",
      value: formatCurrency(agingTotals["90+"]),
      subtext: "Most urgent overdue payables",
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

  const selectedSupplierTopProducts = useMemo(() => {
    const grouped = new Map<string, { productId: string; name: string; sku: string; orderedQty: number; receivedQty: number }>();

    selectedSupplierItems.forEach((item) => {
      const product = products.find((entry) => entry.id === item.product_id);
      if (!product) return;
      const existing = grouped.get(item.product_id) ?? {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        orderedQty: 0,
        receivedQty: 0,
      };
      existing.orderedQty += parseNumber(item.quantity);
      existing.receivedQty += parseNumber(item.received_qty);
      grouped.set(item.product_id, existing);
    });

    return Array.from(grouped.values()).sort((left, right) => right.orderedQty - left.orderedQty).slice(0, 5);
  }, [products, selectedSupplierItems]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedSuppliers = filteredSuppliers.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openCreateModal = () => {
    setModalMode("create");
    setFormState(createInitialFormState());
    setError("");
    setNotice("");
  };

  const openEditModal = () => {
    if (!selectedSupplier) return;
    setModalMode("edit");
    setFormState(createInitialFormState(selectedSupplier));
    setError("");
    setNotice("");
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
  };

  const handleFormField = (field: keyof SupplierFormState, value: string | boolean) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleSubmitSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modalMode) return;

    const name = formState.name.trim();
    if (!name) {
      setError("Supplier name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      code: (formState.code.trim() || buildSupplierCode(name)).toUpperCase(),
      name,
      supplier_type: formState.supplier_type,
      contact_person: formState.contact_person.trim() || null,
      phone: formState.phone.trim() || null,
      email: formState.email.trim() || null,
      address: formState.address.trim() || null,
      tax_number: formState.tax_number.trim() || null,
      payment_terms: Math.max(0, Number(formState.payment_terms || "0") || 0),
      credit_limit: Math.max(0, Number(formState.credit_limit || "0") || 0),
      is_active: formState.is_active,
    };

    const query =
      modalMode === "create"
        ? supabase
            .from("suppliers")
            .insert(payload)
            .select(
              "id, code, name, supplier_type, contact_person, phone, email, address, tax_number, payment_terms, credit_limit, current_balance, is_active, created_at"
            )
            .single()
        : supabase
            .from("suppliers")
            .update(payload)
            .eq("id", selectedSupplier?.id ?? "")
            .select(
              "id, code, name, supplier_type, contact_person, phone, email, address, tax_number, payment_terms, credit_limit, current_balance, is_active, created_at"
            )
            .single();

    const result = await query;

    if (result.error || !result.data) {
      setSaving(false);
      setError(result.error?.message || "Unable to save supplier right now.");
      return;
    }

    const supplier = result.data as SupplierRow;

    setSuppliers((current) => {
      if (modalMode === "create") {
        return [...current, supplier].sort((left, right) => left.name.localeCompare(right.name));
      }
      return current
        .map((entry) => (entry.id === supplier.id ? supplier : entry))
        .sort((left, right) => left.name.localeCompare(right.name));
    });
    setSelectedSupplierId(supplier.id);
    setModalMode(null);
    setSaving(false);
    setNotice(modalMode === "create" ? `Supplier ${supplier.name} added.` : `Supplier ${supplier.name} updated.`);
  };

  const exportSelectedSupplierStatement = () => {
    if (!selectedSupplier) return;

    const statementRows: Array<{
      date: string;
      type: string;
      reference: string;
      status: string;
      debit: number;
      credit: number;
    }> = [
      ...selectedSupplierOrders.map((order) => ({
        date: order.created_at,
        type: "Invoice",
        reference: order.supplier_invoice?.trim() || order.po_number,
        status: formatStatusLabel(order.status),
        debit: parseNumber(order.total_amount),
        credit: 0,
      })),
      ...selectedSupplierPayments.map((payment) => ({
        date: payment.paid_at,
        type: "Payment",
        reference: payment.reference_no?.trim() || `PAY-${payment.id.slice(0, 6).toUpperCase()}`,
        status: payment.payment_method?.replace(/_/g, " ") || "Recorded",
        debit: 0,
        credit: parseNumber(payment.amount),
      })),
    ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

    let runningBalance = 0;

    const rows = [
      ["Date", "Type", "Reference", "Status", "Debit", "Credit", "Running Balance"],
      ...statementRows.map((row) => {
        runningBalance += row.debit - row.credit;
        return [
          formatDate(row.date),
          row.type,
          row.reference,
          row.status,
          row.debit ? row.debit.toFixed(2) : "",
          row.credit ? row.credit.toFixed(2) : "",
          runningBalance.toFixed(2),
        ];
      }),
    ];

    downloadCsv(`${selectedSupplier.code}-statement.csv`, rows);
  };

  return (
    <div className="suppliers-page">
      {error ? <div className="suppliers-alert suppliers-alert--error">{error}</div> : null}
      {notice ? <div className="suppliers-alert suppliers-alert--success">{notice}</div> : null}

      <section className="suppliers-topbar">
        <div className="suppliers-topbar__copy">
          <span className="suppliers-topbar__eyebrow">Module 8</span>
          <h1>Supplier Management</h1>
          <p>Manage supplier profiles, payable exposure, invoices, linked products, and delivery performance from one workspace.</p>
        </div>

        <div className="suppliers-topbar__actions">
          <label className="suppliers-select suppliers-select--wide">
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.is_main ? " (Main)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          <button type="button" className="suppliers-button suppliers-button--outline" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCcw size={15} />
            <span>Refresh</span>
          </button>

          <button type="button" className="suppliers-button suppliers-button--primary" onClick={openCreateModal}>
            <Plus size={15} />
            <span>Add Supplier</span>
          </button>
        </div>
      </section>

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
                    placeholder="Search supplier name, code, contact, phone, email, or tax number..."
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
                <span>{filteredSuppliers.length} Records</span>
              </button>
            </div>

            <div className="suppliers-table-wrap">
              <table className="suppliers-table">
                <thead>
                  <tr>
                    <th>Supplier Code</th>
                    <th>Supplier Name</th>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Supplier Type</th>
                    <th>Products</th>
                    <th>Payable Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="suppliers-empty">
                        <LoaderCircle size={16} className="suppliers-spin" />
                        <span>Loading suppliers...</span>
                      </td>
                    </tr>
                  ) : paginatedSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="suppliers-empty">
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
                        <td>{supplier.phone?.trim() || "-"}</td>
                        <td>{formatSupplierType(supplier.supplier_type)}</td>
                        <td>{numberFormatter.format(supplier.productCount)}</td>
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
                            <button
                              type="button"
                              aria-label={`Edit ${supplier.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedSupplierId(supplier.id);
                                setTimeout(openEditModal, 0);
                              }}
                            >
                              <PencilLine size={14} />
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

          <article className="suppliers-panel">
            <div className="suppliers-panel__heading suppliers-panel__heading--workspace">
              <div className="suppliers-panel__heading-copy">
                <span className="suppliers-panel__eyebrow">Supplier Workspace</span>
                <h3>{selectedSupplier ? selectedSupplier.name : "Select a supplier"}</h3>
              </div>

              <div className="suppliers-detail-actions suppliers-detail-actions--compact">
                <button
                  type="button"
                  className="suppliers-button suppliers-button--outline"
                  onClick={openEditModal}
                  disabled={!selectedSupplier}
                >
                  <PencilLine size={15} />
                  <span>Edit Supplier</span>
                </button>
                <button
                  type="button"
                  className="suppliers-button suppliers-button--primary"
                  onClick={exportSelectedSupplierStatement}
                  disabled={!selectedSupplier}
                >
                  <ReceiptText size={15} />
                  <span>Export Statement</span>
                </button>
              </div>
            </div>

            {selectedSupplier ? (
              <>
                <div className="suppliers-tabs">
                  {detailTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={detailTab === tab.key ? "suppliers-tabs__button suppliers-tabs__button--active" : "suppliers-tabs__button"}
                      onClick={() => setDetailTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="suppliers-workspace">
                  {detailTab === "overview" ? (
                    <div className="suppliers-workspace__stack">
                      <div className="suppliers-quick-grid">
                        <article className="suppliers-quick-card">
                          <span>Contact Person</span>
                          <strong>{selectedSupplier.contact_person?.trim() || "No contact person"}</strong>
                          <small>Primary purchasing contact</small>
                        </article>
                        <article className="suppliers-quick-card">
                          <span>Payment Terms</span>
                          <strong>{selectedSupplier.payment_terms ?? 0} days</strong>
                          <small>Default supplier credit term</small>
                        </article>
                        <article className="suppliers-quick-card">
                          <span>Invoices on File</span>
                          <strong>{numberFormatter.format(selectedSupplier.invoiceCount)}</strong>
                          <small>Matched to purchase orders</small>
                        </article>
                        <article className="suppliers-quick-card">
                          <span>Available Credit</span>
                          <strong>{formatCurrency(selectedSupplier.availableCreditValue)}</strong>
                          <small>{formatCurrency(selectedSupplier.creditLimitValue)} limit</small>
                        </article>
                      </div>

                      <div className="suppliers-info-grid">
                        <article className="suppliers-subpanel">
                          <div className="suppliers-subpanel__heading">
                            <h4>Profile</h4>
                          </div>
                          <div className="suppliers-profile-list">
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
                              <Building2 size={15} />
                              <span>{selectedSupplier.tax_number?.trim() || "No tax / VAT number"}</span>
                            </div>
                            <div className="suppliers-details__item">
                              <BadgeCheck size={15} />
                              <span>{selectedSupplier.is_active ? "Active supplier" : "Inactive supplier"}</span>
                            </div>
                          </div>
                        </article>

                        <article className="suppliers-subpanel">
                          <div className="suppliers-subpanel__heading">
                            <h4>Recent Transactions</h4>
                          </div>
                          <div className="suppliers-activities">
                            {selectedSupplierActivities.length === 0 ? (
                              <div className="suppliers-empty suppliers-empty--stack">No transactions recorded yet.</div>
                            ) : (
                              selectedSupplierActivities.map((activity) => (
                                <div key={activity.id} className="suppliers-activities__row">
                                  <div className={`suppliers-activities__icon suppliers-activities__icon--${activity.tone}`}>
                                    {activity.meta.includes("Payment") ? <Wallet size={14} /> : <Truck size={14} />}
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
                        </article>
                      </div>
                    </div>
                  ) : null}

                  {detailTab === "products" ? (
                    <div className="suppliers-workspace__stack">
                      <div className="suppliers-inline-metrics">
                        <div className="suppliers-inline-metrics__item">
                          <span>Total Products</span>
                          <strong>{numberFormatter.format(selectedSupplier.productCount)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>Active Products</span>
                          <strong>{numberFormatter.format(selectedSupplier.activeProductCount)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>Branch Stock Value</span>
                          <strong>
                            {formatCurrency(
                              selectedSupplierProducts.reduce(
                                (sum, product) => sum + parseNumber(product.cost_price) * (stockMap.get(product.id) ?? 0),
                                0
                              )
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="suppliers-mini-table-wrap">
                        <table className="suppliers-mini-table">
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Product</th>
                              <th>Status</th>
                              <th>Cost</th>
                              <th>Sell Price</th>
                              <th>Branch Stock</th>
                              <th>Reorder Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSupplierProducts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="suppliers-empty suppliers-empty--stack">
                                  No products are assigned to this supplier yet.
                                </td>
                              </tr>
                            ) : (
                              selectedSupplierProducts.map((product) => (
                                <tr key={product.id}>
                                  <td className="suppliers-table__code">{product.sku}</td>
                                  <td>{product.name}</td>
                                  <td>
                                    <span className="suppliers-pill">{formatStatusLabel(product.status ?? "active")}</span>
                                  </td>
                                  <td>{formatCurrency(parseNumber(product.cost_price))}</td>
                                  <td>{formatCurrency(parseNumber(product.selling_price))}</td>
                                  <td>{numberFormatter.format(stockMap.get(product.id) ?? 0)}</td>
                                  <td>{numberFormatter.format(product.reorder_level ?? 0)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {detailTab === "history" ? (
                    <div className="suppliers-workspace__stack">
                      <div className="suppliers-inline-metrics">
                        <div className="suppliers-inline-metrics__item">
                          <span>Purchase Orders</span>
                          <strong>{numberFormatter.format(selectedSupplier.purchaseOrderCount)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>This Month</span>
                          <strong>{formatCurrency(selectedSupplier.totalPurchasesThisMonth)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>This Year</span>
                          <strong>{formatCurrency(selectedSupplier.totalPurchasesThisYear)}</strong>
                        </div>
                      </div>

                      <div className="suppliers-mini-table-wrap">
                        <table className="suppliers-mini-table">
                          <thead>
                            <tr>
                              <th>PO Number</th>
                              <th>Created</th>
                              <th>Expected</th>
                              <th>Received</th>
                              <th>Status</th>
                              <th>Total</th>
                              <th>Paid</th>
                              <th>Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSupplierOrders.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="suppliers-empty suppliers-empty--stack">
                                  No purchase history recorded for this supplier in the selected branch.
                                </td>
                              </tr>
                            ) : (
                              selectedSupplierOrders.map((order) => {
                                const balance = Math.max(parseNumber(order.total_amount) - parseNumber(order.paid_amount), 0);
                                return (
                                  <tr key={order.id}>
                                    <td className="suppliers-table__code">{order.po_number}</td>
                                    <td>{formatDate(order.created_at)}</td>
                                    <td>{formatDate(order.expected_date)}</td>
                                    <td>{formatDate(order.received_date)}</td>
                                    <td>
                                      <span className="suppliers-pill">{formatStatusLabel(order.status)}</span>
                                    </td>
                                    <td>{formatCurrency(parseNumber(order.total_amount))}</td>
                                    <td>{formatCurrency(parseNumber(order.paid_amount))}</td>
                                    <td>{formatCurrency(balance)}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {detailTab === "invoices" ? (
                    <div className="suppliers-workspace__stack">
                      <div className="suppliers-inline-metrics">
                        <div className="suppliers-inline-metrics__item">
                          <span>Supplier Invoices</span>
                          <strong>{numberFormatter.format(selectedSupplier.invoiceCount)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>Total Paid</span>
                          <strong>{formatCurrency(selectedSupplier.totalPaidValue)}</strong>
                        </div>
                        <div className="suppliers-inline-metrics__item">
                          <span>Outstanding</span>
                          <strong>{formatCurrency(selectedSupplier.balanceValue)}</strong>
                        </div>
                      </div>

                      <div className="suppliers-mini-table-wrap">
                        <table className="suppliers-mini-table">
                          <thead>
                            <tr>
                              <th>Invoice / Bill</th>
                              <th>PO Number</th>
                              <th>Issued</th>
                              <th>Status</th>
                              <th>Total</th>
                              <th>Paid</th>
                              <th>Balance</th>
                              <th>Attachment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedSupplierOrders.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="suppliers-empty suppliers-empty--stack">
                                  No supplier invoices or bills available yet.
                                </td>
                              </tr>
                            ) : (
                              selectedSupplierOrders.map((order) => {
                                const balance = Math.max(parseNumber(order.total_amount) - parseNumber(order.paid_amount), 0);
                                return (
                                  <tr key={order.id}>
                                    <td className="suppliers-table__code">{order.supplier_invoice?.trim() || order.po_number}</td>
                                    <td>{order.po_number}</td>
                                    <td>{formatDate(order.created_at)}</td>
                                    <td>
                                      <span className="suppliers-pill">{formatStatusLabel(order.status)}</span>
                                    </td>
                                    <td>{formatCurrency(parseNumber(order.total_amount))}</td>
                                    <td>{formatCurrency(parseNumber(order.paid_amount))}</td>
                                    <td>{formatCurrency(balance)}</td>
                                    <td>
                                      {order.invoice_image_url ? (
                                        <a className="suppliers-link" href={order.invoice_image_url} target="_blank" rel="noreferrer">
                                          View
                                        </a>
                                      ) : (
                                        "No file"
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {detailTab === "performance" ? (
                    <div className="suppliers-workspace__stack">
                      <div className="suppliers-kpi-grid">
                        <article className="suppliers-kpi">
                          <span>Performance Score</span>
                          <strong>{selectedSupplier.performanceScore}</strong>
                          <small>{selectedSupplier.performanceLabel}</small>
                        </article>
                        <article className="suppliers-kpi">
                          <span>On-Time Delivery</span>
                          <strong>{formatPercent(selectedSupplier.onTimeRate)}</strong>
                          <small>Expected vs received date</small>
                        </article>
                        <article className="suppliers-kpi">
                          <span>Fill Rate</span>
                          <strong>{formatPercent(selectedSupplier.fillRate)}</strong>
                          <small>Received quantity accuracy</small>
                        </article>
                        <article className="suppliers-kpi">
                          <span>Average Lead Time</span>
                          <strong>{selectedSupplier.averageLeadDays.toFixed(1)} days</strong>
                          <small>PO creation to receiving</small>
                        </article>
                      </div>

                      <div className="suppliers-info-grid">
                        <article className="suppliers-subpanel">
                          <div className="suppliers-subpanel__heading">
                            <h4>Performance Summary</h4>
                          </div>
                          <div className="suppliers-progress-list">
                            <div className="suppliers-progress">
                              <div className="suppliers-progress__copy">
                                <span>On-time delivery</span>
                                <strong>{formatPercent(selectedSupplier.onTimeRate)}</strong>
                              </div>
                              <div className="suppliers-progress__bar">
                                <div className="suppliers-progress__fill suppliers-progress__fill--blue" style={{ width: `${selectedSupplier.onTimeRate}%` }} />
                              </div>
                            </div>
                            <div className="suppliers-progress">
                              <div className="suppliers-progress__copy">
                                <span>Fill rate</span>
                                <strong>{formatPercent(selectedSupplier.fillRate)}</strong>
                              </div>
                              <div className="suppliers-progress__bar">
                                <div className="suppliers-progress__fill suppliers-progress__fill--green" style={{ width: `${selectedSupplier.fillRate}%` }} />
                              </div>
                            </div>
                            <div className="suppliers-progress">
                              <div className="suppliers-progress__copy">
                                <span>Payment completion</span>
                                <strong>{formatPercent(selectedSupplier.paymentCompletionRate)}</strong>
                              </div>
                              <div className="suppliers-progress__bar">
                                <div
                                  className="suppliers-progress__fill suppliers-progress__fill--amber"
                                  style={{ width: `${Math.min(selectedSupplier.paymentCompletionRate, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </article>

                        <article className="suppliers-subpanel">
                          <div className="suppliers-subpanel__heading">
                            <h4>Top Ordered Products</h4>
                          </div>
                          <div className="suppliers-meta-list">
                            {selectedSupplierTopProducts.length === 0 ? (
                              <div className="suppliers-empty suppliers-empty--stack">No product demand data available yet.</div>
                            ) : (
                              selectedSupplierTopProducts.map((product) => (
                                <div key={product.productId} className="suppliers-meta-list__row">
                                  <div>
                                    <strong>{product.name}</strong>
                                    <span>{product.sku}</span>
                                  </div>
                                  <div>
                                    <strong>{numberFormatter.format(product.orderedQty)} ordered</strong>
                                    <span>{numberFormatter.format(product.receivedQty)} received</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="suppliers-empty suppliers-empty--stack">Select a supplier to view details.</div>
            )}
          </article>
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

                <div className="suppliers-details__stats">
                  <div className="suppliers-side-stat">
                    <span>Current Balance</span>
                    <strong>{formatCurrency(selectedSupplier.balanceValue)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Overdue Balance</span>
                    <strong>{formatCurrency(selectedSupplier.overdueBalanceValue)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Purchase Orders</span>
                    <strong>{numberFormatter.format(selectedSupplier.purchaseOrderCount)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Last Purchase</span>
                    <strong>{formatDate(selectedSupplier.lastPurchaseAt)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Last Payment</span>
                    <strong>{formatDate(selectedSupplier.lastPaymentAt)}</strong>
                  </div>
                  <div className="suppliers-side-stat">
                    <span>Supplier Since</span>
                    <strong>{formatDate(selectedSupplier.created_at)}</strong>
                  </div>
                </div>

                <div className="suppliers-summary">
                  <div className="suppliers-summary__row">
                    <span>Email</span>
                    <strong>{selectedSupplier.email?.trim() || "-"}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Phone</span>
                    <strong>{selectedSupplier.phone?.trim() || "-"}</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Payment Terms</span>
                    <strong>{selectedSupplier.payment_terms ?? 0} days</strong>
                  </div>
                  <div className="suppliers-summary__row">
                    <span>Tax / VAT</span>
                    <strong>{selectedSupplier.tax_number?.trim() || "-"}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="suppliers-empty suppliers-empty--stack">Select a supplier to view details.</div>
            )}
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
                      <span>
                        {index + 1}. {supplier.name}
                      </span>
                      <strong>{formatCurrency(supplier.balance)}</strong>
                      <span>{supplier.share.toFixed(1)}%</span>
                    </button>
                  ))
                )}
              </div>
            </article>
          </div>
        </aside>
      </section>

      <section className="suppliers-footer-banner">
        <div className="suppliers-footer-banner__copy">
          <div className="suppliers-footer-banner__icon">
            <CircleDollarSign size={18} />
          </div>
          <div>
            <strong>Supplier management is now tied to purchasing, invoices, product assignments, and live payable exposure.</strong>
            <p>Use the workspace tabs to review catalog coverage, invoice history, and delivery performance before placing your next order.</p>
          </div>
        </div>

        <button
          type="button"
          className="suppliers-button suppliers-button--outline"
          onClick={() => {
            setDetailTab("performance");
            if (!selectedSupplierId && filteredSuppliers[0]) setSelectedSupplierId(filteredSuppliers[0].id);
          }}
        >
          <ArrowUpRight size={15} />
          Performance View
        </button>
      </section>

      {modalMode ? (
        <div className="suppliers-modal" onClick={closeModal}>
          <div className="suppliers-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="suppliers-modal__header">
              <div>
                <span className="suppliers-modal__eyebrow">{modalMode === "create" ? "New Supplier" : "Edit Supplier"}</span>
                <h2>{modalMode === "create" ? "Create supplier profile" : `Update ${selectedSupplier?.name ?? "supplier"}`}</h2>
              </div>
              <button type="button" className="suppliers-modal__close" onClick={closeModal} aria-label="Close supplier form">
                <X size={16} />
              </button>
            </div>

            <form className="suppliers-form" onSubmit={handleSubmitSupplier}>
              <label>
                <span>Supplier Code</span>
                <input
                  value={formState.code}
                  onChange={(event) => handleFormField("code", event.target.value.toUpperCase())}
                  placeholder="Auto-generated if blank"
                />
              </label>

              <label>
                <span>Supplier Name</span>
                <input value={formState.name} onChange={(event) => handleFormField("name", event.target.value)} required />
              </label>

              <label>
                <span>Supplier Type</span>
                <select value={formState.supplier_type} onChange={(event) => handleFormField("supplier_type", event.target.value)}>
                  {supplierTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Contact Person</span>
                <input
                  value={formState.contact_person}
                  onChange={(event) => handleFormField("contact_person", event.target.value)}
                  placeholder="Primary contact"
                />
              </label>

              <label>
                <span>Phone Number</span>
                <input value={formState.phone} onChange={(event) => handleFormField("phone", event.target.value)} />
              </label>

              <label>
                <span>Email</span>
                <input type="email" value={formState.email} onChange={(event) => handleFormField("email", event.target.value)} />
              </label>

              <label>
                <span>Tax / VAT Number</span>
                <input value={formState.tax_number} onChange={(event) => handleFormField("tax_number", event.target.value)} />
              </label>

              <label>
                <span>Payment Terms (days)</span>
                <input
                  type="number"
                  min="0"
                  value={formState.payment_terms}
                  onChange={(event) => handleFormField("payment_terms", event.target.value)}
                />
              </label>

              <label>
                <span>Credit Limit</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.credit_limit}
                  onChange={(event) => handleFormField("credit_limit", event.target.value)}
                />
              </label>

              <label className="suppliers-form__full">
                <span>Address</span>
                <textarea value={formState.address} onChange={(event) => handleFormField("address", event.target.value)} rows={3} />
              </label>

              <label className="suppliers-form__checkbox">
                <input
                  type="checkbox"
                  checked={formState.is_active}
                  onChange={(event) => handleFormField("is_active", event.target.checked)}
                />
                <span>Supplier is active</span>
              </label>

              <div className="suppliers-form__actions">
                <button type="button" className="suppliers-button suppliers-button--outline" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="suppliers-button suppliers-button--primary" disabled={saving}>
                  {saving ? "Saving..." : modalMode === "create" ? "Create Supplier" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

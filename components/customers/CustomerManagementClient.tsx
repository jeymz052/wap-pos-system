"use client";

import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CarFront,
  CreditCard,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRound,
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
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  branch_id?: string | null;
};

type CustomerType = "retail" | "wholesale" | "mechanic" | "reseller" | "walk_in";

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  customer_type?: CustomerType | null;
  phone?: string | null;
  contact_number?: string | null;
  email?: string | null;
  address?: string | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  loyalty_points?: number | null;
  salesperson_id?: string | null;
  branch_id?: string | null;
  is_active?: boolean | null;
  allow_credit?: boolean | null;
  default_credit_terms_days?: number | null;
  credit_alert_days?: number | null;
  notes?: string | null;
  last_purchase_at?: string | null;
  total_purchases_amount?: string | number | null;
  total_purchases_count?: number | null;
  created_at: string;
};

type SaleRow = {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  branch_id: string;
  total_amount: string | number;
  amount_paid?: string | number | null;
  status?: string | null;
  created_at: string;
};

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
  status?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ReceivablePaymentRow = {
  id: string;
  receivable_id: string;
  amount: string | number;
  payment_method?: string | null;
  reference_no?: string | null;
  paid_at: string;
  notes?: string | null;
};

type VehicleRow = {
  id: string;
  customer_id: string;
  motorcycle_model_id?: string | null;
  label?: string | null;
  make?: string | null;
  model_name?: string | null;
  plate_number?: string | null;
  year_model?: number | null;
  color?: string | null;
  engine_number?: string | null;
  chassis_number?: string | null;
  odometer_km?: number | null;
  notes?: string | null;
  is_primary?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

type WarrantyRow = {
  id: string;
  customer_id: string;
  sale_id?: string | null;
  sale_item_id?: string | null;
  product_id: string;
  vehicle_id?: string | null;
  warranty_number: string;
  serial_number?: string | null;
  purchase_date: string;
  start_date: string;
  expiry_date?: string | null;
  status: string;
  coverage_notes?: string | null;
  notes?: string | null;
  created_at: string;
};

type MotorcycleModelRow = {
  id: string;
  brand: string;
  model_name: string;
  engine_type?: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  warranty_period_days?: number | null;
};

type DetailTab = "overview" | "vehicles" | "warranties" | "credit" | "history";
type CustomerModalMode = "create" | "edit";

type CustomerFormState = {
  code: string;
  name: string;
  customer_type: CustomerType;
  phone: string;
  contact_number: string;
  email: string;
  address: string;
  credit_limit: string;
  loyalty_points: string;
  allow_credit: boolean;
  default_credit_terms_days: string;
  credit_alert_days: string;
  notes: string;
  salesperson_id: string;
  is_active: boolean;
};

type VehicleFormState = {
  label: string;
  make: string;
  model_name: string;
  motorcycle_model_id: string;
  plate_number: string;
  year_model: string;
  color: string;
  engine_number: string;
  chassis_number: string;
  odometer_km: string;
  notes: string;
  is_primary: boolean;
};

type WarrantyFormState = {
  product_id: string;
  vehicle_id: string;
  serial_number: string;
  purchase_date: string;
  start_date: string;
  expiry_date: string;
  status: string;
  coverage_notes: string;
  notes: string;
};

const customerTypeOptions: Array<{ value: CustomerType; label: string }> = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "mechanic", label: "Mechanic" },
  { value: "reseller", label: "Reseller" },
  { value: "walk_in", label: "Walk-in" },
];

const detailTabs: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "vehicles", label: "Vehicles" },
  { key: "warranties", label: "Warranties" },
  { key: "credit", label: "Credit" },
  { key: "history", label: "History" },
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

function buildCustomerCode(name: string) {
  const prefix = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("")
    .slice(0, 6);
  return `${prefix || "CUS"}-${Date.now().toString().slice(-6)}`;
}

function buildWarrantyNumber(customerCode: string) {
  return `WAR-${customerCode}-${Date.now().toString().slice(-6)}`;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function createCustomerFormState(customer?: CustomerRow | null): CustomerFormState {
  return {
    code: customer?.code ?? "",
    name: customer?.name ?? "",
    customer_type: customer?.customer_type ?? "retail",
    phone: customer?.phone ?? "",
    contact_number: customer?.contact_number ?? customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    credit_limit: customer?.credit_limit != null ? String(parseNumber(customer.credit_limit)) : "0",
    loyalty_points: customer?.loyalty_points != null ? String(customer.loyalty_points) : "0",
    allow_credit: customer?.allow_credit ?? true,
    default_credit_terms_days: String(customer?.default_credit_terms_days ?? 30),
    credit_alert_days: String(customer?.credit_alert_days ?? 3),
    notes: customer?.notes ?? "",
    salesperson_id: customer?.salesperson_id ?? "",
    is_active: customer?.is_active ?? true,
  };
}

function createVehicleFormState(): VehicleFormState {
  return {
    label: "",
    make: "",
    model_name: "",
    motorcycle_model_id: "",
    plate_number: "",
    year_model: "",
    color: "",
    engine_number: "",
    chassis_number: "",
    odometer_km: "",
    notes: "",
    is_primary: false,
  };
}

function createWarrantyFormState(): WarrantyFormState {
  const today = todayInputValue();
  return {
    product_id: "",
    vehicle_id: "",
    serial_number: "",
    purchase_date: today,
    start_date: today,
    expiry_date: "",
    status: "active",
    coverage_notes: "",
    notes: "",
  };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
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

export default function CustomerManagementClient() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [payments, setPayments] = useState<ReceivablePaymentRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRow[]>([]);
  const [motorcycleModels, setMotorcycleModels] = useState<MotorcycleModelRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [customerModalMode, setCustomerModalMode] = useState<CustomerModalMode | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createCustomerFormState());
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>(createVehicleFormState());
  const [warrantyForm, setWarrantyForm] = useState<WarrantyFormState>(createWarrantyFormState());
  const [todayStamp] = useState(() => Date.now());

  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setLoading(true);
      setError("");

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        if (isMounted) {
          setError("Please sign in to manage customers.");
          setLoading(false);
        }
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

      const profile = (profileResult.data as { branch_id?: string | null } | null) ?? null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
      const defaultBranch =
        branchRows.find((branch) => branch.id === savedBranchId) ??
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
    const handleBranchChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) {
        setSelectedBranchId(detail.id);
      }
    };

    const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
    if (savedBranchId) {
      setSelectedBranchId((current) => current || savedBranchId);
    }

    window.addEventListener("branch-changed", handleBranchChanged);
    return () => window.removeEventListener("branch-changed", handleBranchChanged);
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let isMounted = true;

    const loadWorkspace = async () => {
      setLoading(true);
      setError("");

      const [
        customersResult,
        usersResult,
        salesResult,
        receivablesResult,
        vehiclesResult,
        warrantiesResult,
        motorcycleModelsResult,
        productsResult,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, code, name, customer_type, phone, contact_number, email, address, credit_limit, current_balance, loyalty_points, salesperson_id, branch_id, is_active, allow_credit, default_credit_terms_days, credit_alert_days, notes, last_purchase_at, total_purchases_amount, total_purchases_count, created_at")
          .eq("branch_id", selectedBranchId)
          .order("name", { ascending: true }),
        supabase
          .from("users")
          .select("id, first_name, last_name, username, email, branch_id")
          .order("first_name", { ascending: true }),
        supabase
          .from("sales")
          .select("id, invoice_number, customer_id, branch_id, total_amount, amount_paid, status, created_at")
          .eq("branch_id", selectedBranchId)
          .eq("status", "completed")
          .order("created_at", { ascending: false }),
        supabase
          .from("receivables")
          .select("id, invoice_number, customer_id, sale_id, branch_id, total_amount, paid_amount, balance, due_date, status, notes, created_at, updated_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_vehicles")
          .select("id, customer_id, motorcycle_model_id, label, make, model_name, plate_number, year_model, color, engine_number, chassis_number, odometer_km, notes, is_primary, created_at, updated_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_warranty_records")
          .select("id, customer_id, sale_id, sale_item_id, product_id, vehicle_id, warranty_number, serial_number, purchase_date, start_date, expiry_date, status, coverage_notes, notes, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("motorcycle_models")
          .select("id, brand, model_name, engine_type, year_from, year_to")
          .eq("is_active", true)
          .order("brand", { ascending: true })
          .order("model_name", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, sku, warranty_period_days")
          .order("name", { ascending: true }),
      ]);

      if (!isMounted) return;

      if (
        customersResult.error ||
        usersResult.error ||
        salesResult.error ||
        receivablesResult.error ||
        vehiclesResult.error ||
        warrantiesResult.error ||
        motorcycleModelsResult.error ||
        productsResult.error
      ) {
        setError(
          customersResult.error?.message ||
            usersResult.error?.message ||
            salesResult.error?.message ||
            receivablesResult.error?.message ||
            vehiclesResult.error?.message ||
            warrantiesResult.error?.message ||
            motorcycleModelsResult.error?.message ||
            productsResult.error?.message ||
            "Unable to load customer workspace."
        );
        setLoading(false);
        return;
      }

      const receivableRows = (receivablesResult.data ?? []) as ReceivableRow[];
      const receivableIds = receivableRows.map((item) => item.id);
      const paymentsResult = receivableIds.length
        ? await supabase
            .from("receivable_payments")
            .select("id, receivable_id, amount, payment_method, reference_no, paid_at, notes")
            .in("receivable_id", receivableIds)
            .order("paid_at", { ascending: false })
        : { data: [], error: null };

      if (!isMounted) return;

      if (paymentsResult.error) {
        setError(paymentsResult.error.message);
        setLoading(false);
        return;
      }

      setCustomers((customersResult.data ?? []) as CustomerRow[]);
      setUsers((usersResult.data ?? []) as UserRow[]);
      setSales((salesResult.data ?? []) as SaleRow[]);
      setReceivables(receivableRows);
      setPayments((paymentsResult.data ?? []) as ReceivablePaymentRow[]);
      setVehicles((vehiclesResult.data ?? []) as VehicleRow[]);
      setWarranties((warrantiesResult.data ?? []) as WarrantyRow[]);
      setMotorcycleModels((motorcycleModelsResult.data ?? []) as MotorcycleModelRow[]);
      setProducts((productsResult.data ?? []) as ProductRow[]);
      setLoading(false);
    };

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, [refreshKey, selectedBranchId]);

  const customerVehiclesMap = new Map<string, VehicleRow[]>();
  vehicles.forEach((vehicle) => {
    const list = customerVehiclesMap.get(vehicle.customer_id) ?? [];
    list.push(vehicle);
    customerVehiclesMap.set(vehicle.customer_id, list);
  });

  const customerWarrantyMap = new Map<string, WarrantyRow[]>();
  warranties.forEach((warranty) => {
    const list = customerWarrantyMap.get(warranty.customer_id) ?? [];
    list.push(warranty);
    customerWarrantyMap.set(warranty.customer_id, list);
  });

  const customerSalesMap = new Map<string, SaleRow[]>();
  sales.forEach((sale) => {
    if (!sale.customer_id) return;
    const list = customerSalesMap.get(sale.customer_id) ?? [];
    list.push(sale);
    customerSalesMap.set(sale.customer_id, list);
  });

  const customerReceivablesMap = new Map<string, ReceivableRow[]>();
  receivables.forEach((receivable) => {
    const list = customerReceivablesMap.get(receivable.customer_id) ?? [];
    list.push(receivable);
    customerReceivablesMap.set(receivable.customer_id, list);
  });

  const receivableMap = new Map(receivables.map((receivable) => [receivable.id, receivable]));
  const customerPaymentsMap = new Map<string, ReceivablePaymentRow[]>();
  payments.forEach((payment) => {
    const receivable = receivableMap.get(payment.receivable_id);
    if (!receivable) return;
    const list = customerPaymentsMap.get(receivable.customer_id) ?? [];
    list.push(payment);
    customerPaymentsMap.set(receivable.customer_id, list);
  });

  const userMap = new Map(users.map((user) => [user.id, user]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const motorcycleModelMap = new Map(motorcycleModels.map((model) => [model.id, model]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  const customerSummaries = customers.map((customer) => {
    const customerSales = customerSalesMap.get(customer.id) ?? [];
    const customerReceivables = customerReceivablesMap.get(customer.id) ?? [];
    const customerVehicles = customerVehiclesMap.get(customer.id) ?? [];
    const customerWarranties = customerWarrantyMap.get(customer.id) ?? [];
    const openReceivables = customerReceivables.filter((receivable) => parseNumber(receivable.balance) > 0);
    const overdueReceivables = openReceivables.filter(
      (receivable) => receivable.due_date && new Date(receivable.due_date).getTime() < todayStamp
    );
    const dueSoonReceivables = openReceivables.filter((receivable) => {
      if (!receivable.due_date) return false;
      const diffDays = Math.ceil((new Date(receivable.due_date).getTime() - todayStamp) / 86400000);
      return diffDays >= 0 && diffDays <= Number(customer.credit_alert_days ?? 3);
    });
    const balanceValue = openReceivables.reduce((sum, receivable) => sum + parseNumber(receivable.balance), 0);
    const creditLimitValue = parseNumber(customer.credit_limit);
    const lifetimeSales = customerSales.reduce((sum, sale) => sum + parseNumber(sale.total_amount), 0);

    return {
      ...customer,
      balanceValue,
      creditLimitValue,
      availableCreditValue: Math.max(0, creditLimitValue - balanceValue),
      overdueCount: overdueReceivables.length,
      dueSoonCount: dueSoonReceivables.length,
      vehicleCount: customerVehicles.length,
      warrantyCount: customerWarranties.length,
      totalInvoices: customerSales.length,
      lifetimeSalesValue: lifetimeSales || parseNumber(customer.total_purchases_amount),
      salespersonName: formatUserName(customer.salesperson_id ? userMap.get(customer.salesperson_id) : null),
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
        customer.contact_number,
        customer.email,
        customer.address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchNeedle));

    if (!matchesSearch) return false;
    if (statusFilter === "active" && !customer.is_active) return false;
    if (statusFilter === "inactive" && customer.is_active) return false;
    if (statusFilter === "overdue" && customer.overdueCount === 0) return false;
    if (typeFilter !== "all" && customer.customer_type !== typeFilter) return false;
    return true;
  });

  const effectiveSelectedCustomerId = filteredCustomers.some((customer) => customer.id === selectedCustomerId)
    ? selectedCustomerId
    : filteredCustomers[0]?.id ?? customerSummaries[0]?.id ?? "";

  const selectedCustomer = customerSummaries.find((customer) => customer.id === effectiveSelectedCustomerId) ?? null;
  const selectedCustomerVehicles = selectedCustomer ? customerVehiclesMap.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerWarranties = selectedCustomer ? customerWarrantyMap.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerSales = selectedCustomer ? customerSalesMap.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerReceivables = selectedCustomer ? customerReceivablesMap.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerPayments = selectedCustomer ? customerPaymentsMap.get(selectedCustomer.id) ?? [] : [];
  const selectedCustomerAlerts = selectedCustomerReceivables.filter((receivable) => {
    if (!receivable.due_date || parseNumber(receivable.balance) <= 0) return false;
    const diffDays = Math.ceil((new Date(receivable.due_date).getTime() - todayStamp) / 86400000);
    return diffDays < 0 || diffDays <= Number(selectedCustomer?.credit_alert_days ?? 3);
  });

  const totalCustomers = customerSummaries.length;
  const activeCustomers = customerSummaries.filter((customer) => customer.is_active).length;
  const customersWithCredit = customerSummaries.filter((customer) => customer.creditLimitValue > 0 || customer.balanceValue > 0).length;
  const totalOutstanding = customerSummaries.reduce((sum, customer) => sum + customer.balanceValue, 0);
  const totalCreditLimit = customerSummaries.reduce((sum, customer) => sum + customer.creditLimitValue, 0);
  const totalVehicles = vehicles.length;
  const totalWarranties = warranties.length;

  const openCustomerModal = (mode: CustomerModalMode) => {
    setCustomerModalMode(mode);
    setCustomerForm(createCustomerFormState(mode === "edit" ? selectedCustomer : null));
  };

  const closeCustomerModal = () => {
    setCustomerModalMode(null);
    setCustomerForm(createCustomerFormState());
  };

  const refreshWorkspace = () => {
    setRefreshKey((current) => current + 1);
  };

  const handleSaveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      code: customerForm.code.trim() || buildCustomerCode(customerForm.name),
      name: customerForm.name.trim(),
      customer_type: customerForm.customer_type,
      phone: customerForm.phone.trim() || null,
      contact_number: customerForm.contact_number.trim() || customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null,
      address: customerForm.address.trim() || null,
      credit_limit: parseNumber(customerForm.credit_limit),
      loyalty_points: Math.max(0, Math.round(parseNumber(customerForm.loyalty_points))),
      allow_credit: customerForm.allow_credit,
      default_credit_terms_days: Math.max(1, Math.round(parseNumber(customerForm.default_credit_terms_days))),
      credit_alert_days: Math.max(0, Math.round(parseNumber(customerForm.credit_alert_days))),
      notes: customerForm.notes.trim() || null,
      salesperson_id: customerForm.salesperson_id || null,
      is_active: customerForm.is_active,
      branch_id: selectedBranchId,
    };

    if (!payload.name) {
      setSaving(false);
      setError("Customer name is required.");
      return;
    }

    const result =
      customerModalMode === "edit" && selectedCustomer
        ? await supabase.from("customers").update(payload).eq("id", selectedCustomer.id)
        : await supabase.from("customers").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    closeCustomerModal();
    setNotice(customerModalMode === "edit" ? "Customer updated." : "Customer created.");
    refreshWorkspace();
  };

  const handleAddVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer) {
      setError("Select a customer first.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      customer_id: selectedCustomer.id,
      label: vehicleForm.label.trim() || null,
      make: vehicleForm.make.trim() || null,
      model_name: vehicleForm.model_name.trim() || null,
      motorcycle_model_id: vehicleForm.motorcycle_model_id || null,
      plate_number: vehicleForm.plate_number.trim() || null,
      year_model: vehicleForm.year_model ? Math.round(parseNumber(vehicleForm.year_model)) : null,
      color: vehicleForm.color.trim() || null,
      engine_number: vehicleForm.engine_number.trim() || null,
      chassis_number: vehicleForm.chassis_number.trim() || null,
      odometer_km: vehicleForm.odometer_km ? Math.round(parseNumber(vehicleForm.odometer_km)) : null,
      notes: vehicleForm.notes.trim() || null,
      is_primary: vehicleForm.is_primary,
    };

    const result = await supabase.from("customer_vehicles").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setVehicleForm(createVehicleFormState());
    setNotice("Vehicle saved.");
    refreshWorkspace();
  };

  const handleAddWarranty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer) {
      setError("Select a customer first.");
      return;
    }

    if (!warrantyForm.product_id) {
      setError("Select a product to record warranty coverage.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      customer_id: selectedCustomer.id,
      product_id: warrantyForm.product_id,
      vehicle_id: warrantyForm.vehicle_id || null,
      warranty_number: buildWarrantyNumber(selectedCustomer.code),
      serial_number: warrantyForm.serial_number.trim() || null,
      purchase_date: warrantyForm.purchase_date,
      start_date: warrantyForm.start_date,
      expiry_date: warrantyForm.expiry_date || null,
      status: warrantyForm.status.trim() || "active",
      coverage_notes: warrantyForm.coverage_notes.trim() || null,
      notes: warrantyForm.notes.trim() || null,
    };

    const result = await supabase.from("customer_warranty_records").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setWarrantyForm(createWarrantyFormState());
    setNotice("Warranty record created.");
    refreshWorkspace();
  };

  const buildStatementRows = () => {
    if (!selectedCustomer) return null;

    const statementRows = [
      ...selectedCustomerReceivables.map((receivable) => ({
        date: receivable.created_at,
        reference: receivable.invoice_number,
        type: "Invoice",
        debit: parseNumber(receivable.total_amount),
        credit: 0,
        dueDate: receivable.due_date ?? "",
        status: receivable.status ?? "",
      })),
      ...selectedCustomerPayments.map((payment) => {
        const receivable = receivableMap.get(payment.receivable_id);
        return {
          date: payment.paid_at,
          reference: payment.reference_no?.trim() || receivable?.invoice_number || payment.id,
          type: "Payment",
          debit: 0,
          credit: parseNumber(payment.amount),
          dueDate: receivable?.due_date ?? "",
          status: receivable?.status ?? "",
        };
      }),
    ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

    let runningBalance = 0;
    return [
      ["Customer Code", selectedCustomer.code],
      ["Customer Name", selectedCustomer.name],
      ["Customer Type", formatCustomerType(selectedCustomer.customer_type)],
      ["Statement Date", formatDate(new Date().toISOString())],
      [],
      ["Date", "Reference", "Type", "Debit", "Credit", "Running Balance", "Due Date", "Status"],
      ...statementRows.map((row) => {
        runningBalance += row.debit - row.credit;
        return [
          formatDate(row.date),
          row.reference,
          row.type,
          row.debit ? row.debit.toFixed(2) : "",
          row.credit ? row.credit.toFixed(2) : "",
          runningBalance.toFixed(2),
          row.dueDate ? formatDate(row.dueDate) : "",
          row.status,
        ];
      }),
    ];
  };

  const exportStatement = () => {
    if (!selectedCustomer) return;
    const rows = buildStatementRows();
    if (!rows) return;

    downloadCsv(`${selectedCustomer.code}-statement-of-account.csv`, rows);
  };

  const printStatement = () => {
    if (!selectedCustomer) return;
    const rows = buildStatementRows();
    if (!rows) return;

    const detailRows = rows.slice(5);
    const printableRows = detailRows
      .map((row) => `
        <tr>
          <td>${row[0]}</td>
          <td>${row[1]}</td>
          <td>${row[2]}</td>
          <td style="text-align:right">${row[3]}</td>
          <td style="text-align:right">${row[4]}</td>
          <td style="text-align:right">${row[5]}</td>
          <td>${row[6]}</td>
          <td>${row[7]}</td>
        </tr>
      `)
      .join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Statement of Account - ${selectedCustomer.code}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; }
            p { margin: 0 0 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: .04em; }
          </style>
        </head>
        <body>
          <h1>Statement of Account</h1>
          <p><strong>Customer Code:</strong> ${selectedCustomer.code}</p>
          <p><strong>Customer Name:</strong> ${selectedCustomer.name}</p>
          <p><strong>Customer Type:</strong> ${formatCustomerType(selectedCustomer.customer_type)}</p>
          <p><strong>Statement Date:</strong> ${formatDate(new Date().toISOString())}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Running Balance</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${printableRows || '<tr><td colspan="8">No statement rows found.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading && !customers.length && !selectedBranchId) {
    return (
      <div className="customer-mgmt customer-mgmt--state">
        <div className="customer-mgmt__state-card">
          <LoaderCircle size={18} className="customer-mgmt__spin" />
          <span>Loading customer management workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-mgmt">
      {error ? <div className="customer-mgmt__alert customer-mgmt__alert--error">{error}</div> : null}
      {notice ? <div className="customer-mgmt__alert customer-mgmt__alert--success">{notice}</div> : null}

      <section className="customer-mgmt__stats">
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--blue"><UserRound size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Customers</div>
            <div className="customer-mgmt__stat-value">{numberFormatter.format(totalCustomers)}</div>
            <div className="customer-mgmt__stat-copy">{numberFormatter.format(activeCustomers)} active accounts</div>
          </div>
        </article>
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--green"><CreditCard size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Credit Accounts</div>
            <div className="customer-mgmt__stat-value">{numberFormatter.format(customersWithCredit)}</div>
            <div className="customer-mgmt__stat-copy">{formatCurrency(totalOutstanding)} receivables</div>
          </div>
        </article>
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--amber"><Wallet size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Credit Limit</div>
            <div className="customer-mgmt__stat-value">{formatCurrency(totalCreditLimit)}</div>
            <div className="customer-mgmt__stat-copy">{formatCurrency(Math.max(0, totalCreditLimit - totalOutstanding))} available</div>
          </div>
        </article>
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--red"><AlertTriangle size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Overdue Alerts</div>
            <div className="customer-mgmt__stat-value">
              {numberFormatter.format(customerSummaries.filter((customer) => customer.overdueCount > 0).length)}
            </div>
            <div className="customer-mgmt__stat-copy">Due and overdue customers</div>
          </div>
        </article>
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--violet"><CarFront size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Vehicles</div>
            <div className="customer-mgmt__stat-value">{numberFormatter.format(totalVehicles)}</div>
            <div className="customer-mgmt__stat-copy">Linked units on file</div>
          </div>
        </article>
        <article className="customer-mgmt__stat">
          <div className="customer-mgmt__stat-icon customer-mgmt__stat-icon--teal"><ShieldCheck size={18} /></div>
          <div>
            <div className="customer-mgmt__stat-label">Warranties</div>
            <div className="customer-mgmt__stat-value">{numberFormatter.format(totalWarranties)}</div>
            <div className="customer-mgmt__stat-copy">Customer warranty records</div>
          </div>
        </article>
      </section>

      <section className="customer-mgmt__toolbar">
        <label className="customer-mgmt__search">
          <Search size={15} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customer, phone, address, or code..."
          />
        </label>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="customer-mgmt__select">
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="inactive">Inactive</option>
        </select>

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="customer-mgmt__select">
          <option value="all">All types</option>
          {customerTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <button type="button" className="customer-mgmt__button customer-mgmt__button--primary" onClick={() => openCustomerModal("create")}>
          <Plus size={15} />
          <span>New customer</span>
        </button>
      </section>

      <section className="customer-mgmt__layout">
        <article className="customer-mgmt__panel customer-mgmt__panel--list">
          <div className="customer-mgmt__panel-head">
            <div>
              <h2>Customer Directory</h2>
              <p>{numberFormatter.format(filteredCustomers.length)} matching records</p>
            </div>
          </div>

          <div className="customer-mgmt__list">
            {loading ? (
              <div className="customer-mgmt__empty">
                <LoaderCircle size={16} className="customer-mgmt__spin" />
                <span>Refreshing customers...</span>
              </div>
            ) : null}

            {!loading && !filteredCustomers.length ? (
              <div className="customer-mgmt__empty">No customers matched the current filters.</div>
            ) : null}

            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`customer-mgmt__list-item ${effectiveSelectedCustomerId === customer.id ? "customer-mgmt__list-item--active" : ""}`}
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <div className="customer-mgmt__list-top">
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{customer.code}</span>
                  </div>
                  <span className={`customer-mgmt__badge ${customer.overdueCount > 0 ? "customer-mgmt__badge--red" : customer.is_active ? "customer-mgmt__badge--green" : "customer-mgmt__badge--slate"}`}>
                    {!customer.is_active ? "Inactive" : customer.overdueCount > 0 ? "Overdue" : "Active"}
                  </span>
                </div>
                <div className="customer-mgmt__list-copy">
                  <span>{formatCustomerType(customer.customer_type)}</span>
                  <span>{customer.contact_number || customer.phone || "-"}</span>
                </div>
                <div className="customer-mgmt__list-metrics">
                  <span>Outstanding {formatCurrency(customer.balanceValue)}</span>
                  <span>Available {formatCurrency(customer.availableCreditValue)}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="customer-mgmt__panel customer-mgmt__panel--detail">
          {!selectedCustomer ? (
            <div className="customer-mgmt__empty customer-mgmt__empty--tall">Select a customer to view profile, credit, and warranty details.</div>
          ) : (
            <>
              <div className="customer-mgmt__panel-head customer-mgmt__panel-head--detail">
                <div>
                  <h2>{selectedCustomer.name}</h2>
                  <p>
                    {selectedCustomer.code} · {formatCustomerType(selectedCustomer.customer_type)} ·
                    {" "}{selectedCustomer.salespersonName}
                  </p>
                </div>
                <div className="customer-mgmt__actions">
                  <button type="button" className="customer-mgmt__button" onClick={exportStatement}>
                    <FileSpreadsheet size={15} />
                    <span>Statement</span>
                  </button>
                  <button type="button" className="customer-mgmt__button" onClick={printStatement}>
                    <Printer size={15} />
                    <span>Print SOA</span>
                  </button>
                  <button type="button" className="customer-mgmt__button" onClick={() => openCustomerModal("edit")}>
                    <ReceiptText size={15} />
                    <span>Edit</span>
                  </button>
                </div>
              </div>

              <div className="customer-mgmt__mini-stats">
                <div>
                  <span>Credit limit</span>
                  <strong>{formatCurrency(selectedCustomer.creditLimitValue)}</strong>
                </div>
                <div>
                  <span>Outstanding</span>
                  <strong>{formatCurrency(selectedCustomer.balanceValue)}</strong>
                </div>
                <div>
                  <span>Available</span>
                  <strong>{formatCurrency(selectedCustomer.availableCreditValue)}</strong>
                </div>
                <div>
                  <span>Loyalty points</span>
                  <strong>{numberFormatter.format(selectedCustomer.loyalty_points ?? 0)}</strong>
                </div>
              </div>

              {selectedCustomerAlerts.length ? (
                <div className="customer-mgmt__due-alerts">
                  <AlertTriangle size={16} />
                  <span>{selectedCustomerAlerts.length} receivable(s) need follow-up for this customer.</span>
                </div>
              ) : null}

              <div className="customer-mgmt__tabs">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={detailTab === tab.key ? "customer-mgmt__tab customer-mgmt__tab--active" : "customer-mgmt__tab"}
                    onClick={() => setDetailTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {detailTab === "overview" ? (
                <div className="customer-mgmt__grid">
                  <section className="customer-mgmt__card">
                    <h3>Profile</h3>
                    <dl className="customer-mgmt__definition-list">
                      <div><dt>Contact number</dt><dd>{selectedCustomer.contact_number || selectedCustomer.phone || "-"}</dd></div>
                      <div><dt>Email</dt><dd>{selectedCustomer.email || "-"}</dd></div>
                      <div><dt>Address</dt><dd>{selectedCustomer.address || "-"}</dd></div>
                      <div><dt>Credit terms</dt><dd>{selectedCustomer.default_credit_terms_days ?? 30} days</dd></div>
                      <div><dt>Credit status</dt><dd>{selectedCustomer.allow_credit ? "Allowed" : "Blocked"}</dd></div>
                      <div><dt>Notes</dt><dd>{selectedCustomer.notes || "-"}</dd></div>
                    </dl>
                  </section>

                  <section className="customer-mgmt__card">
                    <h3>Purchase Summary</h3>
                    <dl className="customer-mgmt__definition-list">
                      <div><dt>Total sales</dt><dd>{formatCurrency(selectedCustomer.lifetimeSalesValue)}</dd></div>
                      <div><dt>Invoices</dt><dd>{numberFormatter.format(selectedCustomer.totalInvoices)}</dd></div>
                      <div><dt>Last purchase</dt><dd>{formatDate(selectedCustomer.last_purchase_at)}</dd></div>
                      <div><dt>Vehicles</dt><dd>{numberFormatter.format(selectedCustomer.vehicleCount)}</dd></div>
                      <div><dt>Warranty records</dt><dd>{numberFormatter.format(selectedCustomer.warrantyCount)}</dd></div>
                      <div><dt>Due alerts</dt><dd>{numberFormatter.format(selectedCustomer.dueSoonCount + selectedCustomer.overdueCount)}</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}

              {detailTab === "vehicles" ? (
                <div className="customer-mgmt__stack">
                  <section className="customer-mgmt__card">
                    <h3>Add vehicle</h3>
                    <form className="customer-mgmt__form" onSubmit={handleAddVehicle}>
                      <input value={vehicleForm.label} onChange={(event) => setVehicleForm((current) => ({ ...current, label: event.target.value }))} placeholder="Vehicle label" />
                      <input value={vehicleForm.make} onChange={(event) => setVehicleForm((current) => ({ ...current, make: event.target.value }))} placeholder="Make / brand" />
                      <input value={vehicleForm.model_name} onChange={(event) => setVehicleForm((current) => ({ ...current, model_name: event.target.value }))} placeholder="Model" />
                      <select value={vehicleForm.motorcycle_model_id} onChange={(event) => setVehicleForm((current) => ({ ...current, motorcycle_model_id: event.target.value }))}>
                        <option value="">Linked model (optional)</option>
                        {motorcycleModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.brand} {model.model_name}
                          </option>
                        ))}
                      </select>
                      <input value={vehicleForm.plate_number} onChange={(event) => setVehicleForm((current) => ({ ...current, plate_number: event.target.value }))} placeholder="Plate number" />
                      <input value={vehicleForm.year_model} onChange={(event) => setVehicleForm((current) => ({ ...current, year_model: event.target.value }))} placeholder="Year model" type="number" />
                      <input value={vehicleForm.color} onChange={(event) => setVehicleForm((current) => ({ ...current, color: event.target.value }))} placeholder="Color" />
                      <input value={vehicleForm.engine_number} onChange={(event) => setVehicleForm((current) => ({ ...current, engine_number: event.target.value }))} placeholder="Engine number" />
                      <input value={vehicleForm.chassis_number} onChange={(event) => setVehicleForm((current) => ({ ...current, chassis_number: event.target.value }))} placeholder="Chassis number" />
                      <input value={vehicleForm.odometer_km} onChange={(event) => setVehicleForm((current) => ({ ...current, odometer_km: event.target.value }))} placeholder="Odometer KM" type="number" />
                      <textarea value={vehicleForm.notes} onChange={(event) => setVehicleForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Vehicle notes" />
                      <label className="customer-mgmt__checkbox">
                        <input type="checkbox" checked={vehicleForm.is_primary} onChange={(event) => setVehicleForm((current) => ({ ...current, is_primary: event.target.checked }))} />
                        <span>Primary vehicle</span>
                      </label>
                      <button type="submit" className="customer-mgmt__button customer-mgmt__button--primary" disabled={saving}>
                        {saving ? "Saving..." : "Save vehicle"}
                      </button>
                    </form>
                  </section>

                  <section className="customer-mgmt__card">
                    <h3>Vehicle list</h3>
                    <div className="customer-mgmt__table-wrap">
                      <table className="customer-mgmt__table">
                        <thead>
                          <tr>
                            <th>Vehicle</th>
                            <th>Plate</th>
                            <th>Details</th>
                            <th>Primary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!selectedCustomerVehicles.length ? (
                            <tr><td colSpan={4} className="customer-mgmt__empty">No vehicles on file.</td></tr>
                          ) : null}
                          {selectedCustomerVehicles.map((vehicle) => {
                            const linkedModel = vehicle.motorcycle_model_id ? motorcycleModelMap.get(vehicle.motorcycle_model_id) : null;
                            return (
                              <tr key={vehicle.id}>
                                <td>{vehicle.label || `${vehicle.make || ""} ${vehicle.model_name || ""}`.trim() || "-"}</td>
                                <td>{vehicle.plate_number || "-"}</td>
                                <td>{linkedModel ? `${linkedModel.brand} ${linkedModel.model_name}` : vehicle.engine_number || vehicle.chassis_number || "-"}</td>
                                <td>{vehicle.is_primary ? "Yes" : "No"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : null}

              {detailTab === "warranties" ? (
                <div className="customer-mgmt__stack">
                  <section className="customer-mgmt__card">
                    <h3>Add warranty record</h3>
                    <form className="customer-mgmt__form" onSubmit={handleAddWarranty}>
                      <select value={warrantyForm.product_id} onChange={(event) => setWarrantyForm((current) => ({ ...current, product_id: event.target.value }))}>
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                        ))}
                      </select>
                      <select value={warrantyForm.vehicle_id} onChange={(event) => setWarrantyForm((current) => ({ ...current, vehicle_id: event.target.value }))}>
                        <option value="">Select vehicle (optional)</option>
                        {selectedCustomerVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.label || vehicle.plate_number || `${vehicle.make || ""} ${vehicle.model_name || ""}`.trim() || vehicle.id}
                          </option>
                        ))}
                      </select>
                      <input value={warrantyForm.serial_number} onChange={(event) => setWarrantyForm((current) => ({ ...current, serial_number: event.target.value }))} placeholder="Serial number" />
                      <input type="date" value={warrantyForm.purchase_date} onChange={(event) => setWarrantyForm((current) => ({ ...current, purchase_date: event.target.value }))} />
                      <input type="date" value={warrantyForm.start_date} onChange={(event) => setWarrantyForm((current) => ({ ...current, start_date: event.target.value }))} />
                      <input type="date" value={warrantyForm.expiry_date} onChange={(event) => setWarrantyForm((current) => ({ ...current, expiry_date: event.target.value }))} />
                      <input value={warrantyForm.status} onChange={(event) => setWarrantyForm((current) => ({ ...current, status: event.target.value }))} placeholder="Status" />
                      <textarea value={warrantyForm.coverage_notes} onChange={(event) => setWarrantyForm((current) => ({ ...current, coverage_notes: event.target.value }))} placeholder="Coverage notes" />
                      <textarea value={warrantyForm.notes} onChange={(event) => setWarrantyForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes" />
                      <button type="submit" className="customer-mgmt__button customer-mgmt__button--primary" disabled={saving}>
                        {saving ? "Saving..." : "Save warranty"}
                      </button>
                    </form>
                  </section>

                  <section className="customer-mgmt__card">
                    <h3>Warranty records</h3>
                    <div className="customer-mgmt__table-wrap">
                      <table className="customer-mgmt__table">
                        <thead>
                          <tr>
                            <th>Warranty #</th>
                            <th>Product</th>
                            <th>Vehicle</th>
                            <th>Expiry</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!selectedCustomerWarranties.length ? (
                            <tr><td colSpan={5} className="customer-mgmt__empty">No warranty records yet.</td></tr>
                          ) : null}
                          {selectedCustomerWarranties.map((warranty) => (
                            <tr key={warranty.id}>
                              <td>{warranty.warranty_number}</td>
                              <td>{productMap.get(warranty.product_id)?.name || warranty.product_id}</td>
                              <td>{warranty.vehicle_id ? vehicleMap.get(warranty.vehicle_id)?.label || vehicleMap.get(warranty.vehicle_id)?.plate_number || warranty.vehicle_id : "-"}</td>
                              <td>{formatDate(warranty.expiry_date)}</td>
                              <td>{warranty.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : null}

              {detailTab === "credit" ? (
                <div className="customer-mgmt__stack">
                  <section className="customer-mgmt__card">
                    <h3>Open receivables</h3>
                    <div className="customer-mgmt__table-wrap">
                      <table className="customer-mgmt__table">
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Due date</th>
                            <th>Total</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!selectedCustomerReceivables.length ? (
                            <tr><td colSpan={6} className="customer-mgmt__empty">No receivables for this customer.</td></tr>
                          ) : null}
                          {selectedCustomerReceivables.map((receivable) => (
                            <tr key={receivable.id}>
                              <td>{receivable.invoice_number}</td>
                              <td>{formatDate(receivable.due_date)}</td>
                              <td>{formatCurrency(parseNumber(receivable.total_amount))}</td>
                              <td>{formatCurrency(parseNumber(receivable.paid_amount))}</td>
                              <td>{formatCurrency(parseNumber(receivable.balance))}</td>
                              <td>{receivable.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="customer-mgmt__card">
                    <h3>Payment history</h3>
                    <div className="customer-mgmt__table-wrap">
                      <table className="customer-mgmt__table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Reference</th>
                            <th>Method</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!selectedCustomerPayments.length ? (
                            <tr><td colSpan={4} className="customer-mgmt__empty">No payments recorded yet.</td></tr>
                          ) : null}
                          {selectedCustomerPayments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{formatDate(payment.paid_at)}</td>
                              <td>{payment.reference_no || receivableMap.get(payment.receivable_id)?.invoice_number || payment.id}</td>
                              <td>{formatCustomerType(payment.payment_method)}</td>
                              <td>{formatCurrency(parseNumber(payment.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : null}

              {detailTab === "history" ? (
                <section className="customer-mgmt__card">
                  <h3>Purchase history</h3>
                  <div className="customer-mgmt__table-wrap">
                    <table className="customer-mgmt__table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Collected</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!selectedCustomerSales.length ? (
                          <tr><td colSpan={5} className="customer-mgmt__empty">No completed sales yet.</td></tr>
                        ) : null}
                        {selectedCustomerSales.map((sale) => {
                          const creditSale = selectedCustomerReceivables.find((receivable) => receivable.sale_id === sale.id);
                          return (
                            <tr key={sale.id}>
                              <td>{sale.invoice_number}</td>
                              <td>{formatDate(sale.created_at)}</td>
                              <td>{formatCurrency(parseNumber(sale.total_amount))}</td>
                              <td>{formatCurrency(parseNumber(sale.amount_paid))}</td>
                              <td>{creditSale ? "Credit / Partial" : "Regular"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </article>
      </section>

      {customerModalMode ? (
        <div className="customer-mgmt__modal-backdrop" onClick={closeCustomerModal}>
          <div className="customer-mgmt__modal" onClick={(event) => event.stopPropagation()}>
            <div className="customer-mgmt__modal-head">
              <div>
                <h3>{customerModalMode === "edit" ? "Edit customer" : "Create customer"}</h3>
                <p>Manage profile, credit rules, and loyalty information.</p>
              </div>
              <button type="button" className="customer-mgmt__icon-button" onClick={closeCustomerModal}>
                <X size={18} />
              </button>
            </div>

            <form className="customer-mgmt__form customer-mgmt__form--modal" onSubmit={handleSaveCustomer}>
              <input value={customerForm.code} onChange={(event) => setCustomerForm((current) => ({ ...current, code: event.target.value }))} placeholder="Customer code (optional)" />
              <input value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customer name" />
              <select value={customerForm.customer_type} onChange={(event) => setCustomerForm((current) => ({ ...current, customer_type: event.target.value as CustomerType }))}>
                {customerTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
              <input value={customerForm.contact_number} onChange={(event) => setCustomerForm((current) => ({ ...current, contact_number: event.target.value }))} placeholder="Contact number" />
              <input value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
              <textarea value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
              <input type="number" value={customerForm.credit_limit} onChange={(event) => setCustomerForm((current) => ({ ...current, credit_limit: event.target.value }))} placeholder="Credit limit" />
              <input type="number" value={customerForm.loyalty_points} onChange={(event) => setCustomerForm((current) => ({ ...current, loyalty_points: event.target.value }))} placeholder="Loyalty points" />
              <input type="number" value={customerForm.default_credit_terms_days} onChange={(event) => setCustomerForm((current) => ({ ...current, default_credit_terms_days: event.target.value }))} placeholder="Credit terms days" />
              <input type="number" value={customerForm.credit_alert_days} onChange={(event) => setCustomerForm((current) => ({ ...current, credit_alert_days: event.target.value }))} placeholder="Alert days before due" />
              <select value={customerForm.salesperson_id} onChange={(event) => setCustomerForm((current) => ({ ...current, salesperson_id: event.target.value }))}>
                <option value="">Salesperson</option>
                {users
                  .filter((user) => !user.branch_id || user.branch_id === selectedBranchId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>{formatUserName(user)}</option>
                  ))}
              </select>
              <textarea value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
              <label className="customer-mgmt__checkbox">
                <input type="checkbox" checked={customerForm.allow_credit} onChange={(event) => setCustomerForm((current) => ({ ...current, allow_credit: event.target.checked }))} />
                <span>Allow customer credit</span>
              </label>
              <label className="customer-mgmt__checkbox">
                <input type="checkbox" checked={customerForm.is_active} onChange={(event) => setCustomerForm((current) => ({ ...current, is_active: event.target.checked }))} />
                <span>Active account</span>
              </label>
              <div className="customer-mgmt__modal-actions">
                <button type="button" className="customer-mgmt__button" onClick={closeCustomerModal}>Cancel</button>
                <button type="submit" className="customer-mgmt__button customer-mgmt__button--primary" disabled={saving}>
                  {saving ? "Saving..." : customerModalMode === "edit" ? "Save changes" : "Create customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

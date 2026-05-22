"use client";

import { useDeferredValue, useEffect, useState, startTransition, type ChangeEvent } from "react";
import {
  BadgeCheck,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  FileImage,
  FileText,
  Filter,
  PackageCheck,
  PackageOpen,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Warehouse,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Branch = {
  id: string;
  name: string;
  is_main: boolean;
};

type Supplier = {
  id: string;
  code: string;
  name: string;
  payment_terms: number | null;
  current_balance: number | string | null;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  supplier_id: string | null;
  cost_price: number | string;
  reorder_level: number | null;
  critical_stock_level: number | null;
  status: string;
};

type LowStockRow = {
  product_id: string;
  product_name: string;
  sku: string;
  branch_id: string;
  current_stock: number;
  reorder_level: number | null;
  critical_stock_level: number | null;
  stock_status: string;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  branch_id: string;
  status: string;
  expected_date: string | null;
  received_date: string | null;
  supplier_invoice: string | null;
  invoice_image_url: string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  tax_amount: number | string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type PurchaseOrderItemRow = {
  id: string;
  po_id: string;
  product_id: string;
  quantity: number;
  received_qty: number | null;
  unit_cost: number | string;
  notes: string | null;
};

type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  po_id: string | null;
  amount: number | string;
};

type UserProfile = {
  id: string;
  branch_id: string | null;
};

type FormItem = {
  lineId: string;
  poItemId?: string;
  productId: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
  notes: string;
};

type AlertState = {
  type: "success" | "error";
  text: string;
} | null;

const statusTabs = [
  "all",
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partially_received",
  "fully_received",
  "cancelled",
] as const;

const workflow = [
  {
    title: "Create PO",
    text: "Create new purchase order and send to supplier",
    icon: FileText,
    color: "blue",
  },
  {
    title: "Pending Approval",
    text: "Waiting for supplier confirmation or approval",
    icon: Clock3,
    color: "orange",
  },
  {
    title: "Receive Items",
    text: "Receive items fully or partially and verify quantity",
    icon: PackageCheck,
    color: "purple",
  },
  {
    title: "Completed",
    text: "PO is fully received, invoiced, and closed",
    icon: CheckCircle2,
    color: "green",
  },
  {
    title: "Return / Adjust",
    text: "Return damaged items or make adjustments",
    icon: BellRing,
    color: "red",
  },
];

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace("PHP", "PHP ");
}

function parseNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toInputDate(dateValue?: string | null) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateValue?: string | null) {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(status: string) {
  switch (status) {
    case "draft":
      return "purchase-status purchase-status--draft";
    case "pending_approval":
      return "purchase-status purchase-status--pending";
    case "approved":
      return "purchase-status purchase-status--approved";
    case "ordered":
      return "purchase-status purchase-status--ordered";
    case "partially_received":
      return "purchase-status purchase-status--partial";
    case "fully_received":
      return "purchase-status purchase-status--received";
    case "cancelled":
      return "purchase-status purchase-status--cancelled";
    default:
      return "purchase-status";
  }
}

function buildPoNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
  const random = Math.floor(Math.random() * 90 + 10);
  return `PO-${stamp}${random}`;
}

function createEmptyFormItem(product?: Product): FormItem {
  return {
    lineId: `${product?.id ?? "line"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product?.id ?? "",
    quantity: 1,
    receivedQty: 0,
    unitCost: parseNumber(product?.cost_price ?? 0),
    notes: "",
  };
}

export default function PurchasingClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [profileUserId, setProfileUserId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, PurchaseOrderItemRow[]>>({});
  const [paymentsByPo, setPaymentsByPo] = useState<Record<string, number>>({});
  const [selectedTab, setSelectedTab] = useState<(typeof statusTabs)[number]>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilterId, setSupplierFilterId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catalogProductId, setCatalogProductId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [poDate, setPoDate] = useState(toInputDate(new Date().toISOString()));
  const [expectedDate, setExpectedDate] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, number>>({});
  const [receiveBatchInputs, setReceiveBatchInputs] = useState<Record<string, string>>({});
  const [receiveExpiryInputs, setReceiveExpiryInputs] = useState<Record<string, string>>({});
  const [receiveSerialInputs, setReceiveSerialInputs] = useState<Record<string, string>>({});
  const [receiveDamagedInputs, setReceiveDamagedInputs] = useState<Record<string, number>>({});
  const [receiveReturnedInputs, setReceiveReturnedInputs] = useState<Record<string, number>>({});
  const deferredSearch = useDeferredValue(searchTerm);

  async function getAccessToken() {
    const sessionResult = await supabase.auth.getSession();
    return sessionResult.data.session?.access_token ?? "";
  }

  async function loadInitialContext() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAlert({ type: "error", text: "No authenticated user found. Please sign in again." });
      setLoading(false);
      return;
    }

    const [branchesResult, profileResult, suppliersResult, productsResult] = await Promise.all([
      supabase.from("branches").select("id, name, is_main").eq("is_active", true).order("is_main", { ascending: false }),
      supabase.from("users").select("id, branch_id").eq("auth_id", user.id).maybeSingle(),
      supabase.from("suppliers").select("id, code, name, payment_terms, current_balance, is_active").eq("is_active", true).order("name"),
      supabase.from("products").select("id, name, sku, supplier_id, cost_price, reorder_level, critical_stock_level, status").eq("status", "active").order("name"),
    ]);

    if (branchesResult.error || profileResult.error || suppliersResult.error || productsResult.error) {
      setAlert({ type: "error", text: "Unable to load purchasing setup data from Supabase." });
      setLoading(false);
      return;
    }

    const branchRows = (branchesResult.data ?? []) as Branch[];
    const profile = profileResult.data as UserProfile | null;
    const initialBranchId =
      profile?.branch_id ??
      branchRows.find((branch) => branch.is_main)?.id ??
      branchRows[0]?.id ??
      "";

    setProfileUserId(profile?.id ?? "");
    setBranches(branchRows);
    setSuppliers((suppliersResult.data ?? []) as Supplier[]);
    setProducts((productsResult.data ?? []) as Product[]);
    setSelectedBranchId(initialBranchId);
    setLoading(false);
  }

  async function loadPurchasingData(branchId: string) {
    if (!branchId) return;

    setLoading(true);

    const ordersResult = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });

    const lowStockResult = await supabase
      .from("v_low_stock")
      .select("product_id, product_name, sku, branch_id, current_stock, reorder_level, critical_stock_level, stock_status")
      .eq("branch_id", branchId)
      .in("stock_status", ["low_stock", "critical", "out_of_stock"])
      .order("current_stock", { ascending: true });

    if (ordersResult.error || lowStockResult.error) {
      setAlert({ type: "error", text: "Unable to load purchase orders and stock suggestions." });
      setLoading(false);
      return;
    }

    const orderRows = (ordersResult.data ?? []) as PurchaseOrderRow[];
    const poIds = orderRows.map((order) => order.id);

    const [itemsResult, paymentsResult] = await Promise.all([
      poIds.length
        ? supabase.from("purchase_order_items").select("id, po_id, product_id, quantity, received_qty, unit_cost, notes").in("po_id", poIds)
        : Promise.resolve({ data: [], error: null }),
      poIds.length
        ? supabase.from("supplier_payments").select("id, supplier_id, po_id, amount").in("po_id", poIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (itemsResult.error || paymentsResult.error) {
      setAlert({ type: "error", text: "Unable to load PO line items and supplier payments." });
      setLoading(false);
      return;
    }

    const groupedItems: Record<string, PurchaseOrderItemRow[]> = {};
    ((itemsResult.data ?? []) as PurchaseOrderItemRow[]).forEach((item) => {
      groupedItems[item.po_id] = [...(groupedItems[item.po_id] ?? []), item];
    });

    const paymentSummary: Record<string, number> = {};
    ((paymentsResult.data ?? []) as SupplierPaymentRow[]).forEach((payment) => {
      if (!payment.po_id) return;
      paymentSummary[payment.po_id] = (paymentSummary[payment.po_id] ?? 0) + parseNumber(payment.amount);
    });

    setOrders(orderRows);
    setOrderItems(groupedItems);
    setPaymentsByPo(paymentSummary);
    setLowStock((lowStockResult.data ?? []) as LowStockRow[]);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await loadInitialContext();
      if (cancelled) return;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let cancelled = false;

    const run = async () => {
      await loadPurchasingData(selectedBranchId);
      if (cancelled) return;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedOrderId) {
      resetForm();
      return;
    }

    const selectedOrder = orders.find((order) => order.id === selectedOrderId);
    if (!selectedOrder) return;

    const selectedItems = (orderItems[selectedOrder.id] ?? []).map((item) => ({
      lineId: item.id,
      poItemId: item.id,
      productId: item.product_id,
      quantity: item.quantity,
      receivedQty: item.received_qty ?? 0,
      unitCost: parseNumber(item.unit_cost),
      notes: item.notes ?? "",
    }));

    const nextReceiveInputs: Record<string, number> = {};
    selectedItems.forEach((item) => {
      if (item.poItemId) nextReceiveInputs[item.poItemId] = 0;
    });

    startTransition(() => {
      setSupplierId(selectedOrder.supplier_id);
      setPoDate(toInputDate(selectedOrder.created_at));
      setExpectedDate(toInputDate(selectedOrder.expected_date));
      setReferenceNote(selectedOrder.notes ?? "");
      setSupplierInvoice(selectedOrder.supplier_invoice ?? "");
      setAttachmentName(selectedOrder.invoice_image_url?.replace(/^attachment:/, "") ?? "");
      setFormItems(selectedItems);
      setReceiveInputs(nextReceiveInputs);
      setReceiveBatchInputs({});
      setReceiveExpiryInputs({});
      setReceiveSerialInputs({});
      setReceiveDamagedInputs({});
      setReceiveReturnedInputs({});
    });
  }, [selectedOrderId, orders, orderItems]);

  function resetForm() {
    setSelectedOrderId("");
    setSupplierId("");
    setPoDate(toInputDate(new Date().toISOString()));
    setExpectedDate("");
    setReferenceNote("");
    setSupplierInvoice("");
    setAttachmentName("");
    setCatalogProductId("");
    setFormItems([]);
    setReceiveInputs({});
    setReceiveBatchInputs({});
    setReceiveExpiryInputs({});
    setReceiveSerialInputs({});
    setReceiveDamagedInputs({});
    setReceiveReturnedInputs({});
  }

  function getProductById(productId: string) {
    return products.find((product) => product.id === productId);
  }

  function getSupplierById(id: string) {
    return suppliers.find((supplier) => supplier.id === id);
  }

  function getItemsForOrder(orderId: string) {
    return orderItems[orderId] ?? [];
  }

  const visibleOrders = orders.filter((order) => {
    const search = deferredSearch.trim().toLowerCase();
    const supplierName = getSupplierById(order.supplier_id)?.name?.toLowerCase() ?? "";
    const tabMatch = selectedTab === "all" ? true : order.status === selectedTab;
    const supplierMatch = supplierFilterId === "all" ? true : order.supplier_id === supplierFilterId;
    const statusMatch = statusFilter === "all" ? true : order.status === statusFilter;
    const searchMatch =
      search.length === 0 ||
      order.po_number.toLowerCase().includes(search) ||
      supplierName.includes(search) ||
      getItemsForOrder(order.id).some((item) => {
        const product = getProductById(item.product_id);
        return `${product?.name ?? ""} ${product?.sku ?? ""}`.toLowerCase().includes(search);
      });

    return tabMatch && supplierMatch && statusMatch && searchMatch;
  });

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedSupplier = getSupplierById(supplierId);
  const filteredLowStock = lowStock.filter((item) => {
    if (!supplierId) return true;
    const product = getProductById(item.product_id);
    return product?.supplier_id === supplierId;
  });

  const today = new Date();
  const currentMonthOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt.getMonth() === today.getMonth() && createdAt.getFullYear() === today.getFullYear();
  });

  const totalPurchasesThisMonth = currentMonthOrders.reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
  const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt.getMonth() === previousMonthDate.getMonth() && createdAt.getFullYear() === previousMonthDate.getFullYear();
  });
  const previousTotalPurchases = previousMonthOrders.reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
  const totalPosThisMonth = currentMonthOrders.length;
  const previousMonthPos = previousMonthOrders.length;
  const pendingOrders = orders.filter((order) => order.status === "pending_approval");
  const pendingExpectedAmount = pendingOrders.reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
  const receivedThisMonthOrders = orders.filter((order) => {
    if (!order.received_date) return false;
    const receivedDate = new Date(order.received_date);
    return receivedDate.getMonth() === today.getMonth() && receivedDate.getFullYear() === today.getFullYear();
  });
  const receivedThisMonthAmount = receivedThisMonthOrders.reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
  const receivedRatio = totalPurchasesThisMonth > 0 ? (receivedThisMonthAmount / totalPurchasesThisMonth) * 100 : 0;
  const purchaseGrowth =
    previousTotalPurchases > 0 ? ((totalPurchasesThisMonth - previousTotalPurchases) / previousTotalPurchases) * 100 : 0;
  const poGrowth = previousMonthPos > 0 ? ((totalPosThisMonth - previousMonthPos) / previousMonthPos) * 100 : 0;

  const topSuppliers = suppliers
    .map((supplier) => {
      const total = orders
        .filter((order) => order.supplier_id === supplier.id)
        .reduce((sum, order) => sum + parseNumber(order.total_amount), 0);
      return { name: supplier.name, amount: total };
    })
    .filter((supplier) => supplier.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);

  const recentPurchases = [...orders].slice(0, 5);
  const subtotal = formItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const taxAmount = subtotal * 0.12;
  const totalAmount = subtotal + taxAmount;
  const paidAmount = selectedOrder ? parseNumber(selectedOrder.paid_amount) + (paymentsByPo[selectedOrder.id] ?? 0) : 0;
  const balanceAmount = Math.max(totalAmount - paidAmount, 0);
  const canEditSelectedOrder = selectedOrder ? !["fully_received", "cancelled"].includes(selectedOrder.status) : true;
  const canApprove = selectedOrder?.status === "pending_approval";
  const canMarkOrdered = selectedOrder?.status === "approved";
  const canReceive = selectedOrder ? ["approved", "ordered", "partially_received"].includes(selectedOrder.status) : false;

  function setFormMessage(nextAlert: AlertState) {
    setAlert(nextAlert);
    if (nextAlert) {
      window.setTimeout(() => setAlert(null), 5000);
    }
  }

  function handleAddProduct(productId: string) {
    const product = getProductById(productId);
    if (!product) return;

    setFormItems((current) => {
      const existingItem = current.find((item) => item.productId === productId);
      if (existingItem) {
        return current.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, createEmptyFormItem(product)];
    });
  }

  function handleAddLowStock(productId: string) {
    if (!supplierId) {
      const product = getProductById(productId);
      if (product?.supplier_id) {
        setSupplierId(product.supplier_id);
      }
    }
    handleAddProduct(productId);
  }

  function handleUpdateItem(lineId: string, field: keyof FormItem, value: string | number) {
    setFormItems((current) =>
      current.map((item) => {
        if (item.lineId !== lineId) return item;

        if (field === "quantity") {
          return { ...item, quantity: Math.max(1, Number(value) || 1) };
        }

        if (field === "unitCost") {
          return { ...item, unitCost: Math.max(0, Number(value) || 0) };
        }

        if (field === "productId") {
          const product = getProductById(String(value));
          return {
            ...item,
            productId: String(value),
            unitCost: product ? parseNumber(product.cost_price) : item.unitCost,
          };
        }

        return { ...item, [field]: value };
      })
    );
  }

  function handleRemoveItem(lineId: string) {
    setFormItems((current) => current.filter((item) => item.lineId !== lineId));
  }

  async function savePurchaseOrder(nextStatus: "draft" | "pending_approval") {
    if (!selectedBranchId) {
      setFormMessage({ type: "error", text: "Please select a branch before saving a purchase order." });
      return;
    }

    if (!supplierId) {
      setFormMessage({ type: "error", text: "Please select a supplier." });
      return;
    }

    if (formItems.length === 0 || formItems.some((item) => !item.productId)) {
      setFormMessage({ type: "error", text: "Add at least one valid product to the purchase order." });
      return;
    }

    setSaving(true);

    const payload = {
      supplier_id: supplierId,
      branch_id: selectedBranchId,
      status: nextStatus,
      expected_date: expectedDate || null,
      supplier_invoice: supplierInvoice.trim() || null,
      invoice_image_url: attachmentName ? `attachment:${attachmentName}` : null,
      subtotal,
      discount_amount: 0,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      paid_amount: selectedOrder ? parseNumber(selectedOrder.paid_amount) : 0,
      notes: referenceNote.trim() || null,
      created_by: profileUserId || null,
    };

    try {
      let poId = selectedOrderId;

      if (selectedOrderId) {
        const updateResult = await supabase.from("purchase_orders").update(payload).eq("id", selectedOrderId);
        if (updateResult.error) throw updateResult.error;

        const deleteResult = await supabase.from("purchase_order_items").delete().eq("po_id", selectedOrderId);
        if (deleteResult.error) throw deleteResult.error;
      } else {
        const insertResult = await supabase
          .from("purchase_orders")
          .insert({
            ...payload,
            po_number: buildPoNumber(),
          })
          .select("id")
          .single();

        if (insertResult.error || !insertResult.data) throw insertResult.error ?? new Error("PO insert failed.");
        poId = insertResult.data.id;
      }

      const itemsPayload = formItems.map((item) => ({
        po_id: poId,
        product_id: item.productId,
        quantity: item.quantity,
        received_qty: item.receivedQty,
        unit_cost: item.unitCost,
        notes: item.notes.trim() || null,
      }));

      const itemInsertResult = await supabase.from("purchase_order_items").insert(itemsPayload);
      if (itemInsertResult.error) throw itemInsertResult.error;

      await loadPurchasingData(selectedBranchId);
      setSelectedOrderId(poId);
      setFormMessage({
        type: "success",
        text: nextStatus === "draft" ? "Purchase order saved as draft." : "Purchase order submitted for approval.",
      });
    } catch (error) {
      console.error("[Purchasing] savePurchaseOrder failed:", error);
      setFormMessage({ type: "error", text: "Unable to save the purchase order. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function approveOrOrderPurchaseOrder() {
    if (!selectedOrder) return;
    setSaving(true);

    const nextStatus = selectedOrder.status === "pending_approval" ? "approved" : "ordered";
    const updatePayload =
      nextStatus === "approved"
        ? { status: nextStatus, approved_by: profileUserId || null, approved_at: new Date().toISOString() }
        : { status: nextStatus };

    const result = await supabase.from("purchase_orders").update(updatePayload).eq("id", selectedOrder.id);
    setSaving(false);

    if (result.error) {
      setFormMessage({ type: "error", text: "Unable to update the PO workflow status." });
      return;
    }

    await loadPurchasingData(selectedBranchId);
    setFormMessage({
      type: "success",
      text: nextStatus === "approved" ? "Purchase order approved." : "Purchase order marked as ordered.",
    });
  }

  async function recordReceiving() {
    if (!selectedOrder) return;

    const selectedItems = getItemsForOrder(selectedOrder.id);
    const receiveEntries = selectedItems
      .map((item) => ({
        item,
        receiveNow: Math.max(0, Number(receiveInputs[item.id] ?? 0)),
      }))
      .filter((entry) => entry.receiveNow > 0);

    if (receiveEntries.length === 0) {
      setFormMessage({ type: "error", text: "Enter at least one quantity to receive." });
      return;
    }

    const exceedsLimit = receiveEntries.some(
      ({ item, receiveNow }) => receiveNow + (item.received_qty ?? 0) > item.quantity
    );

    if (exceedsLimit) {
      setFormMessage({ type: "error", text: "Received quantity cannot exceed ordered quantity." });
      return;
    }

    setSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/inventory/receive-stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          purchaseOrderId: selectedOrder.id,
          branchId: selectedOrder.branch_id,
          supplierInvoice,
          invoiceImageUrl: attachmentName ? `attachment:${attachmentName}` : selectedOrder.invoice_image_url,
          notes: referenceNote,
          entries: receiveEntries.map(({ item, receiveNow }) => ({
            poItemId: item.id,
            productId: item.product_id,
            quantity: receiveNow,
            batchNumber: receiveBatchInputs[item.id] ?? "",
            expiryDate: receiveExpiryInputs[item.id] ?? "",
            serialNumbers: (receiveSerialInputs[item.id] ?? "")
              .split(/\r?\n|,/)
              .map((value) => value.trim())
              .filter(Boolean),
            damagedQuantity: Math.max(0, Number(receiveDamagedInputs[item.id] ?? 0)),
            returnedQuantity: Math.max(0, Number(receiveReturnedInputs[item.id] ?? 0)),
            notes: item.notes || referenceNote,
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to record receiving.");
      }

      await loadPurchasingData(selectedBranchId);
      setReceiveInputs({});
      setReceiveBatchInputs({});
      setReceiveExpiryInputs({});
      setReceiveSerialInputs({});
      setReceiveDamagedInputs({});
      setReceiveReturnedInputs({});
      setFormMessage({
        type: "success",
        text: result.status === "fully_received" ? "Stock fully received and inventory updated." : "Partial receiving recorded and inventory updated.",
      });
    } catch (error) {
      console.error("[Purchasing] recordReceiving failed:", error);
      setFormMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to record receiving. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setAttachmentName(file?.name ?? "");
  }

  return (
    <div className="page purchasing-page">
      <div className="purchasing-header">
        <div className="purchasing-header__copy">
          <div className="purchasing-header__title-row">
            <ShoppingCart size={18} />
            <h1>Purchasing</h1>
          </div>
          <p>Manage purchase orders, stock receiving, supplier invoices, and payment tracking.</p>
        </div>
      </div>

      {alert && (
        <div className={`purchasing-alert purchasing-alert--${alert.type}`}>
          <span>{alert.text}</span>
        </div>
      )}

      <div className="stats-row purchasing-stats">
        {[
          {
            label: "Total Purchases (This Month)",
            value: formatCurrency(totalPurchasesThisMonth),
            note: `${purchaseGrowth >= 0 ? "+" : ""}${purchaseGrowth.toFixed(1)}% vs last month`,
            icon: CircleDollarSign,
            color: "blue",
          },
          {
            label: "Total POs (This Month)",
            value: `${totalPosThisMonth}`,
            note: `${poGrowth >= 0 ? "+" : ""}${poGrowth.toFixed(1)}% vs last month`,
            icon: FileText,
            color: "purple",
          },
          {
            label: "Pending POs",
            value: `${pendingOrders.length}`,
            note: `Expected: ${formatCurrency(pendingExpectedAmount)}`,
            icon: Clock3,
            color: "orange",
          },
          {
            label: "Received (This Month)",
            value: formatCurrency(receivedThisMonthAmount),
            note: `${receivedRatio.toFixed(1)}% of total purchases`,
            icon: Truck,
            color: "green",
          },
          {
            label: "Total Suppliers",
            value: `${suppliers.length}`,
            note: "Active suppliers",
            icon: UserRound,
            color: "purple",
          },
        ].map((stat) => (
          <div key={stat.label} className="stat-card purchasing-stat-card">
            <div className={`stat-card__icon stat-card__icon--${stat.color}`}>
              <stat.icon size={19} />
            </div>
            <div className="purchasing-stat-card__content">
              <div className="stat-card__label">{stat.label}</div>
              <div className="stat-card__value">{stat.value}</div>
              <div className="stat-card__sub">{stat.note}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="purchasing-layout">
        <section className="table-card purchasing-board">
          <div className="purchasing-tabs">
            {statusTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`purchasing-tab ${selectedTab === tab ? "purchasing-tab--active" : ""}`}
                onClick={() => setSelectedTab(tab)}
              >
                {tab === "all" ? "All Purchase Orders" : formatStatusLabel(tab)}
              </button>
            ))}
          </div>

          <div className="purchasing-filters">
            <select
              className="purchasing-field-control"
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              className="purchasing-field-control"
              value={supplierFilterId}
              onChange={(event) => setSupplierFilterId(event.target.value)}
            >
              <option value="all">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            <select
              className="purchasing-field-control"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              {statusTabs.filter((tab) => tab !== "all").map((tab) => (
                <option key={tab} value={tab}>
                  {formatStatusLabel(tab)}
                </option>
              ))}
            </select>

            <label className="purchasing-field-control purchasing-field-control--with-icon">
              <Search size={14} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search PO#, supplier, or item..."
              />
            </label>

            <button type="button" className="purchasing-filter purchasing-filter--ghost">
              <Filter size={14} />
              <span>{loading ? "Loading..." : `${visibleOrders.length} results`}</span>
            </button>
          </div>

          <div className="purchasing-table-wrap">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Supplier</th>
                  <th>PO Date</th>
                  <th>Expected Date</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const items = getItemsForOrder(order.id);
                  const totalOrderedQty = items.reduce((sum, item) => sum + item.quantity, 0);
                  const totalReceivedQty = items.reduce((sum, item) => sum + (item.received_qty ?? 0), 0);
                  const receivePercent = totalOrderedQty > 0 ? Math.round((totalReceivedQty / totalOrderedQty) * 100) : 0;

                  return (
                    <tr key={order.id}>
                      <td className="purchase-table__link">{order.po_number}</td>
                      <td>{getSupplierById(order.supplier_id)?.name ?? "-"}</td>
                      <td>{formatDateLabel(order.created_at)}</td>
                      <td>{formatDateLabel(order.expected_date)}</td>
                      <td>{formatCurrency(parseNumber(order.total_amount))}</td>
                      <td>
                        <span className={statusClass(order.status)}>{formatStatusLabel(order.status)}</span>
                      </td>
                      <td>{receivePercent}%</td>
                      <td>
                        <div className="purchase-table__actions">
                          <button type="button" aria-label={`View ${order.po_number}`} onClick={() => setSelectedOrderId(order.id)}>
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Receive ${order.po_number}`}
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <PackageOpen size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Advance ${order.po_number}`}
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <ShieldCheck size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="purchase-table__empty">
                      No purchase orders matched your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="purchasing-board__footer">
            <span>Showing {visibleOrders.length} of {orders.length} purchase orders</span>
            <div className="purchasing-pagination">
              <button type="button">1</button>
              <button type="button" className="is-active">2</button>
              <button type="button">3</button>
              <button type="button">4</button>
            </div>
            <button type="button" className="purchasing-filter">
              <span>{branches.find((branch) => branch.id === selectedBranchId)?.name ?? "Select Branch"}</span>
            </button>
          </div>

          <div className="purchasing-bottom-grid">
            <section className="table-card purchasing-mini-card">
              <div className="table-card__header">
                <span className="table-card__title">Recent Purchases</span>
              </div>
              <div className="purchase-list">
                {recentPurchases.map((purchase) => (
                  <div key={purchase.id} className="purchase-list__row">
                    <div>
                      <div className="purchase-list__po">{purchase.po_number}</div>
                      <div className="purchase-list__supplier">{getSupplierById(purchase.supplier_id)?.name ?? "-"}</div>
                    </div>
                    <div className="purchase-list__meta">
                      <span>{formatDateLabel(purchase.created_at)}</span>
                      <strong>{formatCurrency(parseNumber(purchase.total_amount))}</strong>
                    </div>
                    <span className={statusClass(purchase.status)}>{formatStatusLabel(purchase.status)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="table-card purchasing-mini-card">
              <div className="table-card__header">
                <span className="table-card__title">Top Suppliers (This Month)</span>
              </div>
              <div className="supplier-rankings">
                {topSuppliers.map((supplier, index) => (
                  <div key={supplier.name} className="supplier-rankings__row">
                    <div className="supplier-rankings__left">
                      <span className="supplier-rankings__index">{index + 1}</span>
                      <span className="supplier-rankings__name">{supplier.name}</span>
                    </div>
                    <strong>{formatCurrency(supplier.amount)}</strong>
                  </div>
                ))}
                {topSuppliers.length === 0 && <div className="purchase-table__empty">No supplier totals found yet.</div>}
              </div>
            </section>
          </div>

          <section className="table-card purchasing-workflow">
            <div className="table-card__header">
              <span className="table-card__title">Purchase Order Workflow</span>
            </div>
            <div className="purchase-workflow">
              {workflow.map((step) => (
                <div key={step.title} className="purchase-workflow__step">
                  <div className={`purchase-workflow__icon purchase-workflow__icon--${step.color}`}>
                    <step.icon size={18} />
                  </div>
                  <div className="purchase-workflow__title">{step.title}</div>
                  <div className="purchase-workflow__text">{step.text}</div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="table-card purchasing-form-card">
          <div className="table-card__header">
            <span className="table-card__title">
              {selectedOrder ? `Purchase Order ${selectedOrder.po_number}` : "New Purchase Order"}
            </span>
            {selectedOrder && (
              <button type="button" className="purchasing-link-button" onClick={resetForm}>
                New PO
              </button>
            )}
          </div>

          <div className="purchasing-form">
            <div className="purchasing-form__section">
              <label className="purchasing-form__field">
                <span>Supplier</span>
                <select
                  className="purchasing-field-control"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  disabled={!canEditSelectedOrder || saving}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="purchasing-form__grid">
                <label className="purchasing-form__field">
                  <span>PO Date</span>
                  <input
                    type="date"
                    className="purchasing-field-control"
                    value={poDate}
                    onChange={(event) => setPoDate(event.target.value)}
                    disabled
                  />
                </label>
                <label className="purchasing-form__field">
                  <span>Expected Date</span>
                  <input
                    type="date"
                    className="purchasing-field-control"
                    value={expectedDate}
                    onChange={(event) => setExpectedDate(event.target.value)}
                    disabled={!canEditSelectedOrder || saving}
                  />
                </label>
              </div>

              <label className="purchasing-form__field">
                <span>Reference / Note</span>
                <textarea
                  className="purchasing-note-control"
                  value={referenceNote}
                  onChange={(event) => setReferenceNote(event.target.value)}
                  placeholder="Enter reference, notes, or receiving remarks..."
                  disabled={!canEditSelectedOrder && !canReceive}
                />
              </label>
            </div>

            <div className="purchasing-form__section">
              <div className="purchasing-form__section-header">
                <h2>Low-Stock Suggestions</h2>
                <span>Auto-suggest items below reorder level for the active branch</span>
              </div>
              <div className="low-stock-list">
                {filteredLowStock.slice(0, 5).map((item) => (
                  <div key={item.product_id} className="low-stock-list__item">
                    <div>
                      <strong>{item.product_name}</strong>
                      <span>{item.sku}</span>
                    </div>
                    <div className="low-stock-list__actions">
                      <em>Low stock: {item.current_stock}</em>
                      <button type="button" onClick={() => handleAddLowStock(item.product_id)} disabled={!canEditSelectedOrder}>
                        Add
                      </button>
                    </div>
                  </div>
                ))}
                {filteredLowStock.length === 0 && <div className="purchase-table__empty">No low-stock products found.</div>}
              </div>
            </div>

            <div className="purchasing-form__section">
              <div className="purchasing-form__section-header purchasing-form__section-header--inline">
                <h2>Items</h2>
                <div className="purchasing-inline-actions">
                  <select
                    className="purchasing-field-control"
                    value={catalogProductId}
                    onChange={(event) => setCatalogProductId(event.target.value)}
                    disabled={!canEditSelectedOrder || saving}
                  >
                    <option value="">Select product</option>
                    {products
                      .filter((product) => !supplierId || product.supplier_id === supplierId)
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      if (catalogProductId) handleAddProduct(catalogProductId);
                    }}
                    disabled={!catalogProductId || !canEditSelectedOrder || saving}
                  >
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              <div className="po-items">
                <div className={`po-items__head ${selectedOrder ? "po-items__head--receiving" : ""}`}>
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Unit Cost</span>
                  <span>Amount</span>
                  {selectedOrder && <span>Received</span>}
                  {selectedOrder && canReceive && <span>Receive Now</span>}
                  {canEditSelectedOrder && <span>Remove</span>}
                </div>
                {formItems.map((item) => {
                  const product = getProductById(item.productId);
                  const amount = item.quantity * item.unitCost;
                  const orderedRemaining = Math.max(item.quantity - item.receivedQty, 0);
                  return (
                    <div
                      key={item.lineId}
                      className={`po-items__row ${selectedOrder ? "po-items__row--receiving" : ""}`}
                    >
                      <div className="po-items__product">
                        <div className="po-items__thumb">
                          <Warehouse size={15} />
                        </div>
                        <div>
                          <strong>{product?.name ?? "Select product"}</strong>
                          <span>{product?.sku ?? "-"}</span>
                          {selectedOrder && canReceive && item.poItemId ? (
                            <div className="po-item-receiving-meta">
                              <input
                                type="text"
                                className="purchasing-field-control purchasing-field-control--compact"
                                placeholder="Batch number"
                                value={receiveBatchInputs[item.poItemId] ?? ""}
                                onChange={(event) =>
                                  setReceiveBatchInputs((current) => ({
                                    ...current,
                                    [item.poItemId ?? ""]: event.target.value,
                                  }))
                                }
                                disabled={saving}
                              />
                              <input
                                type="date"
                                className="purchasing-field-control purchasing-field-control--compact"
                                value={receiveExpiryInputs[item.poItemId] ?? ""}
                                onChange={(event) =>
                                  setReceiveExpiryInputs((current) => ({
                                    ...current,
                                    [item.poItemId ?? ""]: event.target.value,
                                  }))
                                }
                                disabled={saving}
                              />
                              <input
                                type="number"
                                min="0"
                                className="purchasing-field-control purchasing-field-control--compact"
                                placeholder="Damaged"
                                value={receiveDamagedInputs[item.poItemId] ?? 0}
                                onChange={(event) =>
                                  setReceiveDamagedInputs((current) => ({
                                    ...current,
                                    [item.poItemId ?? ""]: Math.max(0, Number(event.target.value) || 0),
                                  }))
                                }
                                disabled={saving}
                              />
                              <input
                                type="number"
                                min="0"
                                className="purchasing-field-control purchasing-field-control--compact"
                                placeholder="Returned"
                                value={receiveReturnedInputs[item.poItemId] ?? 0}
                                onChange={(event) =>
                                  setReceiveReturnedInputs((current) => ({
                                    ...current,
                                    [item.poItemId ?? ""]: Math.max(0, Number(event.target.value) || 0),
                                  }))
                                }
                                disabled={saving}
                              />
                              <textarea
                                className="purchasing-note-control purchasing-note-control--compact"
                                placeholder="Serial numbers, one per line or comma-separated"
                                value={receiveSerialInputs[item.poItemId] ?? ""}
                                onChange={(event) =>
                                  setReceiveSerialInputs((current) => ({
                                    ...current,
                                    [item.poItemId ?? ""]: event.target.value,
                                  }))
                                }
                                disabled={saving}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <input
                        type="number"
                        min="1"
                        className="purchasing-field-control purchasing-field-control--compact"
                        value={item.quantity}
                        onChange={(event) => handleUpdateItem(item.lineId, "quantity", event.target.value)}
                        disabled={!canEditSelectedOrder || saving}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="purchasing-field-control purchasing-field-control--compact"
                        value={item.unitCost}
                        onChange={(event) => handleUpdateItem(item.lineId, "unitCost", event.target.value)}
                        disabled={!canEditSelectedOrder || saving}
                      />
                      <div className="po-items__amount">{formatCurrency(amount)}</div>
                      {selectedOrder && (
                        <div className="po-items__received">
                          {item.receivedQty} / {item.quantity}
                        </div>
                      )}
                      {selectedOrder && canReceive && (
                        <input
                          type="number"
                          min="0"
                          max={orderedRemaining}
                          className="purchasing-field-control purchasing-field-control--compact"
                          value={receiveInputs[item.poItemId ?? ""] ?? 0}
                          onChange={(event) =>
                            setReceiveInputs((current) => ({
                              ...current,
                              [item.poItemId ?? ""]: Math.max(0, Number(event.target.value) || 0),
                            }))
                          }
                          disabled={saving}
                        />
                      )}
                      {canEditSelectedOrder && (
                        <button type="button" className="po-items__remove" onClick={() => handleRemoveItem(item.lineId)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {formItems.length === 0 && <div className="purchase-table__empty">No items added yet.</div>}
              </div>
            </div>

            <div className="purchasing-form__section">
              <div className="purchasing-form__section-header">
                <h2>Receiving & Invoice</h2>
                <span>Track full or partial receiving, invoice details, and supplier payments</span>
              </div>
              <div className="purchasing-form__grid">
                <label className="purchasing-form__field">
                  <span>PO Status</span>
                  <div className="purchasing-field-control purchasing-field-control--readonly">
                    <BadgeCheck size={14} />
                    <strong>{selectedOrder ? formatStatusLabel(selectedOrder.status) : "Draft"}</strong>
                  </div>
                </label>
                <label className="purchasing-form__field">
                  <span>Payment Tracking</span>
                  <div className="purchasing-field-control purchasing-field-control--readonly">
                    <CircleDollarSign size={14} />
                    <strong>
                      {selectedOrder ? `${formatCurrency(paidAmount)} paid / ${formatCurrency(balanceAmount)} due` : "Unpaid / not yet posted"}
                    </strong>
                  </div>
                </label>
              </div>

              <div className="purchasing-form__grid">
                <label className="purchasing-form__field">
                  <span>Supplier Invoice No.</span>
                  <input
                    className="purchasing-field-control"
                    value={supplierInvoice}
                    onChange={(event) => setSupplierInvoice(event.target.value)}
                    placeholder="INV-2024-0001"
                    disabled={saving}
                  />
                </label>
                <label className="purchasing-form__field">
                  <span>Supplier Terms</span>
                  <div className="purchasing-field-control purchasing-field-control--readonly">
                    <Clock3 size={14} />
                    <strong>{selectedSupplier ? `${selectedSupplier.payment_terms ?? 0} days` : "-"}</strong>
                  </div>
                </label>
              </div>

              <div className="purchase-attachments">
                <label className="purchase-attachments__card purchase-attachments__card--clickable">
                  <Upload size={16} />
                  <div>
                    <strong>Attach Invoice Image / PDF</strong>
                    <span>{attachmentName || "Choose an invoice file for this PO"}</span>
                  </div>
                  <input type="file" accept="image/*,.pdf" hidden onChange={handleAttachmentChange} />
                </label>
                {attachmentName && (
                  <div className="purchase-attachments__list">
                    <div className="purchase-attachments__file">
                      {attachmentName.toLowerCase().endsWith(".pdf") ? <FileText size={15} /> : <FileImage size={15} />}
                      <span>{attachmentName}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="purchase-summary">
              <div className="purchase-summary__row">
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div className="purchase-summary__row">
                <span>Discount</span>
                <strong>{formatCurrency(0)}</strong>
              </div>
              <div className="purchase-summary__row">
                <span>VAT (12%)</span>
                <strong>{formatCurrency(taxAmount)}</strong>
              </div>
              <div className="purchase-summary__row purchase-summary__row--total">
                <span>Total</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
            </div>

            <div className="purchase-actions purchase-actions--stack">
              {(canApprove || canMarkOrdered) && (
                <button type="button" className="btn btn--ghost purchase-actions__button" onClick={approveOrOrderPurchaseOrder} disabled={saving}>
                  {canApprove ? "Approve PO" : "Mark as Ordered"}
                </button>
              )}
              {canReceive && (
                <button type="button" className="btn btn--ghost purchase-actions__button" onClick={recordReceiving} disabled={saving}>
                  Record Receiving
                </button>
              )}
              <button type="button" className="btn btn--ghost purchase-actions__button" onClick={() => savePurchaseOrder("draft")} disabled={saving || !canEditSelectedOrder}>
                Save as Draft
              </button>
              <button type="button" className="btn btn--primary purchase-actions__button" onClick={() => savePurchaseOrder("pending_approval")} disabled={saving || !canEditSelectedOrder}>
                Submit PO
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

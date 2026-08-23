"use client";

import { useDeferredValue, useEffect, useState, startTransition, useRef, useCallback, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  FileImage,
  FileText,
  Filter,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Warehouse,
  X,
  XCircle,
  CreditCard,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchBranchOptions } from "@/lib/branch-options";
import { useRbac } from "@/components/RbacProvider";
import { useSubscriptionAccess } from "@/components/SubscriptionProvider";
import FeatureLockedPanel from "@/components/subscription/FeatureLockedPanel";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
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

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ITEMS_PER_PAGE = 10;

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

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "gcash", label: "GCash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
];

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Confirmation Modal Component                                       */
/* ------------------------------------------------------------------ */

function ConfirmModal({
  action,
  onClose,
}: {
  action: NonNullable<ConfirmAction>;
  onClose: () => void;
}) {
  return (
    <div className="po-confirm-overlay" onClick={onClose}>
      <div className="po-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="po-confirm-modal__icon-wrap">
          {action.danger ? (
            <AlertTriangle size={28} className="po-confirm-modal__icon po-confirm-modal__icon--danger" />
          ) : (
            <CheckCircle2 size={28} className="po-confirm-modal__icon po-confirm-modal__icon--info" />
          )}
        </div>
        <h3 className="po-confirm-modal__title">{action.title}</h3>
        <p className="po-confirm-modal__message">{action.message}</p>
        <div className="po-confirm-modal__actions">
          <button type="button" className="btn btn--ghost po-confirm-modal__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn po-confirm-modal__btn ${action.danger ? "btn--danger" : "btn--primary"}`}
            onClick={() => {
              action.onConfirm();
              onClose();
            }}
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payment Modal Component                                            */
/* ------------------------------------------------------------------ */

function PaymentModal({
  order,
  supplier,
  currentPaid,
  totalAmount,
  onSave,
  onClose,
  saving,
}: {
  order: PurchaseOrderRow;
  supplier: Supplier | undefined;
  currentPaid: number;
  totalAmount: number;
  onSave: (data: { amount: number; paymentMethod: string; referenceNo: string; notes: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const balance = Math.max(totalAmount - currentPaid, 0);

  return (
    <div className="po-confirm-overlay" onClick={onClose}>
      <div className="po-payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="po-payment-modal__header">
          <div className="po-payment-modal__header-icon">
            <DollarSign size={20} />
          </div>
          <div>
            <h3>Record Supplier Payment</h3>
            <p>{order.po_number} — {supplier?.name ?? "Unknown Supplier"}</p>
          </div>
          <button type="button" className="po-payment-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="po-payment-modal__summary">
          <div className="po-payment-modal__summary-item">
            <span>Total Amount</span>
            <strong>{formatCurrency(totalAmount)}</strong>
          </div>
          <div className="po-payment-modal__summary-item">
            <span>Already Paid</span>
            <strong>{formatCurrency(currentPaid)}</strong>
          </div>
          <div className="po-payment-modal__summary-item po-payment-modal__summary-item--highlight">
            <span>Balance Due</span>
            <strong>{formatCurrency(balance)}</strong>
          </div>
        </div>

        <div className="po-payment-modal__form">
          <label className="purchasing-form__field">
            <span>Payment Amount *</span>
            <input
              type="number"
              className="purchasing-field-control"
              placeholder="0.00"
              min="0"
              step="0.01"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </label>

          <label className="purchasing-form__field">
            <span>Payment Method</span>
            <select
              className="purchasing-field-control"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              disabled={saving}
            >
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm.value} value={pm.value}>
                  {pm.label}
                </option>
              ))}
            </select>
          </label>

          <label className="purchasing-form__field">
            <span>Reference No.</span>
            <input
              type="text"
              className="purchasing-field-control"
              placeholder="Check #, GCash ref, etc."
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              disabled={saving}
            />
          </label>

          <label className="purchasing-form__field">
            <span>Notes</span>
            <textarea
              className="purchasing-note-control"
              placeholder="Optional payment notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        <div className="po-payment-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !amount || Number(amount) <= 0 || Number(amount) > balance}
            onClick={() =>
              onSave({
                amount: Number(amount),
                paymentMethod,
                referenceNo: referenceNo.trim(),
                notes: notes.trim(),
              })
            }
          >
            {saving ? (
              <>
                <Loader2 size={14} className="spin" /> Processing...
              </>
            ) : (
              <>
                <CreditCard size={14} /> Record Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Print PO Component                                                 */
/* ------------------------------------------------------------------ */

function PrintPO({
  order,
  supplier,
  items,
  products,
  subtotal,
  taxAmount,
  totalAmount,
  paidAmount,
}: {
  order: PurchaseOrderRow;
  supplier: Supplier | undefined;
  items: FormItem[];
  products: Product[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
}) {
  const getProduct = (id: string) => products.find((p) => p.id === id);

  return (
    <div className="po-print-area" id="po-print-area">
      <div className="po-print__header">
        <div>
          <h1 className="po-print__company">WAP Motorparts</h1>
          <p className="po-print__subtitle">Purchase Order</p>
        </div>
        <div className="po-print__po-info">
          <div className="po-print__po-number">{order.po_number}</div>
          <div className="po-print__po-date">
            <span>Date:</span> {formatDateLabel(order.created_at)}
          </div>
          <div className="po-print__po-status">
            <span className={statusClass(order.status)}>{formatStatusLabel(order.status)}</span>
          </div>
        </div>
      </div>

      <div className="po-print__supplier-info">
        <div className="po-print__info-block">
          <h4>Supplier</h4>
          <p><strong>{supplier?.name ?? "-"}</strong></p>
          <p>Code: {supplier?.code ?? "-"}</p>
          <p>Payment Terms: {supplier?.payment_terms ?? 0} days</p>
        </div>
        <div className="po-print__info-block">
          <h4>Order Details</h4>
          <p>Expected Date: {formatDateLabel(order.expected_date)}</p>
          <p>Invoice #: {order.supplier_invoice || "-"}</p>
          {order.approved_at && <p>Approved: {formatDateLabel(order.approved_at)}</p>}
        </div>
      </div>

      <table className="po-print__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Unit Cost</th>
            <th>Amount</th>
            {order.status !== "draft" && order.status !== "pending_approval" && <th>Received</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const product = getProduct(item.productId);
            return (
              <tr key={item.lineId}>
                <td>{idx + 1}</td>
                <td>{product?.name ?? "-"}</td>
                <td>{product?.sku ?? "-"}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.unitCost)}</td>
                <td>{formatCurrency(item.quantity * item.unitCost)}</td>
                {order.status !== "draft" && order.status !== "pending_approval" && (
                  <td>{item.receivedQty} / {item.quantity}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="po-print__totals">
        <div className="po-print__total-row">
          <span>Subtotal</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        <div className="po-print__total-row">
          <span>VAT (12%)</span>
          <strong>{formatCurrency(taxAmount)}</strong>
        </div>
        <div className="po-print__total-row po-print__total-row--grand">
          <span>Total Amount</span>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>
        <div className="po-print__total-row">
          <span>Amount Paid</span>
          <strong>{formatCurrency(paidAmount)}</strong>
        </div>
        <div className="po-print__total-row">
          <span>Balance Due</span>
          <strong>{formatCurrency(Math.max(totalAmount - paidAmount, 0))}</strong>
        </div>
      </div>

      {order.notes && (
        <div className="po-print__notes">
          <h4>Notes</h4>
          <p>{order.notes}</p>
        </div>
      )}

      <div className="po-print__footer">
        <div className="po-print__sig-block">
          <div className="po-print__sig-line" />
          <span>Prepared by</span>
        </div>
        <div className="po-print__sig-block">
          <div className="po-print__sig-line" />
          <span>Approved by</span>
        </div>
        <div className="po-print__sig-block">
          <div className="po-print__sig-line" />
          <span>Received by</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main PurchasingClient Component                                    */
/* ------------------------------------------------------------------ */

export default function PurchasingClient() {
  const { canAny } = useRbac();
  const { loading: subscriptionLoading, hasFeature, requiredPlanFor } = useSubscriptionAccess();
  const canUsePurchasing = hasFeature("purchase_orders");
  /* State ---------------------------------------------------------- */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, PurchaseOrderItemRow[]>>({});
  const [paymentListByPo, setPaymentListByPo] = useState<Record<string, SupplierPaymentRow[]>>({});
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
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, number>>({});
  const [receiveBatchInputs, setReceiveBatchInputs] = useState<Record<string, string>>({});
  const [receiveExpiryInputs, setReceiveExpiryInputs] = useState<Record<string, string>>({});
  const [receiveSerialInputs, setReceiveSerialInputs] = useState<Record<string, string>>({});
  const [receiveDamagedInputs, setReceiveDamagedInputs] = useState<Record<string, number>>({});
  const [receiveReturnedInputs, setReceiveReturnedInputs] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const deferredSearch = useDeferredValue(searchTerm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Auth helper ---------------------------------------------------- */
  const getAccessToken = useCallback(async () => {
    const sessionResult = await supabase.auth.getSession();
    return sessionResult.data.session?.access_token ?? "";
  }, []);

  /* Data loading --------------------------------------------------- */
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

    const [profileResult, suppliersResult, productsResult] = await Promise.all([
      supabase.from("users").select("id, branch_id").eq("auth_id", user.id).maybeSingle(),
      supabase.from("suppliers").select("id, code, name, payment_terms, current_balance, is_active").eq("is_active", true).order("name"),
      supabase.from("products").select("id, name, sku, supplier_id, cost_price, reorder_level, critical_stock_level, status").eq("status", "active").order("name"),
    ]);

    if (profileResult.error || suppliersResult.error || productsResult.error) {
      setAlert({ type: "error", text: "Unable to load purchasing setup data from Supabase." });
      setLoading(false);
      return;
    }

    const profile = profileResult.data as UserProfile | null;
    const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const branchRows = token ? ((await fetchBranchOptions(token)) as Branch[]) : [];
    const initialBranchId =
      savedBranchId ||
      profile?.branch_id ||
      branchRows.find((branch) => branch.is_main)?.id ||
      branchRows[0]?.id ||
      "";

    setProfileUserId(profile?.id ?? "");
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
        ? supabase.from("supplier_payments").select("id, supplier_id, po_id, amount, payment_method, reference_no, notes, paid_at, created_at").in("po_id", poIds)
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

    const paymentList: Record<string, SupplierPaymentRow[]> = {};
    ((paymentsResult.data ?? []) as SupplierPaymentRow[]).forEach((payment) => {
      if (!payment.po_id) return;
      paymentList[payment.po_id] = [...(paymentList[payment.po_id] ?? []), payment];
    });

    setOrders(orderRows);
    setOrderItems(groupedItems);
    setPaymentListByPo(paymentList);
    setLowStock((lowStockResult.data ?? []) as LowStockRow[]);
    setLoading(false);
  }

  /* Effects -------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await loadInitialContext();
      if (cancelled) return;
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleBranchChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) {
        setSelectedBranchId(detail.id);
      }
    };

    window.addEventListener("branch-changed", handleBranchChanged);
    return () => window.removeEventListener("branch-changed", handleBranchChanged);
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;
    let cancelled = false;
    const run = async () => {
      await loadPurchasingData(selectedBranchId);
      if (cancelled) return;
    };
    void run();
    return () => { cancelled = true; };
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
      setAttachmentName(
        selectedOrder.invoice_image_url?.startsWith("http")
          ? selectedOrder.invoice_image_url.split("/").pop() ?? ""
          : selectedOrder.invoice_image_url?.replace(/^attachment:/, "") ?? ""
      );
      setAttachmentUrl(
        selectedOrder.invoice_image_url?.startsWith("http")
          ? selectedOrder.invoice_image_url
          : ""
      );
      setFormItems(selectedItems);
      setReceiveInputs(nextReceiveInputs);
      setReceiveBatchInputs({});
      setReceiveExpiryInputs({});
      setReceiveSerialInputs({});
      setReceiveDamagedInputs({});
      setReceiveReturnedInputs({});
    });
  }, [selectedOrderId, orders, orderItems]);

  /* Form helpers --------------------------------------------------- */
  function resetForm() {
    setSelectedOrderId("");
    setSupplierId("");
    setPoDate(toInputDate(new Date().toISOString()));
    setExpectedDate("");
    setReferenceNote("");
    setSupplierInvoice("");
    setAttachmentName("");
    setAttachmentUrl("");
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

  /* Filtered + paginated orders ------------------------------------ */
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

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedOrders = visibleOrders.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  /* Derived state -------------------------------------------------- */
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
  const paidAmount = selectedOrder ? parseNumber(selectedOrder.paid_amount) : 0;
  const balanceAmount = Math.max(totalAmount - paidAmount, 0);
  const canEditSelectedOrder = selectedOrder ? !["fully_received", "cancelled"].includes(selectedOrder.status) : true;
  const canApproveWorkflow = canAny("purchasing:approve", "purchasing:manage");
  const canApprove = selectedOrder?.status === "pending_approval" && canApproveWorkflow;
  const canMarkOrdered = selectedOrder?.status === "approved" && canAny("purchasing:edit", "purchasing:approve", "purchasing:manage");
  const canReceive = selectedOrder ? ["approved", "ordered", "partially_received"].includes(selectedOrder.status) : false;
  const canCancel = selectedOrder ? ["draft", "pending_approval", "approved"].includes(selectedOrder.status) : false;
  const canRecordPayment = selectedOrder ? !["draft", "cancelled"].includes(selectedOrder.status) && balanceAmount > 0 : false;

  /* Actions -------------------------------------------------------- */
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

  /* Upload invoice ------------------------------------------------- */
  async function handleAttachmentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setAttachmentName(file.name);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expired. Please sign in again.");

      const formData = new FormData();
      formData.append("file", file);
      if (selectedOrderId) formData.append("poId", selectedOrderId);

      const response = await fetch("/api/inventory/upload-invoice", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");

      setAttachmentUrl(result.url);
      setFormMessage({ type: "success", text: `Invoice file "${file.name}" uploaded successfully.` });
    } catch (error) {
      console.error("[Purchasing] upload failed:", error);
      setAttachmentName("");
      setAttachmentUrl("");
      setFormMessage({ type: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* Save PO -------------------------------------------------------- */
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

    const invoiceUrl = attachmentUrl || (attachmentName ? `attachment:${attachmentName}` : null);

    const payload = {
      supplier_id: supplierId,
      branch_id: selectedBranchId,
      status: nextStatus,
      expected_date: expectedDate || null,
      supplier_invoice: supplierInvoice.trim() || null,
      invoice_image_url: invoiceUrl,
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

  /* Approve / Mark Ordered ----------------------------------------- */
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

  /* Cancel PO ------------------------------------------------------ */
  async function cancelPurchaseOrder() {
    if (!selectedOrder) return;
    setSaving(true);

    const result = await supabase
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", selectedOrder.id);

    setSaving(false);

    if (result.error) {
      setFormMessage({ type: "error", text: "Unable to cancel the purchase order." });
      return;
    }

    await loadPurchasingData(selectedBranchId);
    setFormMessage({ type: "success", text: "Purchase order cancelled." });
  }

  /* Record Receiving ----------------------------------------------- */
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
          invoiceImageUrl: attachmentUrl || (attachmentName ? `attachment:${attachmentName}` : selectedOrder.invoice_image_url),
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

  /* Record Payment ------------------------------------------------- */
  async function recordSupplierPayment(data: { amount: number; paymentMethod: string; referenceNo: string; notes: string }) {
    if (!selectedOrder) return;
    setSaving(true);

    try {
      const insertResult = await supabase.from("supplier_payments").insert({
        supplier_id: selectedOrder.supplier_id,
        po_id: selectedOrder.id,
        amount: data.amount,
        payment_method: data.paymentMethod,
        reference_no: data.referenceNo || null,
        notes: data.notes || null,
        created_by: profileUserId || null,
      });

      if (insertResult.error) throw insertResult.error;

      const newPaid = parseNumber(selectedOrder.paid_amount) + data.amount;
      await supabase
        .from("purchase_orders")
        .update({ paid_amount: newPaid })
        .eq("id", selectedOrder.id);

      await loadPurchasingData(selectedBranchId);
      setShowPaymentModal(false);
      setFormMessage({ type: "success", text: `Payment of ${formatCurrency(data.amount)} recorded successfully.` });
    } catch (error) {
      console.error("[Purchasing] recordSupplierPayment failed:", error);
      setFormMessage({ type: "error", text: "Unable to record payment. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  /* Print ---------------------------------------------------------- */
  function handlePrint() {
    window.print();
  }

  /* Pagination helpers --------------------------------------------- */
  function getPageNumbers() {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                           */
  /* ---------------------------------------------------------------- */

  if (!subscriptionLoading && !canUsePurchasing) {
    return (
      <FeatureLockedPanel
        featureName="Purchase Orders"
        requiredPlan={requiredPlanFor("purchase_orders")}
        description="Purchasing, stock receiving, and supplier order workflows are locked on the current plan."
      />
    );
  }

  return (
    <div className="page purchasing-page">
      {/* Print area (hidden on screen) */}
      {selectedOrder && (
        <PrintPO
          order={selectedOrder}
          supplier={selectedSupplier}
          items={formItems}
          products={products}
          subtotal={subtotal}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          paidAmount={paidAmount}
        />
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedOrder && (
        <PaymentModal
          order={selectedOrder}
          supplier={selectedSupplier}
          currentPaid={paidAmount}
          totalAmount={totalAmount}
          onSave={recordSupplierPayment}
          onClose={() => setShowPaymentModal(false)}
          saving={saving}
        />
      )}

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
                onClick={() => {
                  setSelectedTab(tab);
                  setCurrentPage(1);
                }}
              >
                {tab === "all" ? "All Purchase Orders" : formatStatusLabel(tab)}
              </button>
            ))}
          </div>

          <div className="purchasing-filters">
            <select
              className="purchasing-field-control"
              value={supplierFilterId}
              onChange={(event) => {
                setSupplierFilterId(event.target.value);
                setCurrentPage(1);
              }}
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
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setCurrentPage(1);
              }}
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
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
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
                {pagedOrders.map((order) => {
                  const items = getItemsForOrder(order.id);
                  const totalOrderedQty = items.reduce((sum, item) => sum + item.quantity, 0);
                  const totalReceivedQty = items.reduce((sum, item) => sum + (item.received_qty ?? 0), 0);
                  const receivePercent = totalOrderedQty > 0 ? Math.round((totalReceivedQty / totalOrderedQty) * 100) : 0;

                  return (
                    <tr key={order.id} className={selectedOrderId === order.id ? "purchase-table__row--selected" : ""}>
                      <td className="purchase-table__link" onClick={() => setSelectedOrderId(order.id)} style={{ cursor: "pointer" }}>
                        {order.po_number}
                      </td>
                      <td>{getSupplierById(order.supplier_id)?.name ?? "-"}</td>
                      <td>{formatDateLabel(order.created_at)}</td>
                      <td>{formatDateLabel(order.expected_date)}</td>
                      <td>{formatCurrency(parseNumber(order.total_amount))}</td>
                      <td>
                        <span className={statusClass(order.status)}>{formatStatusLabel(order.status)}</span>
                      </td>
                      <td>
                        <div className="purchase-table__receive-bar">
                          <div className="purchase-table__receive-fill" style={{ width: `${receivePercent}%` }} />
                          <span>{receivePercent}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="purchase-table__actions">
                          <button type="button" aria-label={`View ${order.po_number}`} title="View" onClick={() => setSelectedOrderId(order.id)}>
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Receive ${order.po_number}`}
                            title="Receive"
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <PackageOpen size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Advance ${order.po_number}`}
                            title="Approve"
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <ShieldCheck size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="purchase-table__empty">
                      No purchase orders matched your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Functional Pagination */}
          <div className="purchasing-board__footer">
            <span>Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, visibleOrders.length)} of {visibleOrders.length} purchase orders</span>
            <div className="purchasing-pagination">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              {getPageNumbers().map((page) => (
                <button
                  key={page}
                  type="button"
                  className={safePage === page ? "is-active" : ""}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
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

        {/* ======= FORM SIDEBAR ======= */}
        <aside className="table-card purchasing-form-card">
          <div className="table-card__header">
            <span className="table-card__title">
              {selectedOrder ? `Purchase Order ${selectedOrder.po_number}` : "New Purchase Order"}
            </span>
            <div className="purchasing-form-card__header-actions">
              {selectedOrder && (
                <button type="button" className="purchasing-link-button" onClick={handlePrint} title="Print PO">
                  <Printer size={14} />
                </button>
              )}
              {selectedOrder && (
                <button type="button" className="purchasing-link-button" onClick={resetForm}>
                  New PO
                </button>
              )}
            </div>
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

            {/* Low Stock Suggestions */}
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

            {/* Items */}
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

            {/* Receiving & Invoice */}
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

              {/* Invoice Attachment with real upload */}
              <div className="purchase-attachments">
                <label className="purchase-attachments__card purchase-attachments__card--clickable">
                  {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                  <div>
                    <strong>{uploading ? "Uploading..." : "Attach Invoice Image / PDF"}</strong>
                    <span>{attachmentName || "Choose an invoice file for this PO (max 10MB)"}</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf" hidden onChange={handleAttachmentUpload} disabled={uploading} />
                </label>
                {attachmentName && (
                  <div className="purchase-attachments__list">
                    <div className="purchase-attachments__file">
                      {attachmentName.toLowerCase().endsWith(".pdf") ? <FileText size={15} /> : <FileImage size={15} />}
                      <span>{attachmentName}</span>
                      {attachmentUrl && (
                        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="purchase-attachments__view-link">
                          <Eye size={12} /> View
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment History */}
              {selectedOrder && (paymentListByPo[selectedOrder.id] ?? []).length > 0 && (
                <div className="po-payment-history">
                  <h3 className="po-payment-history__title">Payment History</h3>
                  {(paymentListByPo[selectedOrder.id] ?? []).map((payment) => (
                    <div key={payment.id} className="po-payment-history__row">
                      <div>
                        <strong>{formatCurrency(parseNumber(payment.amount))}</strong>
                        <span>{payment.payment_method ? formatStatusLabel(payment.payment_method) : "Cash"}</span>
                      </div>
                      <div className="po-payment-history__meta">
                        <span>{formatDateLabel(payment.paid_at || payment.created_at)}</span>
                        {payment.reference_no && <span>Ref: {payment.reference_no}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
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

            {/* Action buttons */}
            <div className="purchase-actions purchase-actions--stack">
              {(canApprove || canMarkOrdered) && (
                <button
                  type="button"
                  className="btn btn--ghost purchase-actions__button"
                  onClick={() =>
                    setConfirmAction({
                      title: canApprove ? "Approve Purchase Order" : "Mark as Ordered",
                      message: canApprove
                        ? `Are you sure you want to approve ${selectedOrder?.po_number}? This will allow it to be ordered and received.`
                        : `Mark ${selectedOrder?.po_number} as ordered? This confirms the order has been placed with the supplier.`,
                      confirmLabel: canApprove ? "Approve" : "Mark Ordered",
                      onConfirm: approveOrOrderPurchaseOrder,
                    })
                  }
                  disabled={saving}
                >
                  {canApprove ? "Approve PO" : "Mark as Ordered"}
                </button>
              )}
              {canReceive && (
                <button
                  type="button"
                  className="btn btn--ghost purchase-actions__button"
                  onClick={() =>
                    setConfirmAction({
                      title: "Record Receiving",
                      message: "This will update inventory stock levels and record the received quantities. Continue?",
                      confirmLabel: "Record Receiving",
                      onConfirm: recordReceiving,
                    })
                  }
                  disabled={saving}
                >
                  Record Receiving
                </button>
              )}
              {canRecordPayment && (
                <button
                  type="button"
                  className="btn btn--ghost purchase-actions__button purchase-actions__button--payment"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={saving}
                >
                  <CreditCard size={14} /> Record Payment
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="btn btn--ghost purchase-actions__button purchase-actions__button--danger"
                  onClick={() =>
                    setConfirmAction({
                      title: "Cancel Purchase Order",
                      message: `Are you sure you want to cancel ${selectedOrder?.po_number}? This action cannot be undone.`,
                      confirmLabel: "Cancel PO",
                      danger: true,
                      onConfirm: cancelPurchaseOrder,
                    })
                  }
                  disabled={saving}
                >
                  <XCircle size={14} /> Cancel PO
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

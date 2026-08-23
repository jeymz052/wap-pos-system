"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  LoaderCircle,
  PackageOpen,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatReturnLabel,
  parseNumber,
  refundMethodOptions,
  stockActionOptions,
} from "@/lib/returns";

type BranchRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type UserRow = {
  id: string;
  auth_id?: string | null;
  branch_id?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  branch_id?: string | null;
  store_credit_balance?: string | number | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
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

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  returned_quantity?: number | null;
  unit_price: string | number;
};

type ReturnRow = {
  id: string;
  return_number: string;
  sale_id?: string | null;
  sale_invoice_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  branch_id: string;
  status: string;
  request_type?: string | null;
  search_mode?: string | null;
  reason: string;
  refund_method?: string | null;
  refund_amount?: string | number | null;
  store_credit?: string | number | null;
  stock_handling?: string | null;
  approval_required?: boolean | null;
  approval_notes?: string | null;
  rejection_reason?: string | null;
  exchange_reference_no?: string | null;
  exchange_sale_id?: string | null;
  exchange_items?: Array<{ productId: string; quantity: number; notes?: string }> | null;
  requested_by?: string | null;
  approved_by?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  refunded_at?: string | null;
  exchanged_at?: string | null;
  warranty_started_at?: string | null;
  processed_at?: string | null;
  notes?: string | null;
  created_at: string;
};

type ReturnItemRow = {
  id: string;
  return_id: string;
  product_id: string;
  sale_item_id?: string | null;
  quantity: number;
  approved_quantity?: number | null;
  unit_price: string | number;
  condition?: string | null;
  stock_action?: string | null;
  exchange_product_id?: string | null;
  exchange_quantity?: number | null;
  warranty_record_id?: string | null;
  warranty_claim_id?: string | null;
  notes?: string | null;
};

type WarrantyClaimRow = {
  id: string;
  claim_number?: string | null;
  return_id?: string | null;
  product_id: string;
  customer_id?: string | null;
  status?: string | null;
  claim_date: string;
  description?: string | null;
  resolution?: string | null;
  created_at: string;
};

type SearchSaleResult = SaleRow & {
  customerName: string;
};

type DraftReturnItem = {
  saleItemId: string;
  productId: string;
  productName: string;
  sku: string;
  soldQuantity: number;
  availableQuantity: number;
  unitPrice: number;
  selected: boolean;
  returnQuantity: number;
  condition: string;
  stockAction: string;
};

type ApprovalDraft = Record<string, { approvedQuantity: number; stockAction: string }>;
type ExchangeDraft = { productId: string; quantity: number; notes: string };

function getUserName(user?: UserRow | null) {
  if (!user) return "-";
  const fullName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
  return fullName || user.username?.trim() || "User";
}

function getStatusTone(status: string) {
  if (status === "requested") return "amber";
  if (status === "approved") return "blue";
  if (status === "rejected") return "red";
  if (status === "refunded") return "green";
  if (status === "exchanged") return "violet";
  return "slate";
}

export default function ReturnsManagementClient() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
  const [returnsData, setReturnsData] = useState<ReturnRow[]>([]);
  const [returnItems, setReturnItems] = useState<ReturnItemRow[]>([]);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimRow[]>([]);

  const [searchMode, setSearchMode] = useState("receipt");
  const [searchQuery, setSearchQuery] = useState("");
  const [saleResults, setSaleResults] = useState<SearchSaleResult[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [draftItems, setDraftItems] = useState<DraftReturnItem[]>([]);
  const [requestType, setRequestType] = useState("refund");
  const [reason, setReason] = useState("Wrong part ordered");
  const [requestNotes, setRequestNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [stockHandling, setStockHandling] = useState("restock");

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft>({});
  const [actionNotes, setActionNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approverUsername, setApproverUsername] = useState("");
  const [approverPin, setApproverPin] = useState("");
  const [refundReferenceNo, setRefundReferenceNo] = useState("");
  const [exchangeReferenceNo, setExchangeReferenceNo] = useState("");
  const [exchangeDraft, setExchangeDraft] = useState<ExchangeDraft>({ productId: "", quantity: 1, notes: "" });
  const [exchangeItemsDraft, setExchangeItemsDraft] = useState<ExchangeDraft[]>([]);

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
          setError("Please sign in to manage returns.");
          setLoading(false);
        }
        return;
      }

      const [profileResult, branchesResult] = await Promise.all([
        supabase
          .from("users")
          .select("id, auth_id, branch_id, username, first_name, last_name")
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
      if (profileResult.error || branchesResult.error) {
        setError(profileResult.error?.message || branchesResult.error?.message || "Unable to initialize returns workspace.");
        setLoading(false);
        return;
      }

      const profile = profileResult.data as UserRow | null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
      const defaultBranch =
        branchRows.find((branch) => branch.id === savedBranchId) ??
        branchRows.find((branch) => branch.id === profile?.branch_id) ??
        branchRows.find((branch) => branch.is_main) ??
        branchRows[0];

      setCurrentUserId(profile?.id ?? "");
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
        usersResult,
        customersResult,
        productsResult,
        salesResult,
        saleItemsResult,
        returnsResult,
        returnItemsResult,
        claimsResult,
      ] = await Promise.all([
        supabase.from("users").select("id, auth_id, branch_id, username, first_name, last_name").order("username", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, branch_id, store_credit_balance")
          .eq("branch_id", selectedBranchId)
          .order("name", { ascending: true }),
        supabase.from("products").select("id, name, sku").order("name", { ascending: true }),
        supabase
          .from("sales")
          .select("id, invoice_number, customer_id, branch_id, total_amount, status, created_at")
          .eq("branch_id", selectedBranchId)
          .eq("status", "completed")
          .order("created_at", { ascending: false }),
        supabase
          .from("sale_items")
          .select("id, sale_id, product_id, quantity, returned_quantity, unit_price")
          .order("id", { ascending: true }),
        supabase
          .from("returns")
          .select("id, return_number, sale_id, sale_invoice_number, customer_id, customer_name, branch_id, status, request_type, search_mode, reason, refund_method, refund_amount, store_credit, stock_handling, approval_required, approval_notes, rejection_reason, exchange_reference_no, exchange_sale_id, exchange_items, requested_by, approved_by, requested_at, approved_at, rejected_at, refunded_at, exchanged_at, warranty_started_at, processed_at, notes, created_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("return_items")
          .select("id, return_id, product_id, sale_item_id, quantity, approved_quantity, unit_price, condition, stock_action, exchange_product_id, exchange_quantity, warranty_record_id, warranty_claim_id, notes")
          .order("id", { ascending: true }),
        supabase
          .from("warranty_claims")
          .select("id, claim_number, return_id, product_id, customer_id, status, claim_date, description, resolution, created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

      if (
        usersResult.error ||
        customersResult.error ||
        productsResult.error ||
        salesResult.error ||
        saleItemsResult.error ||
        returnsResult.error ||
        returnItemsResult.error ||
        claimsResult.error
      ) {
        setError(
          usersResult.error?.message ||
            customersResult.error?.message ||
            productsResult.error?.message ||
            salesResult.error?.message ||
            saleItemsResult.error?.message ||
            returnsResult.error?.message ||
            returnItemsResult.error?.message ||
            claimsResult.error?.message ||
            "Unable to load returns workspace."
        );
        setLoading(false);
        return;
      }

      const returnRows = (returnsResult.data ?? []) as ReturnRow[];

      setUsers((usersResult.data ?? []) as UserRow[]);
      setCustomers((customersResult.data ?? []) as CustomerRow[]);
      setProducts((productsResult.data ?? []) as ProductRow[]);
      setSales((salesResult.data ?? []) as SaleRow[]);
      setSaleItems((saleItemsResult.data ?? []) as SaleItemRow[]);
      setReturnsData(returnRows);
      setReturnItems((returnItemsResult.data ?? []) as ReturnItemRow[]);
      setWarrantyClaims((claimsResult.data ?? []) as WarrantyClaimRow[]);
      if (returnRows[0]) {
        setSelectedReturnId((current) => current || returnRows[0].id);
      }
      setLoading(false);
    };

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, [refreshKey, selectedBranchId]);

  const userMap = new Map(users.map((user) => [user.id, user]));
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const saleMap = new Map(sales.map((sale) => [sale.id, sale]));

  const filteredReturns = returnsData.filter((item) => statusFilter === "all" || item.status === statusFilter);
  const activeReturnId = selectedReturnId || filteredReturns[0]?.id || returnsData[0]?.id || "";
  const selectedReturn = filteredReturns.find((item) => item.id === activeReturnId) ?? returnsData.find((item) => item.id === activeReturnId) ?? null;
  const selectedReturnItems = selectedReturn ? returnItems.filter((item) => item.return_id === selectedReturn.id) : [];
  const selectedClaims = selectedReturn ? warrantyClaims.filter((item) => item.return_id === selectedReturn.id) : [];

  const requestedCount = returnsData.filter((item) => item.status === "requested").length;
  const approvedCount = returnsData.filter((item) => item.status === "approved").length;
  const refundedCount = returnsData.filter((item) => item.status === "refunded").length;
  const warrantyCount = returnsData.filter((item) => item.status === "warranty_processing").length;

  const selectedDraftItems = draftItems.filter((item) => item.selected);
  const draftRefundAmount = selectedDraftItems.reduce((sum, item) => sum + item.unitPrice * item.returnQuantity, 0);

  async function handleSaleSearch() {
    if (!searchQuery.trim()) {
      setSaleResults([]);
      return;
    }

    setLoading(true);
    setError("");

    if (searchMode === "receipt") {
      const result = await supabase
        .from("sales")
        .select("id, invoice_number, customer_id, branch_id, total_amount, status, created_at")
        .eq("branch_id", selectedBranchId)
        .eq("status", "completed")
        .ilike("invoice_number", `%${searchQuery.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(12);

      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      const rows = (result.data ?? []) as SaleRow[];
      setSaleResults(
        rows.map((sale) => ({
          ...sale,
          customerName: sale.customer_id ? customerMap.get(sale.customer_id)?.name ?? "Walk-in Customer" : "Walk-in Customer",
        }))
      );
      setLoading(false);
      return;
    }

    const customerResult = await supabase
      .from("customers")
      .select("id, name")
      .eq("branch_id", selectedBranchId)
      .ilike("name", `%${searchQuery.trim()}%`)
      .limit(15);

    if (customerResult.error) {
      setError(customerResult.error.message);
      setLoading(false);
      return;
    }

    const customerIds = ((customerResult.data ?? []) as CustomerRow[]).map((customer) => customer.id);
    if (!customerIds.length) {
      setSaleResults([]);
      setLoading(false);
      return;
    }

    const salesResult = await supabase
      .from("sales")
      .select("id, invoice_number, customer_id, branch_id, total_amount, status, created_at")
      .eq("branch_id", selectedBranchId)
      .eq("status", "completed")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(20);

    if (salesResult.error) {
      setError(salesResult.error.message);
      setLoading(false);
      return;
    }

    const rows = (salesResult.data ?? []) as SaleRow[];
    setSaleResults(
      rows.map((sale) => ({
        ...sale,
        customerName: sale.customer_id ? customerMap.get(sale.customer_id)?.name ?? "Walk-in Customer" : "Walk-in Customer",
      }))
    );
    setLoading(false);
  }

  function selectSale(saleId: string) {
    setSelectedSaleId(saleId);
    const sourceItems = saleItems.filter((item) => item.sale_id === saleId);
    setDraftItems(
      sourceItems
        .map((item) => {
          const soldQuantity = Number(item.quantity ?? 0);
          const availableQuantity = Math.max(0, soldQuantity - Number(item.returned_quantity ?? 0));
          const product = productMap.get(item.product_id);
          return {
            saleItemId: item.id,
            productId: item.product_id,
            productName: product?.name ?? "Unknown Product",
            sku: product?.sku ?? "",
            soldQuantity,
            availableQuantity,
            unitPrice: parseNumber(item.unit_price),
            selected: false,
            returnQuantity: availableQuantity > 0 ? 1 : 0,
            condition: "good",
            stockAction: "restock",
          };
        })
        .filter((item) => item.availableQuantity > 0)
    );
  }

  function updateDraftItem(index: number, field: keyof DraftReturnItem, value: boolean | number | string) {
    setDraftItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  async function submitReturnRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserId) {
      setError("Unable to resolve the current user.");
      return;
    }

    if (!selectedSaleId || !selectedDraftItems.length) {
      setError("Select a sale and at least one item to continue.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const selectedSale = saleMap.get(selectedSaleId);
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: selectedBranchId,
          cashierId: currentUserId,
          saleId: selectedSaleId,
          customerId: selectedSale?.customer_id ?? null,
          searchMode,
          requestType,
          reason,
          notes: requestNotes,
          refundMethod,
          refundAmount: requestType === "refund" ? draftRefundAmount : 0,
          storeCredit: refundMethod === "customer_credit" ? draftRefundAmount : 0,
          approvalRequired: requestType === "refund" || requestType === "exchange",
          stockHandling,
          items: selectedDraftItems.map((item) => ({
            productId: item.productId,
            saleItemId: item.saleItemId,
            quantity: item.returnQuantity,
            unitPrice: item.unitPrice,
            condition: item.condition,
            stockAction: item.stockAction,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create the return request.");

      setNotice(payload.message || "Return request created.");
      setSelectedSaleId("");
      setDraftItems([]);
      setSearchQuery("");
      setSaleResults([]);
      setRequestNotes("");
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function runReturnAction(action: string) {
    if (!selectedReturn || !currentUserId) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnId: selectedReturn.id,
          action,
          actorId: currentUserId,
          notes: actionNotes,
          rejectionReason,
          refundMethod,
          refundAmount: parseNumber(selectedReturn.refund_amount) || selectedReturnItems.reduce((sum, item) => sum + parseNumber(item.unit_price) * Number(item.approved_quantity ?? item.quantity ?? 0), 0),
          storeCredit: refundMethod === "customer_credit"
            ? parseNumber(selectedReturn.refund_amount) || selectedReturnItems.reduce((sum, item) => sum + parseNumber(item.unit_price) * Number(item.approved_quantity ?? item.quantity ?? 0), 0)
            : 0,
          refundReferenceNo,
          exchangeReferenceNo,
          exchangeItems: exchangeItemsDraft,
          approverUsername,
          approverPin,
          itemApprovals: selectedReturnItems.map((item) => ({
            returnItemId: item.id,
            approvedQuantity: approvalDraft[item.id]?.approvedQuantity ?? Number(item.quantity),
            stockAction: approvalDraft[item.id]?.stockAction ?? item.stock_action ?? selectedReturn.stock_handling ?? "restock",
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update return request.");

      setNotice(payload.message || "Return updated.");
      setApproverUsername("");
      setApproverPin("");
      setActionNotes("");
      setRejectionReason("");
      setRefundReferenceNo("");
      setExchangeReferenceNo("");
      setExchangeItemsDraft([]);
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function addExchangeItem() {
    if (!exchangeDraft.productId || exchangeDraft.quantity <= 0) return;
    setExchangeItemsDraft((current) => [...current, exchangeDraft]);
    setExchangeDraft({ productId: "", quantity: 1, notes: "" });
  }

  function handleSelectReturn(item: ReturnRow) {
    setSelectedReturnId(item.id);
    setRefundMethod(item.refund_method ?? "cash");
    setActionNotes(item.approval_notes ?? "");
    setRejectionReason(item.rejection_reason ?? "");

    const nextDraft: ApprovalDraft = {};
    returnItems
      .filter((returnItem) => returnItem.return_id === item.id)
      .forEach((returnItem) => {
        nextDraft[returnItem.id] = {
          approvedQuantity: Number(returnItem.approved_quantity ?? returnItem.quantity),
          stockAction: returnItem.stock_action ?? item.stock_handling ?? "restock",
        };
      });

    setApprovalDraft(nextDraft);
  }

  return (
    <div className="returns-workspace">
      <section className="returns-hero">
        <div>
          <span className="returns-hero__eyebrow">Module 10</span>
          <h1>Returns, Refunds & Warranty</h1>
          <p>Search by receipt or customer, route approvals, finalize refunds or exchanges, and track warranty claims from one desk.</p>
        </div>

      </section>

      <section className="returns-kpis">
        <article className="returns-kpi">
          <RotateCcw size={18} />
          <div><span>Requested</span><strong>{requestedCount}</strong></div>
        </article>
        <article className="returns-kpi">
          <ShieldCheck size={18} />
          <div><span>Approved</span><strong>{approvedCount}</strong></div>
        </article>
        <article className="returns-kpi">
          <Wallet size={18} />
          <div><span>Refunded</span><strong>{refundedCount}</strong></div>
        </article>
        <article className="returns-kpi">
          <Wrench size={18} />
          <div><span>Warranty</span><strong>{warrantyCount}</strong></div>
        </article>
      </section>

      {error ? <div className="returns-alert returns-alert--error"><AlertTriangle size={16} /> {error}</div> : null}
      {notice ? <div className="returns-alert returns-alert--success"><BadgeCheck size={16} /> {notice}</div> : null}

      <section className="returns-grid">
        <article className="returns-panel">
          <div className="returns-panel__head">
            <div>
              <h2>New Return Request</h2>
              <p>Start from a completed sale and capture the return reason, disposition, and requested outcome.</p>
            </div>
          </div>

          <div className="returns-search">
            <label>
              <span>Search by</span>
              <select value={searchMode} onChange={(event) => setSearchMode(event.target.value)}>
                <option value="receipt">Receipt Number</option>
                <option value="customer">Customer Name</option>
              </select>
            </label>
            <label className="returns-search__grow">
              <span>Search</span>
              <div className="returns-search__input">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={searchMode === "receipt" ? "INV-..." : "Customer name"}
                />
                <button type="button" onClick={() => void handleSaleSearch()} disabled={loading}>
                  <Search size={15} />
                </button>
              </div>
            </label>
          </div>

          <div className="returns-sale-results">
            {!saleResults.length ? <div className="returns-empty">Search for a completed sale to begin.</div> : null}
            {saleResults.map((sale) => (
              <button
                key={sale.id}
                type="button"
                className={`returns-sale-card ${selectedSaleId === sale.id ? "returns-sale-card--active" : ""}`}
                onClick={() => selectSale(sale.id)}
              >
                <strong>{sale.invoice_number}</strong>
                <span>{sale.customerName}</span>
                <span>{formatCurrency(parseNumber(sale.total_amount))} • {formatDateTime(sale.created_at)}</span>
              </button>
            ))}
          </div>

          <form className="returns-form" onSubmit={submitReturnRequest}>
            <div className="returns-form__grid">
              <label>
                <span>Request Type</span>
                <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                  <option value="refund">Refund</option>
                  <option value="exchange">Exchange</option>
                  <option value="warranty">Warranty</option>
                </select>
              </label>
              <label>
                <span>Reason</span>
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="Wrong part ordered">Wrong part ordered</option>
                  <option value="Defective item">Defective item</option>
                  <option value="Changed mind">Changed mind</option>
                  <option value="Damaged item">Damaged item</option>
                  <option value="Warranty claim">Warranty claim</option>
                </select>
              </label>
              <label>
                <span>Refund Method</span>
                <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>
                  {refundMethodOptions.map((option) => (
                    <option key={option} value={option}>{formatReturnLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Default Stock Handling</span>
                <select value={stockHandling} onChange={(event) => setStockHandling(event.target.value)}>
                  {stockActionOptions.map((option) => (
                    <option key={option} value={option}>{formatReturnLabel(option)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Request Notes</span>
              <textarea value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} rows={3} />
            </label>

            <div className="returns-line-items">
              {!draftItems.length ? <div className="returns-empty">Select a sale to load returnable items.</div> : null}
              {draftItems.map((item, index) => (
                <div key={item.saleItemId} className={`returns-line-item ${item.selected ? "returns-line-item--selected" : ""}`}>
                  <label className="returns-line-item__toggle">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) => updateDraftItem(index, "selected", event.target.checked)}
                    />
                    <div>
                      <strong>{item.productName}</strong>
                      <span>{item.sku || "No SKU"} • Sold {item.soldQuantity} • Available {item.availableQuantity}</span>
                    </div>
                  </label>

                  {item.selected ? (
                    <div className="returns-line-item__edit">
                      <label>
                        <span>Qty</span>
                        <input
                          type="number"
                          min="1"
                          max={item.availableQuantity}
                          value={item.returnQuantity}
                          onChange={(event) => updateDraftItem(index, "returnQuantity", Math.min(item.availableQuantity, Math.max(1, Number(event.target.value) || 1)))}
                        />
                      </label>
                      <label>
                        <span>Condition</span>
                        <select value={item.condition} onChange={(event) => updateDraftItem(index, "condition", event.target.value)}>
                          <option value="good">Good</option>
                          <option value="damaged">Damaged</option>
                          <option value="defective">Defective</option>
                        </select>
                      </label>
                      <label>
                        <span>Stock Handling</span>
                        <select value={item.stockAction} onChange={(event) => updateDraftItem(index, "stockAction", event.target.value)}>
                          {stockActionOptions.map((option) => (
                            <option key={option} value={option}>{formatReturnLabel(option)}</option>
                          ))}
                        </select>
                      </label>
                      <div className="returns-line-item__price">{formatCurrency(item.unitPrice * item.returnQuantity)}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="returns-form__foot">
              <div className="returns-form__summary">
                <span>Requested refund/store credit</span>
                <strong>{formatCurrency(draftRefundAmount)}</strong>
              </div>
              <button type="submit" className="returns-button returns-button--primary" disabled={saving || !selectedDraftItems.length}>
                {saving ? "Submitting..." : "Create Return Request"}
              </button>
            </div>
          </form>
        </article>

        <article className="returns-panel">
          <div className="returns-panel__head">
            <div>
              <h2>Return Queue</h2>
              <p>Review approvals, finalize payouts or exchanges, and start warranty processing.</p>
            </div>
            <label>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                <option value="requested">Requested</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="refunded">Refunded</option>
                <option value="exchanged">Exchanged</option>
                <option value="warranty_processing">Warranty Processing</option>
              </select>
            </label>
          </div>

          <div className="returns-queue">
            <div className="returns-queue__list">
              {!filteredReturns.length ? <div className="returns-empty">No return requests match this filter.</div> : null}
              {filteredReturns.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`returns-request ${activeReturnId === item.id ? "returns-request--active" : ""}`}
                  onClick={() => handleSelectReturn(item)}
                >
                  <div className="returns-request__top">
                    <strong>{item.return_number}</strong>
                    <span className={`returns-badge returns-badge--${getStatusTone(item.status)}`}>{formatReturnLabel(item.status)}</span>
                  </div>
                  <span>{item.sale_invoice_number || saleMap.get(item.sale_id ?? "")?.invoice_number || "Manual return"}</span>
                  <span>{item.customer_name || customerMap.get(item.customer_id ?? "")?.name || "Walk-in Customer"}</span>
                  <span>{formatReturnLabel(item.request_type)} • {formatCurrency(parseNumber(item.refund_amount))}</span>
                </button>
              ))}
            </div>

            <div className="returns-queue__detail">
              {!selectedReturn ? (
                <div className="returns-empty">Select a return request to review it.</div>
              ) : (
                <>
                  <div className="returns-detail__hero">
                    <div>
                      <h3>{selectedReturn.return_number}</h3>
                      <p>{selectedReturn.sale_invoice_number || saleMap.get(selectedReturn.sale_id ?? "")?.invoice_number || "Manual return"} • {selectedReturn.customer_name || customerMap.get(selectedReturn.customer_id ?? "")?.name || "Walk-in Customer"}</p>
                    </div>
                    <span className={`returns-badge returns-badge--${getStatusTone(selectedReturn.status)}`}>{formatReturnLabel(selectedReturn.status)}</span>
                  </div>

                  <div className="returns-detail__meta">
                    <div><span>Requested</span><strong>{formatDateTime(selectedReturn.requested_at || selectedReturn.created_at)}</strong></div>
                    <div><span>Requested By</span><strong>{getUserName(userMap.get(selectedReturn.requested_by ?? ""))}</strong></div>
                    <div><span>Outcome</span><strong>{formatReturnLabel(selectedReturn.request_type)}</strong></div>
                    <div><span>Reason</span><strong>{selectedReturn.reason}</strong></div>
                  </div>

                  <div className="returns-detail__items">
                    {selectedReturnItems.map((item) => (
                      <div key={item.id} className="returns-detail-item">
                        <div>
                          <strong>{productMap.get(item.product_id)?.name || item.product_id}</strong>
                          <span>{productMap.get(item.product_id)?.sku || "No SKU"} • {formatReturnLabel(item.condition)} • {formatReturnLabel(item.stock_action)}</span>
                        </div>
                        <div>
                          <strong>{item.approved_quantity ?? item.quantity} / {item.quantity}</strong>
                          <span>{formatCurrency(parseNumber(item.unit_price) * Number(item.approved_quantity ?? item.quantity ?? 0))}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedReturn.status === "requested" ? (
                    <div className="returns-action-card">
                      <h4>Approval Required</h4>
                      <p>Supervisor approval is required before a refund, exchange, or warranty disposition can proceed.</p>
                      <div className="returns-form__grid">
                        {selectedReturnItems.map((item) => (
                          <label key={item.id}>
                            <span>{productMap.get(item.product_id)?.sku || "Item"} approved qty</span>
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={approvalDraft[item.id]?.approvedQuantity ?? item.quantity}
                              onChange={(event) =>
                                setApprovalDraft((current) => ({
                                  ...current,
                                  [item.id]: {
                                    approvedQuantity: Math.min(item.quantity, Math.max(0, Number(event.target.value) || 0)),
                                    stockAction: current[item.id]?.stockAction ?? item.stock_action ?? selectedReturn.stock_handling ?? "restock",
                                  },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="returns-form__grid">
                        <label>
                          <span>Approver Username</span>
                          <input value={approverUsername} onChange={(event) => setApproverUsername(event.target.value)} />
                        </label>
                        <label>
                          <span>Approver PIN</span>
                          <input type="password" value={approverPin} onChange={(event) => setApproverPin(event.target.value)} />
                        </label>
                      </div>
                      <label>
                        <span>Approval Notes</span>
                        <textarea value={actionNotes} onChange={(event) => setActionNotes(event.target.value)} rows={3} />
                      </label>
                      <label>
                        <span>Rejection Reason</span>
                        <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={2} />
                      </label>
                      <div className="returns-action-card__actions">
                        <button type="button" className="returns-button returns-button--primary" disabled={saving} onClick={() => void runReturnAction("approve")}>Approve</button>
                        <button type="button" className="returns-button returns-button--danger" disabled={saving} onClick={() => void runReturnAction("reject")}>Reject</button>
                      </div>
                    </div>
                  ) : null}

                  {selectedReturn.status === "approved" ? (
                    <div className="returns-action-card">
                      <h4>Finalize Outcome</h4>
                      <div className="returns-form__grid">
                        <label>
                          <span>Refund Method</span>
                          <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>
                            {refundMethodOptions.map((option) => (
                              <option key={option} value={option}>{formatReturnLabel(option)}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Refund Reference</span>
                          <input value={refundReferenceNo} onChange={(event) => setRefundReferenceNo(event.target.value)} placeholder="Cash slip, card reversal, wallet ref" />
                        </label>
                        <label>
                          <span>Exchange Reference</span>
                          <input value={exchangeReferenceNo} onChange={(event) => setExchangeReferenceNo(event.target.value)} placeholder="Exchange memo or new invoice" />
                        </label>
                      </div>
                      <label>
                        <span>Finalization Notes</span>
                        <textarea value={actionNotes} onChange={(event) => setActionNotes(event.target.value)} rows={3} />
                      </label>

                      <div className="returns-exchange-builder">
                        <div className="returns-exchange-builder__head">
                          <strong>Exchange Items</strong>
                          <span>Add replacement items if this request will be completed as an exchange.</span>
                        </div>
                        <div className="returns-form__grid">
                          <label>
                            <span>Replacement Product</span>
                            <select value={exchangeDraft.productId} onChange={(event) => setExchangeDraft((current) => ({ ...current, productId: event.target.value }))}>
                              <option value="">Select product</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Qty</span>
                            <input type="number" min="1" value={exchangeDraft.quantity} onChange={(event) => setExchangeDraft((current) => ({ ...current, quantity: Math.max(1, Number(event.target.value) || 1) }))} />
                          </label>
                          <label>
                            <span>Notes</span>
                            <input value={exchangeDraft.notes} onChange={(event) => setExchangeDraft((current) => ({ ...current, notes: event.target.value }))} />
                          </label>
                        </div>
                        <button type="button" className="returns-button returns-button--secondary" onClick={addExchangeItem}>Add Exchange Item</button>
                        <div className="returns-exchange-list">
                          {exchangeItemsDraft.map((item, index) => (
                            <div key={`${item.productId}-${index}`} className="returns-detail-item">
                              <div>
                                <strong>{productMap.get(item.productId)?.name || item.productId}</strong>
                                <span>{item.notes || "Replacement stock"}</span>
                              </div>
                              <div>
                                <strong>{item.quantity}</strong>
                                <span>{productMap.get(item.productId)?.sku || ""}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="returns-action-card__actions">
                        <button type="button" className="returns-button returns-button--primary" disabled={saving} onClick={() => void runReturnAction("finalize_refund")}>
                          <CreditCard size={15} /> Finalize Refund
                        </button>
                        <button type="button" className="returns-button returns-button--secondary" disabled={saving} onClick={() => void runReturnAction("finalize_exchange")}>
                          <PackageOpen size={15} /> Finalize Exchange
                        </button>
                        <button type="button" className="returns-button returns-button--secondary" disabled={saving} onClick={() => void runReturnAction("finalize_warranty")}>
                          <Wrench size={15} /> Start Warranty Claim
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selectedClaims.length ? (
                    <div className="returns-claims">
                      <h4>Warranty Claims</h4>
                      {selectedClaims.map((claim) => (
                        <div key={claim.id} className="returns-detail-item">
                          <div>
                            <strong>{claim.claim_number || claim.id}</strong>
                            <span>{productMap.get(claim.product_id)?.name || claim.product_id} • {formatDate(claim.claim_date)}</span>
                          </div>
                          <div>
                            <strong>{formatReturnLabel(claim.status)}</strong>
                            <span>{claim.description || "No description"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </article>
      </section>

      {loading ? (
        <div className="returns-loading">
          <LoaderCircle size={18} className="returns-spin" />
          <span>Loading returns workspace...</span>
        </div>
      ) : null}

      <section className="returns-footer">
        <article className="returns-footer__card">
          <UserRound size={18} />
          <div>
            <strong>Store Credit Visibility</strong>
            <span>
              {customers.length
                ? `Tracked customers currently hold ${formatCurrency(customers.reduce((sum, customer) => sum + parseNumber(customer.store_credit_balance), 0))} in store credit.`
                : "Customer store credit balances will appear here after the migration is applied."}
            </span>
          </div>
        </article>
        <article className="returns-footer__card">
          <Wallet size={18} />
          <div>
            <strong>Refund Controls</strong>
            <span>Refund outcomes stay pending until approval and can be paid back to cash, card, wallet, or store credit.</span>
          </div>
        </article>
      </section>
    </div>
  );
}

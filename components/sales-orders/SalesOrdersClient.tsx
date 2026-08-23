"use client";

import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  BadgePercent,
  MessageCircle,
  FileCheck2,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  PackageCheck,
  Printer,
  RefreshCcw,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildQuotationEmailHtml,
  formatCurrency,
  formatDate,
  formatLabel,
  parseNumber,
  resolveLinePricing,
  type BulkPricingRow,
  type CustomerPricingRow,
  type PricingCustomer,
  type PricingProduct,
} from "@/lib/sales-orders";
import { useRbac } from "@/components/RbacProvider";

type BranchRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type UserRow = {
  id: string;
  branch_id?: string | null;
};

type CustomerRow = PricingCustomer & {
  id: string;
  name: string;
  branch_id?: string | null;
  contact_number?: string | null;
};

type ProductRow = PricingProduct & {
  id: string;
  name: string;
  sku: string;
};

type QuotationRow = {
  id: string;
  quote_number: string;
  branch_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  status: string;
  valid_until?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  notes?: string | null;
  converted_to_sale_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
  converted_at?: string | null;
  created_at: string;
};

type QuotationItemRow = {
  id: string;
  quotation_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  line_discount_amount?: number | string | null;
  total_price: number | string;
  price_source?: string | null;
  pricing_notes?: string | null;
  notes?: string | null;
};

type SalesOrderRow = {
  id: string;
  order_number: string;
  branch_id: string;
  customer_id?: string | null;
  quotation_id?: string | null;
  status: string;
  expected_fulfillment_date?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  notes?: string | null;
  converted_to_sale_id?: string | null;
  created_at: string;
};

type SalesOrderItemRow = {
  id: string;
  sales_order_id: string;
  product_id: string;
  quantity: number;
  reserved_quantity?: number | null;
  fulfilled_quantity?: number | null;
  unit_price?: number | string | null;
  line_discount_amount?: number | string | null;
  total_price?: number | string | null;
  price_source?: string | null;
  pricing_notes?: string | null;
  notes?: string | null;
};

type ReservationSummaryRow = {
  branch_id: string;
  product_id: string;
  active_reservation_count?: number | null;
  reserved_quantity?: number | string | null;
};

type InventoryStockRow = {
  branch_id: string;
  product_id: string;
  quantity: number;
};

type EmailLogRow = {
  id: string;
  quotation_id: string;
  recipient_email: string;
  status: string;
  sent_at?: string | null;
  created_at: string;
};

type DraftLine = {
  id: string;
  productId: string;
  quantity: number;
  notes: string;
};

type WorkspaceTab = "quotations" | "sales_orders";
type DraftDocumentType = "quotation" | "sales_order";

function plusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createDraftLine(): DraftLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    quantity: 1,
    notes: "",
  };
}

export default function SalesOrdersClient() {
  const { canAny } = useRbac();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [quotationItems, setQuotationItems] = useState<QuotationItemRow[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderRow[]>([]);
  const [salesOrderItems, setSalesOrderItems] = useState<SalesOrderItemRow[]>([]);
  const [inventoryStocks, setInventoryStocks] = useState<InventoryStockRow[]>([]);
  const [reservationSummary, setReservationSummary] = useState<ReservationSummaryRow[]>([]);
  const [customerPricing, setCustomerPricing] = useState<CustomerPricingRow[]>([]);
  const [bulkPricing, setBulkPricing] = useState<BulkPricingRow[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("quotations");
  const [documentType, setDocumentType] = useState<DraftDocumentType>("quotation");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState(plusDays(7));
  const [expectedFulfillmentDate, setExpectedFulfillmentDate] = useState(plusDays(3));
  const [draftNotes, setDraftNotes] = useState("");
  const [reserveOnCreate, setReserveOnCreate] = useState(true);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([createDraftLine()]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");

  const deferredSearch = useDeferredValue(search);

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
          setError("Please sign in to manage quotations and sales orders.");
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
      if (profileResult.error || branchesResult.error) {
        setError(profileResult.error?.message || branchesResult.error?.message || "Unable to initialize quotes and orders.");
        setLoading(false);
        return;
      }

      const profile = (profileResult.data as UserRow | null) ?? null;
      const branchRows = (branchesResult.data ?? []) as BranchRow[];
      const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
      const defaultBranch =
        branchRows.find((branch) => branch.id === savedBranchId) ??
        branchRows.find((branch) => branch.id === profile?.branch_id) ??
        branchRows.find((branch) => branch.is_main) ??
        branchRows[0];

      setBranches(branchRows);
      setCurrentUserId(profile?.id ?? "");
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
        productsResult,
        quotationsResult,
        quotationItemsResult,
        salesOrdersResult,
        salesOrderItemsResult,
        inventoryStocksResult,
        reservationSummaryResult,
        customerPricingResult,
        bulkPricingResult,
        emailLogsResult,
      ] = await Promise.all([
        supabase.from("customers").select("id, name, email, customer_type, branch_id, contact_number").eq("branch_id", selectedBranchId).order("name"),
        supabase.from("products").select("id, name, sku, selling_price, wholesale_price").order("name"),
        supabase
          .from("quotations")
          .select("id, quote_number, branch_id, customer_id, customer_name, customer_email, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, notes, converted_to_sale_id, approved_by, approved_at, sent_at, converted_at, created_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("quotation_items")
          .select("id, quotation_id, product_id, quantity, unit_price, line_discount_amount, total_price, price_source, pricing_notes, notes")
          .order("created_at", { ascending: true }),
        supabase
          .from("sales_orders")
          .select("id, order_number, branch_id, customer_id, quotation_id, status, expected_fulfillment_date, subtotal, discount_amount, tax_amount, total_amount, notes, converted_to_sale_id, created_at")
          .eq("branch_id", selectedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("sales_order_items")
          .select("id, sales_order_id, product_id, quantity, reserved_quantity, fulfilled_quantity, unit_price, line_discount_amount, total_price, price_source, pricing_notes, notes")
          .order("created_at", { ascending: true }),
        supabase.from("inventory_stocks").select("branch_id, product_id, quantity").eq("branch_id", selectedBranchId),
        supabase.from("v_stock_reservation_summary").select("branch_id, product_id, active_reservation_count, reserved_quantity").eq("branch_id", selectedBranchId),
        supabase.from("customer_product_pricing").select("id, customer_id, product_id, price_type, fixed_price, discount_percent, minimum_quantity, effective_from, effective_to, is_active, notes").eq("is_active", true),
        supabase.from("product_bulk_pricing").select("id, product_id, minimum_quantity, unit_price, discount_percent, customer_type, is_active, notes").eq("is_active", true),
        supabase.from("quotation_email_logs").select("id, quotation_id, recipient_email, status, sent_at, created_at").order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

      const workspaceError =
        customersResult.error ||
        productsResult.error ||
        quotationsResult.error ||
        quotationItemsResult.error ||
        salesOrdersResult.error ||
        salesOrderItemsResult.error ||
        inventoryStocksResult.error ||
        reservationSummaryResult.error ||
        customerPricingResult.error ||
        bulkPricingResult.error ||
        emailLogsResult.error;

      if (workspaceError) {
        setError(workspaceError.message || "Unable to load quotes and orders data.");
        setLoading(false);
        return;
      }

      setCustomers((customersResult.data ?? []) as CustomerRow[]);
      setProducts((productsResult.data ?? []) as ProductRow[]);
      setQuotations((quotationsResult.data ?? []) as QuotationRow[]);
      setQuotationItems((quotationItemsResult.data ?? []) as QuotationItemRow[]);
      setSalesOrders((salesOrdersResult.data ?? []) as SalesOrderRow[]);
      setSalesOrderItems((salesOrderItemsResult.data ?? []) as SalesOrderItemRow[]);
      setInventoryStocks((inventoryStocksResult.data ?? []) as InventoryStockRow[]);
      setReservationSummary((reservationSummaryResult.data ?? []) as ReservationSummaryRow[]);
      setCustomerPricing((customerPricingResult.data ?? []) as CustomerPricingRow[]);
      setBulkPricing((bulkPricingResult.data ?? []) as BulkPricingRow[]);
      setEmailLogs((emailLogsResult.data ?? []) as EmailLogRow[]);
      setLoading(false);
    };

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, [refreshKey, selectedBranchId]);

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
  const inventoryMap = new Map(inventoryStocks.map((row) => [`${row.branch_id}:${row.product_id}`, row.quantity]));
  const reservationMap = new Map(
    reservationSummary.map((row) => [`${row.branch_id}:${row.product_id}`, parseNumber(row.reserved_quantity)])
  );
  const quotationItemsMap = new Map<string, QuotationItemRow[]>();
  const salesOrderItemsMap = new Map<string, SalesOrderItemRow[]>();

  quotationItems.forEach((item) => {
    const list = quotationItemsMap.get(item.quotation_id) ?? [];
    list.push(item);
    quotationItemsMap.set(item.quotation_id, list);
  });

  salesOrderItems.forEach((item) => {
    const list = salesOrderItemsMap.get(item.sales_order_id) ?? [];
    list.push(item);
    salesOrderItemsMap.set(item.sales_order_id, list);
  });

  const selectedCustomer = selectedCustomerId ? customerMap.get(selectedCustomerId) ?? null : null;
  const computedDraftLines = draftLines.map((line) => {
    const product = line.productId ? productMap.get(line.productId) ?? null : null;
    const pricing = product
      ? resolveLinePricing({
          customer: selectedCustomer,
          product,
          quantity: line.quantity,
          customerPricing,
          bulkPricing,
        })
      : null;

    const stockKey = `${selectedBranchId}:${line.productId}`;
    const onHandQuantity = parseNumber(inventoryMap.get(stockKey));
    const reservedQuantity = parseNumber(reservationMap.get(stockKey));
    const availableQuantity = Math.max(0, onHandQuantity - reservedQuantity);

    return {
      ...line,
      product,
      pricing,
      onHandQuantity,
      reservedQuantity,
      availableQuantity,
    };
  });

  const draftSubtotal = computedDraftLines.reduce((sum, line) => sum + (line.pricing?.totalPrice ?? 0), 0);
  const draftDiscountAmount = computedDraftLines.reduce(
    (sum, line) => sum + (line.pricing?.lineDiscountAmount ?? 0),
    0
  );
  const draftTotal = draftSubtotal;
  const canCreateDocuments = canAny("sales_orders:create", "sales_orders:manage");
  const canEditReservations = canAny("sales_orders:edit", "sales_orders:approve", "sales_orders:manage");
  const canEmailQuotation = canAny("sales_orders:email", "sales_orders:manage");
  const canConvertQuotation = canAny("sales_orders:approve", "sales_orders:manage");

  const filteredQuotations = quotations.filter((quote) => {
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) return true;
    return (
      quote.quote_number.toLowerCase().includes(needle) ||
      (quote.customer_name ?? customerMap.get(quote.customer_id ?? "")?.name ?? "").toLowerCase().includes(needle) ||
      (quote.customer_email ?? "").toLowerCase().includes(needle)
    );
  });

  const filteredSalesOrders = salesOrders.filter((order) => {
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) return true;
    return (
      order.order_number.toLowerCase().includes(needle) ||
      (customerMap.get(order.customer_id ?? "")?.name ?? "").toLowerCase().includes(needle)
    );
  });

  const activeRecordId =
    selectedRecordId ||
    (workspaceTab === "quotations" ? filteredQuotations[0]?.id : filteredSalesOrders[0]?.id) ||
    "";

  const selectedQuotation =
    workspaceTab === "quotations"
      ? filteredQuotations.find((quote) => quote.id === activeRecordId) ??
        quotations.find((quote) => quote.id === activeRecordId) ??
        null
      : null;
  const selectedSalesOrder =
    workspaceTab === "sales_orders"
      ? filteredSalesOrders.find((order) => order.id === activeRecordId) ??
        salesOrders.find((order) => order.id === activeRecordId) ??
        null
      : null;

  const selectedQuotationItems = selectedQuotation ? quotationItemsMap.get(selectedQuotation.id) ?? [] : [];
  const selectedSalesOrderItems = selectedSalesOrder ? salesOrderItemsMap.get(selectedSalesOrder.id) ?? [] : [];
  const selectedQuoteLogs = selectedQuotation ? emailLogs.filter((log) => log.quotation_id === selectedQuotation.id) : [];
  const draftCustomerName = selectedCustomer?.name || "Walk-in / not assigned";
  const draftValidityLabel =
    documentType === "quotation"
      ? `Valid until ${formatDate(validUntil)}`
      : `Expected fulfillment ${formatDate(expectedFulfillmentDate)}`;
  const draftApprovalLabel = documentType === "quotation"
    ? "Draft quotation"
    : reserveOnCreate
      ? "Draft sales order, reserve stock on create"
      : "Draft sales order";

  const draftStats = [
    {
      label: "Draft Total",
      value: formatCurrency(draftTotal),
      copy: "Current document value",
      icon: FileSpreadsheet,
    },
    {
      label: "Wholesale / Custom Discount",
      value: formatCurrency(draftDiscountAmount),
      copy: "Savings applied by pricing rules",
      icon: BadgePercent,
    },
    {
      label: "Quotations",
      value: String(quotations.length),
      copy: "Tracked for this branch",
      icon: FileCheck2,
    },
    {
      label: "Reserved Orders",
      value: String(salesOrders.filter((order) => order.status === "reserved").length),
      copy: "Sales orders holding stock",
      icon: PackageCheck,
    },
  ];

  function resetDraft() {
    setDocumentType("quotation");
    setSelectedCustomerId("");
    setValidUntil(plusDays(7));
    setExpectedFulfillmentDate(plusDays(3));
    setDraftNotes("");
    setReserveOnCreate(true);
    setDraftLines([createDraftLine()]);
  }

  function updateDraftLine(lineId: string, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }

  async function getAuthorizedJsonHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBranchId || !currentUserId) {
      setError("Branch or user context is missing.");
      return;
    }

    const lines = draftLines.filter((line) => line.productId && line.quantity > 0);
    if (!lines.length) {
      setError("Add at least one product line.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: await getAuthorizedJsonHeaders(),
        body: JSON.stringify({
          action: documentType === "quotation" ? "create_quotation" : "create_sales_order",
          branchId: selectedBranchId,
          customerId: selectedCustomerId || null,
          validUntil: documentType === "quotation" ? validUntil || null : null,
          expectedFulfillmentDate:
            documentType === "sales_order" ? expectedFulfillmentDate || null : null,
          notes: draftNotes.trim() || null,
          reserveStock: documentType === "sales_order" ? reserveOnCreate : false,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            notes: line.notes.trim() || null,
          })),
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string; documentId?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create the document.");

      setNotice(payload.message || "Document created successfully.");
      setWorkspaceTab(documentType === "quotation" ? "quotations" : "sales_orders");
      setSelectedRecordId(payload.documentId ?? "");
      resetDraft();
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function runDocumentAction(action: "reserve_stock" | "release_stock" | "send_quotation_email" | "convert_quotation" | "approve_quotation") {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      let body: Record<string, unknown> = { action };

      if (action === "reserve_stock" || action === "release_stock") {
        if (!selectedSalesOrder) throw new Error("Select a sales order first.");
        body = {
          action,
          salesOrderId: selectedSalesOrder.id,
          actorId: currentUserId || null,
        };
      }

      if (action === "send_quotation_email") {
        if (!selectedQuotation) throw new Error("Select a quotation first.");
        if (!emailRecipient.trim()) throw new Error("Enter the recipient email.");
        body = {
          action,
          quotationId: selectedQuotation.id,
          recipientEmail: emailRecipient.trim(),
          sentBy: currentUserId || null,
        };
      }

      if (action === "approve_quotation") {
        if (!selectedQuotation) throw new Error("Select a quotation first.");
        body = {
          action,
          quotationId: selectedQuotation.id,
          approverId: currentUserId || null,
        };
      }

      if (action === "convert_quotation") {
        if (!selectedQuotation) throw new Error("Select a quotation first.");
        body = {
          action,
          quotationId: selectedQuotation.id,
          cashierId: currentUserId,
          paymentMethod: convertPaymentMethod,
          amountPaid: convertPaymentMethod === "customer_credit" ? 0 : parseNumber(selectedQuotation.total_amount),
          notes: `Converted from quotation ${selectedQuotation.quote_number}`,
        };
      }

      const response = await fetch("/api/sales-orders", {
        method: "POST",
        headers: await getAuthorizedJsonHeaders(),
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Action failed.");

      setNotice(payload.message || "Action completed.");
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function openSelectedQuotationWhatsApp() {
    if (!selectedQuotation) {
      setError("Select a quotation first.");
      return;
    }

    const customer = selectedQuotation.customer_id ? customerMap.get(selectedQuotation.customer_id) ?? null : null;
    const phone = customer?.contact_number?.replace(/\D/g, "") ?? "";
    if (!phone) {
      setError("This quotation has no customer phone number for WhatsApp sharing.");
      return;
    }

    const message = [
      `Quotation ${selectedQuotation.quote_number}`,
      `Customer: ${selectedQuotation.customer_name || customer?.name || "Walk-in Customer"}`,
      `Total: ${formatCurrency(parseNumber(selectedQuotation.total_amount))}`,
      `Valid until: ${formatDate(selectedQuotation.valid_until)}`,
    ].join("\n");

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function printSelectedQuotation() {
    if (!selectedQuotation) {
      setError("Select a quotation to print.");
      return;
    }

    const customer =
      (selectedQuotation.customer_id ? customerMap.get(selectedQuotation.customer_id) ?? null : null) ??
      ({
        id: selectedQuotation.customer_id ?? null,
        name: selectedQuotation.customer_name ?? "Walk-in Customer",
        email: selectedQuotation.customer_email ?? null,
      } as PricingCustomer);

    const html = buildQuotationEmailHtml({
      quote: selectedQuotation,
      customer,
      branchName: branchMap.get(selectedQuotation.branch_id)?.name ?? "WAP POS",
      items: selectedQuotationItems.map((item) => ({
        ...item,
        product: productMap.get(item.product_id) ?? null,
      })),
    });

    const popup = window.open("", "_blank", "width=980,height=780");
    if (!popup) {
      setError("Popup blocker prevented the print preview.");
      return;
    }

    popup.document.write(`
      <html>
        <head>
          <title>${selectedQuotation.quote_number}</title>
        </head>
        <body style="margin:0;background:#fff;">
          ${html}
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  if (loading && !branches.length && !selectedBranchId) {
    return (
      <div className="sales-orders-state-card">
        <LoaderCircle className="sales-orders-spin" size={18} />
        <span>Loading quotes and orders workspace...</span>
      </div>
    );
  }

  return (
    <div className="sales-orders-workspace">
      <section className="sales-orders-hero">
        <div className="sales-orders-hero__title-group">
          <div className="sales-orders-hero__icon">
            <Boxes size={20} />
          </div>
          <div>
            <h1>Sales Orders, Quotations & Wholesale Pricing</h1>
            <p>
              Create quotations and sales orders, resolve wholesale and customer-specific pricing,
              reserve stock, print documents, and send quotation emails through your Resend-backed setup.
            </p>
          </div>
        </div>

      </section>

      <section className="sales-orders-kpis">
        {draftStats.map((stat) => (
          <article key={stat.label} className="sales-orders-kpi">
            <stat.icon size={18} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.copy}</small>
          </article>
        ))}
      </section>

      {error ? (
        <div className="sales-orders-alert sales-orders-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="sales-orders-alert sales-orders-alert--success">
          <BadgeCheck size={16} />
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="sales-orders-grid">
        <article className="sales-orders-panel">
          <div className="sales-orders-panel__head">
            <div>
              <h2>Compose Document</h2>
              <p>POS-style builder with customer details, validity date, and approval state.</p>
            </div>
            <button type="button" className="sales-orders-button sales-orders-button--ghost" onClick={resetDraft}>
              <RefreshCcw size={15} /> Reset
            </button>
          </div>

          <div className="sales-orders-builder-summary">
            <div>
              <span>Customer</span>
              <strong>{draftCustomerName}</strong>
            </div>
            <div>
              <span>{documentType === "quotation" ? "Validity" : "Fulfillment"}</span>
              <strong>{draftValidityLabel}</strong>
            </div>
            <div>
              <span>Approval Status</span>
              <strong>{draftApprovalLabel}</strong>
            </div>
          </div>

          <form className="sales-orders-form sales-orders-form--pos-like" onSubmit={createDocument}>
            <div className="sales-orders-form__grid">
              <label>
                <span>Document Type</span>
                <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DraftDocumentType)}>
                  <option value="quotation">Quotation</option>
                  <option value="sales_order">Sales Order</option>
                </select>
              </label>
              <label>
                <span>Customer</span>
                <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                  <option value="">Walk-in / not assigned</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.customer_type ? ` (${formatLabel(customer.customer_type)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="sales-orders-form__grid">
              {documentType === "quotation" ? (
                <label>
                  <span>Valid Until</span>
                  <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                </label>
              ) : (
                <label>
                  <span>Expected Fulfillment</span>
                  <input
                    type="date"
                    value={expectedFulfillmentDate}
                    onChange={(event) => setExpectedFulfillmentDate(event.target.value)}
                  />
                </label>
              )}

              {documentType === "sales_order" ? (
                <label className="sales-orders-checkbox">
                  <input
                    type="checkbox"
                    checked={reserveOnCreate}
                    onChange={(event) => setReserveOnCreate(event.target.checked)}
                  />
                  <span>Reserve stock immediately after creation</span>
                </label>
              ) : (
                <div className="sales-orders-pricing-hint">
                  <BadgePercent size={15} />
                  <span>
                    Pricing sources can be retail, wholesale, customer-specific, or bulk-tiered.
                  </span>
                </div>
              )}
            </div>

            <label>
              <span>Notes</span>
              <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} rows={3} />
            </label>

            <div className="sales-orders-lines">
              <div className="sales-orders-line__head">
                <span>Item</span>
                <span>Qty</span>
                <span>Unit Cost</span>
                <span>Amount</span>
              </div>
              {computedDraftLines.map((line) => (
                <div key={line.id} className="sales-orders-line">
                  <div className="sales-orders-line__top">
                    <label>
                      <span>Product</span>
                      <select
                        value={line.productId}
                        onChange={(event) => updateDraftLine(line.id, { productId: event.target.value })}
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Qty</span>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(event) =>
                          updateDraftLine(line.id, {
                            quantity: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                      />
                    </label>
                  </div>

                  <label className="sales-orders-line__notes-field">
                    <span>Line Notes</span>
                    <input
                      value={line.notes}
                      onChange={(event) => updateDraftLine(line.id, { notes: event.target.value })}
                      placeholder="Optional notes for this line"
                    />
                  </label>

                  <div className="sales-orders-line__meta">
                    <div>
                      <span>Stock</span>
                      <strong>
                        {line.product ? `${line.availableQuantity} available / ${line.onHandQuantity} on hand` : "-"}
                      </strong>
                    </div>
                    <div>
                      <span>Price Source</span>
                      <strong>{line.pricing ? formatLabel(line.pricing.priceSource) : "-"}</strong>
                    </div>
                    <div>
                      <span>Unit Price</span>
                      <strong>{line.pricing ? formatCurrency(line.pricing.unitPrice) : "-"}</strong>
                    </div>
                    <div>
                      <span>Line Total</span>
                      <strong>{line.pricing ? formatCurrency(line.pricing.totalPrice) : "-"}</strong>
                    </div>
                  </div>

                  {line.pricing?.pricingNotes ? (
                    <div className="sales-orders-line__notes">{line.pricing.pricingNotes}</div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="sales-orders-form__actions">
              <button
                type="button"
                className="sales-orders-button sales-orders-button--ghost"
                onClick={() => setDraftLines((current) => [...current, createDraftLine()])}
                disabled={!canCreateDocuments}
              >
                <ShoppingBag size={15} /> Add Line
              </button>
              {draftLines.length > 1 ? (
                <button
                  type="button"
                  className="sales-orders-button sales-orders-button--ghost"
                  onClick={() => setDraftLines((current) => current.slice(0, -1))}
                  disabled={!canCreateDocuments}
                >
                  Remove Last Line
                </button>
              ) : null}
            </div>

            <div className="sales-orders-summary">
              <div>
                <span>Subtotal</span>
                <strong>{formatCurrency(draftSubtotal)}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>{formatCurrency(draftDiscountAmount)}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(draftTotal)}</strong>
              </div>
            </div>

            <button type="submit" className="sales-orders-button sales-orders-button--primary" disabled={saving || !canCreateDocuments}>
              {saving ? "Saving..." : documentType === "quotation" ? "Create Quotation" : "Create Sales Order"}
            </button>
          </form>
        </article>

        <article className="sales-orders-panel">
          <div className="sales-orders-panel__head">
            <div>
              <h2>Document Queue</h2>
              <p>Review quotations, email or print them, and manage sales-order reservations.</p>
            </div>
            <label className="sales-orders-search">
              <span>Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Document #, customer, email..." />
            </label>
          </div>

          <div className="sales-orders-tabs">
            <button
              type="button"
              className={workspaceTab === "quotations" ? "sales-orders-tab sales-orders-tab--active" : "sales-orders-tab"}
              onClick={() => {
                setWorkspaceTab("quotations");
                setSelectedRecordId("");
              }}
            >
              Quotations
            </button>
            <button
              type="button"
              className={workspaceTab === "sales_orders" ? "sales-orders-tab sales-orders-tab--active" : "sales-orders-tab"}
              onClick={() => {
                setWorkspaceTab("sales_orders");
                setSelectedRecordId("");
              }}
            >
              Sales Orders
            </button>
          </div>

          <div className="sales-orders-queue">
            <div className="sales-orders-queue__list">
              {workspaceTab === "quotations" && !filteredQuotations.length ? (
                <div className="sales-orders-empty">No quotations found for this branch.</div>
              ) : null}
              {workspaceTab === "sales_orders" && !filteredSalesOrders.length ? (
                <div className="sales-orders-empty">No sales orders found for this branch.</div>
              ) : null}

              {workspaceTab === "quotations"
                ? filteredQuotations.map((quote) => (
                    <button
                      key={quote.id}
                      type="button"
                      className={activeRecordId === quote.id ? "sales-orders-card sales-orders-card--active" : "sales-orders-card"}
                      onClick={() => {
                        setSelectedRecordId(quote.id);
                        setEmailRecipient(quote.customer_email ?? customerMap.get(quote.customer_id ?? "")?.email ?? "");
                      }}
                    >
                      <div className="sales-orders-card__top">
                        <strong>{quote.quote_number}</strong>
                        <span>{formatLabel(quote.status)}</span>
                      </div>
                      <span>{quote.customer_name || customerMap.get(quote.customer_id ?? "")?.name || "Walk-in Customer"}</span>
                      <span>{formatCurrency(parseNumber(quote.total_amount))}</span>
                    </button>
                  ))
                : filteredSalesOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className={activeRecordId === order.id ? "sales-orders-card sales-orders-card--active" : "sales-orders-card"}
                      onClick={() => setSelectedRecordId(order.id)}
                    >
                      <div className="sales-orders-card__top">
                        <strong>{order.order_number}</strong>
                        <span>{formatLabel(order.status)}</span>
                      </div>
                      <span>{customerMap.get(order.customer_id ?? "")?.name || "Walk-in Customer"}</span>
                      <span>{formatCurrency(parseNumber(order.total_amount))}</span>
                    </button>
                  ))}
            </div>

            <div className="sales-orders-queue__detail">
              {workspaceTab === "quotations" && selectedQuotation ? (
                <>
                  <div className="sales-orders-detail__hero">
                    <div>
                      <h3>{selectedQuotation.quote_number}</h3>
                      <p>
                        {selectedQuotation.customer_name || customerMap.get(selectedQuotation.customer_id ?? "")?.name || "Walk-in Customer"}{" "}
                        • Valid until {formatDate(selectedQuotation.valid_until)}
                      </p>
                    </div>
                    <span>{formatLabel(selectedQuotation.status)}</span>
                  </div>

                    <div className="sales-orders-detail__meta">
                      <div>
                        <span>Total</span>
                        <strong>{formatCurrency(parseNumber(selectedQuotation.total_amount))}</strong>
                      </div>
                    <div>
                      <span>Discount</span>
                      <strong>{formatCurrency(parseNumber(selectedQuotation.discount_amount))}</strong>
                    </div>
                    <div>
                      <span>Sent</span>
                      <strong>{selectedQuotation.sent_at ? formatDate(selectedQuotation.sent_at) : "-"}</strong>
                    </div>
                    <div>
                      <span>Converted</span>
                      <strong>{selectedQuotation.converted_to_sale_id ? "Yes" : "No"}</strong>
                    </div>
                    <div>
                      <span>Approval</span>
                      <strong>{formatLabel(selectedQuotation.status)}</strong>
                    </div>
                  </div>

                  <div className="sales-orders-detail__items">
                    {selectedQuotationItems.map((item) => (
                      <div key={item.id} className="sales-orders-detail-item">
                        <div>
                          <strong>{productMap.get(item.product_id)?.name || item.product_id}</strong>
                          <span>
                            {productMap.get(item.product_id)?.sku || "No SKU"} • {item.quantity} pcs •{" "}
                            {formatLabel(item.price_source)}
                          </span>
                        </div>
                        <div>
                          <strong>{formatCurrency(parseNumber(item.total_price))}</strong>
                          <span>{formatCurrency(parseNumber(item.unit_price))} each</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="sales-orders-actions-card">
                    <h4>Quotation Actions</h4>
                    <div className="sales-orders-actions-card__row">
                      <button type="button" className="sales-orders-button sales-orders-button--ghost" onClick={printSelectedQuotation}>
                        <Printer size={15} /> Print Quotation
                      </button>
                      <button
                        type="button"
                        className="sales-orders-button sales-orders-button--ghost"
                        disabled={saving || !selectedQuotation.customer_id}
                        onClick={openSelectedQuotationWhatsApp}
                      >
                        <MessageCircle size={15} /> WhatsApp
                      </button>
                    </div>

                    <label>
                      <span>Email Recipient</span>
                      <input value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} />
                    </label>
                    <button
                      type="button"
                      className="sales-orders-button sales-orders-button--primary"
                      disabled={saving || !canEmailQuotation}
                      onClick={() => void runDocumentAction("send_quotation_email")}
                    >
                      <Mail size={15} /> Send Quotation
                    </button>

                    <button
                      type="button"
                      className="sales-orders-button sales-orders-button--ghost"
                      disabled={saving || selectedQuotation.status === "approved" || selectedQuotation.status === "converted"}
                      onClick={() => void runDocumentAction("approve_quotation")}
                    >
                      <BadgeCheck size={15} /> Approve Quotation
                    </button>

                    <label>
                      <span>Convert to Sale Using</span>
                      <select value={convertPaymentMethod} onChange={(event) => setConvertPaymentMethod(event.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="gcash">GCash</option>
                        <option value="ewallet">E-Wallet</option>
                        <option value="customer_credit">Customer Credit</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="sales-orders-button sales-orders-button--primary"
                      disabled={saving || selectedQuotation.status !== "approved" || !canConvertQuotation}
                      onClick={() => void runDocumentAction("convert_quotation")}
                    >
                      <Boxes size={15} /> Convert to Sale
                    </button>
                    {selectedQuotation.status !== "approved" ? (
                      <div className="sales-orders-actions-card__note">
                        Approve the quotation first before converting it into a sale.
                      </div>
                    ) : null}
                  </div>

                  <div className="sales-orders-actions-card">
                    <h4>Email History</h4>
                    {!selectedQuoteLogs.length ? <div className="sales-orders-empty sales-orders-empty--compact">No emails sent yet.</div> : null}
                    {selectedQuoteLogs.map((log) => (
                      <div key={log.id} className="sales-orders-detail-item">
                        <div>
                          <strong>{log.recipient_email}</strong>
                          <span>{formatLabel(log.status)}</span>
                        </div>
                        <div>
                          <strong>{formatDate(log.sent_at || log.created_at)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {workspaceTab === "sales_orders" && selectedSalesOrder ? (
                <>
                  <div className="sales-orders-detail__hero">
                    <div>
                      <h3>{selectedSalesOrder.order_number}</h3>
                      <p>
                        {customerMap.get(selectedSalesOrder.customer_id ?? "")?.name || "Walk-in Customer"} • Fulfillment{" "}
                        {formatDate(selectedSalesOrder.expected_fulfillment_date)}
                      </p>
                    </div>
                    <span>{formatLabel(selectedSalesOrder.status)}</span>
                  </div>

                  <div className="sales-orders-detail__meta">
                    <div>
                      <span>Total</span>
                      <strong>{formatCurrency(parseNumber(selectedSalesOrder.total_amount))}</strong>
                    </div>
                    <div>
                      <span>Reserved Lines</span>
                      <strong>
                        {selectedSalesOrderItems.filter((item) => parseNumber(item.reserved_quantity) > 0).length}
                      </strong>
                    </div>
                    <div>
                      <span>Converted</span>
                      <strong>{selectedSalesOrder.converted_to_sale_id ? "Yes" : "No"}</strong>
                    </div>
                    <div>
                      <span>Quotation Link</span>
                      <strong>{selectedSalesOrder.quotation_id ? "Attached" : "-"}</strong>
                    </div>
                  </div>

                  <div className="sales-orders-detail__items">
                    {selectedSalesOrderItems.map((item) => {
                      const stockKey = `${selectedSalesOrder.branch_id}:${item.product_id}`;
                      const onHand = parseNumber(inventoryMap.get(stockKey));
                      const reserved = parseNumber(item.reserved_quantity);
                      return (
                        <div key={item.id} className="sales-orders-detail-item">
                          <div>
                            <strong>{productMap.get(item.product_id)?.name || item.product_id}</strong>
                            <span>
                              {productMap.get(item.product_id)?.sku || "No SKU"} • Ordered {item.quantity} • Reserved {reserved}
                            </span>
                          </div>
                          <div>
                            <strong>{formatCurrency(parseNumber(item.total_price))}</strong>
                            <span>{onHand} on hand</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="sales-orders-actions-card">
                    <h4>Reservation Controls</h4>
                    <p>
                      Refresh reservations whenever stock levels or order quantities change. Releasing reservations returns
                      those units to general availability without affecting on-hand inventory.
                    </p>
                    <div className="sales-orders-actions-card__row">
                      <button
                        type="button"
                        className="sales-orders-button sales-orders-button--primary"
                        disabled={saving || !canEditReservations}
                        onClick={() => void runDocumentAction("reserve_stock")}
                      >
                        <PackageCheck size={15} /> Reserve / Refresh Stock
                      </button>
                      <button
                        type="button"
                        className="sales-orders-button sales-orders-button--ghost"
                        disabled={saving || !canEditReservations}
                        onClick={() => void runDocumentAction("release_stock")}
                      >
                        <RefreshCcw size={15} /> Release Reservations
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {!selectedQuotation && workspaceTab === "quotations" ? (
                <div className="sales-orders-empty">Select a quotation to inspect its items and actions.</div>
              ) : null}
              {!selectedSalesOrder && workspaceTab === "sales_orders" ? (
                <div className="sales-orders-empty">Select a sales order to review reservations and stock.</div>
              ) : null}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

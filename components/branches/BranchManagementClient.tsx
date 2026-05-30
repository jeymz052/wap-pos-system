"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Building2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  TrendingUp,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ActorInfo = {
  roleName?: string | null;
  branchId?: string | null;
  canManageBranches?: boolean;
  canAssignStaff?: boolean;
  canManagePricing?: boolean;
  canTransferStock?: boolean;
};

type BranchRow = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  is_main?: boolean;
  is_active?: boolean;
  manager_name?: string | null;
  timezone?: string | null;
  receipt_header?: string | null;
  pricing_mode?: "global" | "branch_override";
  notes?: string | null;
};

type BranchDashboardRow = {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  manager_name?: string | null;
  pricing_mode?: string | null;
  sku_count?: number | string | null;
  total_quantity?: number | string | null;
  inventory_cost_value?: number | string | null;
  inventory_retail_value?: number | string | null;
  low_stock_count?: number | string | null;
  out_of_stock_count?: number | string | null;
  transaction_count_30d?: number | string | null;
  total_sales_30d?: number | string | null;
  gross_profit_mtd?: number | string | null;
  active_staff_count?: number | string | null;
};

type InventorySummaryRow = {
  branch_id: string;
  branch_name: string;
  sku_count?: number | string | null;
  total_quantity?: number | string | null;
  inventory_cost_value?: number | string | null;
  inventory_retail_value?: number | string | null;
  low_stock_count?: number | string | null;
  out_of_stock_count?: number | string | null;
};

type SalesSummaryRow = {
  branch_id: string;
  branch_name: string;
  transaction_count_30d?: number | string | null;
  total_sales_30d?: number | string | null;
  average_ticket_30d?: number | string | null;
  transaction_count_mtd?: number | string | null;
  total_sales_mtd?: number | string | null;
  gross_profit_mtd?: number | string | null;
  expense_total_mtd?: number | string | null;
  refund_total_30d?: number | string | null;
};

type TransferSummaryRow = {
  id: string;
  transfer_number?: string | null;
  status?: string | null;
  created_at: string;
  from_branch_id?: string | null;
  from_branch_name?: string | null;
  to_branch_id?: string | null;
  to_branch_name?: string | null;
  total_units?: number | string | null;
  sku_count?: number | string | null;
  notes?: string | null;
};

type StaffAssignmentRow = {
  user_id: string;
  branch_id?: string | null;
  branch_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  is_active?: boolean;
  allow_login?: boolean;
  data_access_scope?: string | null;
  role_name?: string | null;
};

type PriceOverrideRow = {
  id: string;
  branch_id: string;
  product_id: string;
  price?: number | string | null;
  min_price?: number | string | null;
  max_price?: number | string | null;
  notes?: string | null;
  updated_at?: string | null;
  branches?: { name?: string | null } | Array<{ name?: string | null }> | null;
  products?: { name?: string | null; sku?: string | null; selling_price?: number | string | null } | Array<{ name?: string | null; sku?: string | null; selling_price?: number | string | null }> | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  selling_price?: number | string | null;
};

type UserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  branch_id?: string | null;
  role_name?: string | null;
};

type OwnerDashboard = {
  total_branch_count?: number | string | null;
  active_branch_count?: number | string | null;
  network_sales_30d?: number | string | null;
  network_gross_profit_mtd?: number | string | null;
  network_inventory_cost_value?: number | string | null;
  network_low_stock_count?: number | string | null;
  network_out_of_stock_count?: number | string | null;
  network_staff_count?: number | string | null;
  top_branch_name?: string | null;
  top_branch_sales_30d?: number | string | null;
  open_transfer_count?: number | string | null;
};

type WorkspacePayload = {
  actor: ActorInfo;
  branches: BranchRow[];
  branchDashboard: BranchDashboardRow[];
  inventorySummary: InventorySummaryRow[];
  salesSummary: SalesSummaryRow[];
  transferSummary: TransferSummaryRow[];
  staffAssignments: StaffAssignmentRow[];
  priceOverrides: PriceOverrideRow[];
  products: ProductRow[];
  users: UserRow[];
  ownerDashboard: OwnerDashboard | null;
};

type BranchFormState = {
  id?: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  managerName: string;
  timezone: string;
  receiptHeader: string;
  pricingMode: "global" | "branch_override";
  notes: string;
  isActive: boolean;
};

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("en-PH");

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value: unknown) {
  return PHP.format(parseNumber(value)).replace("PHP", "P");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getPersonName(person: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return fullName || person.username || person.email || "Unassigned";
}

const EMPTY_BRANCH_FORM: BranchFormState = {
  name: "",
  code: "",
  address: "",
  phone: "",
  email: "",
  managerName: "",
  timezone: "Asia/Manila",
  receiptHeader: "",
  pricingMode: "global",
  notes: "",
  isActive: true,
};

export default function BranchManagementClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [activeBranchId, setActiveBranchId] = useState("all");
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchForm, setBranchForm] = useState<BranchFormState>(EMPTY_BRANCH_FORM);
  const [transferForm, setTransferForm] = useState({
    fromBranchId: "",
    toBranchId: "",
    productId: "",
    quantity: "1",
    notes: "",
  });
  const [pricingForm, setPricingForm] = useState({
    branchId: "",
    productId: "",
    price: "",
    minPrice: "",
    maxPrice: "",
    notes: "",
  });

  async function getAuthHeaders() {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error("Please sign in again to continue.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function loadWorkspace() {
    setLoading(true);
    setError("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/branches", { headers });
      const payload = (await response.json()) as WorkspacePayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load branch workspace.");
      setWorkspace(payload);
      setActiveBranchId((current) => {
        if (current !== "all" && payload.branches.some((branch) => branch.id === current)) return current;
        const saved = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") : null;
        if (saved && payload.branches.some((branch) => branch.id === saved)) return saved;
        return payload.actor.branchId ?? payload.branches[0]?.id ?? "all";
      });
      setTransferForm((current) => ({
        ...current,
        fromBranchId: current.fromBranchId || payload.actor.branchId || payload.branches[0]?.id || "",
        toBranchId: current.toBranchId || payload.branches.find((branch) => branch.id !== (payload.actor.branchId || payload.branches[0]?.id))?.id || "",
      }));
      setPricingForm((current) => ({
        ...current,
        branchId: current.branchId || payload.actor.branchId || payload.branches[0]?.id || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load branch workspace.");
    } finally {
      setLoading(false);
    }
  }

  async function postAction(body: Record<string, unknown>) {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/branches", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) throw new Error(payload.error || "Branch action failed.");
    if (payload.message) setNotice(payload.message);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const branches = workspace?.branches ?? [];
  const branchDashboard = workspace?.branchDashboard ?? [];
  const inventorySummary = workspace?.inventorySummary ?? [];
  const salesSummary = workspace?.salesSummary ?? [];
  const transferSummary = workspace?.transferSummary ?? [];
  const staffAssignments = workspace?.staffAssignments ?? [];
  const priceOverrides = workspace?.priceOverrides ?? [];
  const products = workspace?.products ?? [];
  const filteredBranchDashboard = activeBranchId === "all"
    ? branchDashboard
    : branchDashboard.filter((row) => row.branch_id === activeBranchId);

  const filteredInventorySummary = activeBranchId === "all"
    ? inventorySummary
    : inventorySummary.filter((row) => row.branch_id === activeBranchId);

  const filteredSalesSummary = activeBranchId === "all"
    ? salesSummary
    : salesSummary.filter((row) => row.branch_id === activeBranchId);

  const filteredTransfers = activeBranchId === "all"
    ? transferSummary
    : transferSummary.filter((row) => row.from_branch_id === activeBranchId || row.to_branch_id === activeBranchId);

  const filteredStaff = activeBranchId === "all"
    ? staffAssignments
    : staffAssignments.filter((row) => row.branch_id === activeBranchId);

  const filteredPrices = activeBranchId === "all"
    ? priceOverrides
    : priceOverrides.filter((row) => row.branch_id === activeBranchId);

  function openCreateBranch() {
    setBranchForm(EMPTY_BRANCH_FORM);
    setShowBranchModal(true);
  }

  function openEditBranch(branch: BranchRow) {
    setBranchForm({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      managerName: branch.manager_name ?? "",
      timezone: branch.timezone ?? "Asia/Manila",
      receiptHeader: branch.receipt_header ?? "",
      pricingMode: branch.pricing_mode === "branch_override" ? "branch_override" : "global",
      notes: branch.notes ?? "",
      isActive: branch.is_active !== false,
    });
    setShowBranchModal(true);
  }

  async function saveBranch() {
    setSaving(true);
    setError("");
    try {
      await postAction({
        action: branchForm.id ? "update_branch" : "create_branch",
        branch: branchForm,
      });
      setShowBranchModal(false);
      setBranchForm(EMPTY_BRANCH_FORM);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save branch.");
    } finally {
      setSaving(false);
    }
  }

  async function assignStaff(userId: string, branchId: string) {
    setSaving(true);
    setError("");
    try {
      await postAction({
        action: "assign_staff",
        userId,
        branchId: branchId || null,
      });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update staff assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function savePricingOverride() {
    setSaving(true);
    setError("");
    try {
      await postAction({
        action: "save_branch_price",
        branchId: pricingForm.branchId,
        productId: pricingForm.productId,
        price: Number(pricingForm.price),
        minPrice: pricingForm.minPrice ? Number(pricingForm.minPrice) : null,
        maxPrice: pricingForm.maxPrice ? Number(pricingForm.maxPrice) : null,
        notes: pricingForm.notes,
      });
      setPricingForm((current) => ({
        ...current,
        productId: "",
        price: "",
        minPrice: "",
        maxPrice: "",
        notes: "",
      }));
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save branch price.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePricingOverride(branchId: string, productId: string) {
    setSaving(true);
    setError("");
    try {
      await postAction({
        action: "delete_branch_price",
        branchId,
        productId,
      });
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete branch price.");
    } finally {
      setSaving(false);
    }
  }

  async function createTransfer() {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers,
        body: JSON.stringify({
          productId: transferForm.productId,
          fromBranchId: transferForm.fromBranchId,
          toBranchId: transferForm.toBranchId,
          quantity: Number(transferForm.quantity),
          notes: transferForm.notes,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create transfer.");
      setNotice("Stock transfer completed.");
      setTransferForm((current) => ({ ...current, productId: "", quantity: "1", notes: "" }));
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create transfer.");
    } finally {
      setSaving(false);
    }
  }

  const selectedBranchName =
    activeBranchId === "all"
      ? "All accessible branches"
      : branches.find((branch) => branch.id === activeBranchId)?.name ?? "Selected branch";

  return (
    <div className="mb15-page">
      <section className="mb15-hero">
        <div>
          <span className="mb15-eyebrow">Module 15</span>
          <h1>Multi-Branch Management</h1>
          <p>Manage branch profiles, branch inventory and sales, inter-branch transfers, branch pricing, staff assignments, and centralized ownership visibility from one workspace.</p>
        </div>
        <div className="mb15-hero__actions">
          <label className="mb15-select-wrap">
            <Building2 size={14} />
            <select value={activeBranchId} onChange={(event) => setActiveBranchId(event.target.value)}>
              <option value="all">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="mb15-btn mb15-btn--ghost" onClick={() => void loadWorkspace()} disabled={loading}>
            {loading ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          {workspace?.actor.canManageBranches ? (
            <button type="button" className="mb15-btn mb15-btn--primary" onClick={openCreateBranch}>
              <Plus size={14} />
              New Branch
            </button>
          ) : null}
        </div>
      </section>

      {error ? <div className="mb15-alert mb15-alert--error">{error}</div> : null}
      {notice ? <div className="mb15-alert mb15-alert--ok">{notice}</div> : null}

      {loading && !workspace ? (
        <div className="mb15-loading">
          <LoaderCircle size={18} className="spin" />
          <span>Loading multi-branch workspace...</span>
        </div>
      ) : null}

      {workspace?.ownerDashboard ? (
        <section className="mb15-owner-grid">
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><Building2 size={18} /></div>
            <div><span>Total / Active Branches</span><strong>{NUM.format(parseNumber(workspace.ownerDashboard.total_branch_count))} / {NUM.format(parseNumber(workspace.ownerDashboard.active_branch_count))}</strong></div>
          </article>
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><TrendingUp size={18} /></div>
            <div><span>Network Sales 30D</span><strong>{formatCurrency(workspace.ownerDashboard.network_sales_30d)}</strong></div>
          </article>
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><BadgeDollarSign size={18} /></div>
            <div><span>Gross Profit MTD</span><strong>{formatCurrency(workspace.ownerDashboard.network_gross_profit_mtd)}</strong></div>
          </article>
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><Warehouse size={18} /></div>
            <div><span>Inventory Cost Value</span><strong>{formatCurrency(workspace.ownerDashboard.network_inventory_cost_value)}</strong></div>
          </article>
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><Users size={18} /></div>
            <div><span>Active Staff</span><strong>{NUM.format(parseNumber(workspace.ownerDashboard.network_staff_count))}</strong></div>
          </article>
          <article className="mb15-stat">
            <div className="mb15-stat__icon"><ArrowRightLeft size={18} /></div>
            <div><span>Open Transfers</span><strong>{NUM.format(parseNumber(workspace.ownerDashboard.open_transfer_count))}</strong></div>
          </article>
        </section>
      ) : null}

      <section className="mb15-panel">
        <div className="mb15-panel__head">
          <div>
            <h2>Branch Performance Dashboard</h2>
            <p>{selectedBranchName}</p>
          </div>
        </div>
        <div className="mb15-branch-grid">
          {filteredBranchDashboard.map((branch) => (
            <article key={branch.branch_id} className="mb15-branch-card">
              <div className="mb15-branch-card__top">
                <div>
                  <strong>{branch.branch_name}</strong>
                  <span>{branch.branch_code} • {branch.manager_name || "No manager set"}</span>
                </div>
                <button type="button" className="mb15-link-btn" onClick={() => {
                  const record = branches.find((item) => item.id === branch.branch_id);
                  if (record) openEditBranch(record);
                }}>
                  Edit
                </button>
              </div>
              <div className="mb15-branch-card__metrics">
                <span>30D Sales <strong>{formatCurrency(branch.total_sales_30d)}</strong></span>
                <span>MTD Profit <strong>{formatCurrency(branch.gross_profit_mtd)}</strong></span>
                <span>Inventory <strong>{formatCurrency(branch.inventory_cost_value)}</strong></span>
                <span>Low / OOS <strong>{NUM.format(parseNumber(branch.low_stock_count))} / {NUM.format(parseNumber(branch.out_of_stock_count))}</strong></span>
                <span>Staff <strong>{NUM.format(parseNumber(branch.active_staff_count))}</strong></span>
                <span>Pricing <strong>{branch.pricing_mode === "branch_override" ? "Override" : "Global"}</strong></span>
              </div>
            </article>
          ))}
          {!filteredBranchDashboard.length ? <div className="mb15-empty">No branch performance data is available yet.</div> : null}
        </div>
      </section>

      <div className="mb15-two-col">
        <section className="mb15-panel">
          <div className="mb15-panel__head">
            <div>
              <h2>Branch Inventory</h2>
              <p>Branch-level stock, retail value, and stock health.</p>
            </div>
          </div>
          <div className="mb15-table-wrap">
            <table className="mb15-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>SKUs</th>
                  <th>Qty</th>
                  <th>Cost Value</th>
                  <th>Retail Value</th>
                  <th>Low</th>
                  <th>OOS</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventorySummary.map((row) => (
                  <tr key={row.branch_id}>
                    <td>{row.branch_name}</td>
                    <td>{NUM.format(parseNumber(row.sku_count))}</td>
                    <td>{NUM.format(parseNumber(row.total_quantity))}</td>
                    <td>{formatCurrency(row.inventory_cost_value)}</td>
                    <td>{formatCurrency(row.inventory_retail_value)}</td>
                    <td>{NUM.format(parseNumber(row.low_stock_count))}</td>
                    <td>{NUM.format(parseNumber(row.out_of_stock_count))}</td>
                  </tr>
                ))}
                {!filteredInventorySummary.length ? (
                  <tr><td colSpan={7} className="mb15-empty-cell">No inventory summary rows found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb15-panel">
          <div className="mb15-panel__head">
            <div>
              <h2>Branch Sales</h2>
              <p>30-day and month-to-date branch sales performance.</p>
            </div>
          </div>
          <div className="mb15-table-wrap">
            <table className="mb15-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>30D Sales</th>
                  <th>Avg Ticket</th>
                  <th>MTD Sales</th>
                  <th>MTD Profit</th>
                  <th>Expenses</th>
                  <th>Refunds</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalesSummary.map((row) => (
                  <tr key={row.branch_id}>
                    <td>{row.branch_name}</td>
                    <td>{formatCurrency(row.total_sales_30d)}</td>
                    <td>{formatCurrency(row.average_ticket_30d)}</td>
                    <td>{formatCurrency(row.total_sales_mtd)}</td>
                    <td>{formatCurrency(row.gross_profit_mtd)}</td>
                    <td>{formatCurrency(row.expense_total_mtd)}</td>
                    <td>{formatCurrency(row.refund_total_30d)}</td>
                  </tr>
                ))}
                {!filteredSalesSummary.length ? (
                  <tr><td colSpan={7} className="mb15-empty-cell">No sales summary rows found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mb15-two-col">
        <section className="mb15-panel">
          <div className="mb15-panel__head">
            <div>
              <h2>Branch Transfers</h2>
              <p>Recent inter-branch movement history and quick transfer action.</p>
            </div>
            {workspace?.actor.canTransferStock ? (
              <div className="mb15-inline-form">
                <select value={transferForm.fromBranchId} onChange={(event) => setTransferForm((current) => ({ ...current, fromBranchId: event.target.value }))}>
                  <option value="">From branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <select value={transferForm.toBranchId} onChange={(event) => setTransferForm((current) => ({ ...current, toBranchId: event.target.value }))}>
                  <option value="">To branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <select value={transferForm.productId} onChange={(event) => setTransferForm((current) => ({ ...current, productId: event.target.value }))}>
                  <option value="">Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                  ))}
                </select>
                <input type="number" min="1" value={transferForm.quantity} onChange={(event) => setTransferForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Qty" />
                <button type="button" className="mb15-btn mb15-btn--primary" onClick={() => void createTransfer()} disabled={saving}>
                  <ArrowRightLeft size={14} />
                  Transfer
                </button>
              </div>
            ) : null}
          </div>
          <div className="mb15-table-wrap">
            <table className="mb15-table">
              <thead>
                <tr>
                  <th>Transfer</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Units</th>
                  <th>SKUs</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.transfer_number || row.id.slice(0, 8)}</td>
                    <td>{row.from_branch_name} to {row.to_branch_name}</td>
                    <td>{row.status || "-"}</td>
                    <td>{NUM.format(parseNumber(row.total_units))}</td>
                    <td>{NUM.format(parseNumber(row.sku_count))}</td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
                {!filteredTransfers.length ? (
                  <tr><td colSpan={6} className="mb15-empty-cell">No transfer history found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb15-panel">
          <div className="mb15-panel__head">
            <div>
              <h2>Staff Assigned Per Branch</h2>
              <p>Keep branch ownership and staffing aligned with branch operations.</p>
            </div>
          </div>
          <div className="mb15-table-wrap">
            <table className="mb15-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Current Branch</th>
                  <th>Scope</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((row) => (
                  <tr key={row.user_id}>
                    <td>{getPersonName(row)}</td>
                    <td>{row.role_name || "-"}</td>
                    <td>
                      {workspace?.actor.canAssignStaff ? (
                        <select value={row.branch_id ?? ""} onChange={(event) => void assignStaff(row.user_id, event.target.value)} disabled={saving}>
                          <option value="">All branches</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                          ))}
                        </select>
                      ) : (
                        row.branch_name || "All branches"
                      )}
                    </td>
                    <td>{row.data_access_scope || "branch_only"}</td>
                    <td>{row.is_active === false ? "Inactive" : "Active"}</td>
                  </tr>
                ))}
                {!filteredStaff.length ? (
                  <tr><td colSpan={5} className="mb15-empty-cell">No staff assignments found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mb15-panel">
        <div className="mb15-panel__head">
          <div>
            <h2>Branch-Level Pricing</h2>
            <p>Optional per-branch price overrides layered on top of the global product price.</p>
          </div>
          {workspace?.actor.canManagePricing ? (
            <div className="mb15-inline-form">
              <select value={pricingForm.branchId} onChange={(event) => setPricingForm((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <select value={pricingForm.productId} onChange={(event) => setPricingForm((current) => ({ ...current, productId: event.target.value }))}>
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                ))}
              </select>
              <input type="number" step="0.01" min="0" value={pricingForm.price} onChange={(event) => setPricingForm((current) => ({ ...current, price: event.target.value }))} placeholder="Branch price" />
              <input type="number" step="0.01" min="0" value={pricingForm.minPrice} onChange={(event) => setPricingForm((current) => ({ ...current, minPrice: event.target.value }))} placeholder="Min price" />
              <input type="number" step="0.01" min="0" value={pricingForm.maxPrice} onChange={(event) => setPricingForm((current) => ({ ...current, maxPrice: event.target.value }))} placeholder="Max price" />
              <button type="button" className="mb15-btn mb15-btn--primary" onClick={() => void savePricingOverride()} disabled={saving}>
                <Save size={14} />
                Save
              </button>
            </div>
          ) : null}
        </div>
        <div className="mb15-table-wrap">
          <table className="mb15-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Global Price</th>
                <th>Branch Price</th>
                <th>Range</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPrices.map((row) => {
                const branch = normalizeRelation(row.branches);
                const product = normalizeRelation(row.products);
                return (
                  <tr key={row.id}>
                    <td>{branch?.name || "-"}</td>
                    <td>{product?.name || "-"}</td>
                    <td>{product?.sku || "-"}</td>
                    <td>{formatCurrency(product?.selling_price)}</td>
                    <td>{formatCurrency(row.price)}</td>
                    <td>
                      {row.min_price || row.max_price
                        ? `${row.min_price ? formatCurrency(row.min_price) : "-"} to ${row.max_price ? formatCurrency(row.max_price) : "-"}`
                        : "-"}
                    </td>
                    <td>{formatDate(row.updated_at)}</td>
                    <td>
                      {workspace?.actor.canManagePricing ? (
                        <button type="button" className="mb15-link-btn mb15-link-btn--danger" onClick={() => void deletePricingOverride(row.branch_id, row.product_id)}>
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!filteredPrices.length ? (
                <tr><td colSpan={8} className="mb15-empty-cell">No branch price overrides configured yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showBranchModal ? (
        <div className="auth-modal__backdrop">
          <div className="auth-modal" style={{ textAlign: "left", maxWidth: 720 }}>
            <button className="auth-modal__close" onClick={() => setShowBranchModal(false)}>
              <X size={16} />
            </button>
            <h3 className="auth-modal__title" style={{ textAlign: "center" }}>
              {branchForm.id ? "Edit Branch Profile" : "Create Branch"}
            </h3>
            <div className="mb15-form-grid">
              <label className="mb15-field">
                <span>Branch name</span>
                <input value={branchForm.name} onChange={(event) => setBranchForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Branch code</span>
                <input value={branchForm.code} onChange={(event) => setBranchForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
              </label>
              <label className="mb15-field">
                <span>Phone</span>
                <input value={branchForm.phone} onChange={(event) => setBranchForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Email</span>
                <input value={branchForm.email} onChange={(event) => setBranchForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Manager</span>
                <input value={branchForm.managerName} onChange={(event) => setBranchForm((current) => ({ ...current, managerName: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Timezone</span>
                <input value={branchForm.timezone} onChange={(event) => setBranchForm((current) => ({ ...current, timezone: event.target.value }))} />
              </label>
              <label className="mb15-field mb15-field--full">
                <span>Address</span>
                <input value={branchForm.address} onChange={(event) => setBranchForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Receipt header</span>
                <input value={branchForm.receiptHeader} onChange={(event) => setBranchForm((current) => ({ ...current, receiptHeader: event.target.value }))} />
              </label>
              <label className="mb15-field">
                <span>Pricing mode</span>
                <select value={branchForm.pricingMode} onChange={(event) => setBranchForm((current) => ({ ...current, pricingMode: event.target.value as "global" | "branch_override" }))}>
                  <option value="global">Global pricing</option>
                  <option value="branch_override">Branch override pricing</option>
                </select>
              </label>
              <label className="mb15-field mb15-field--full">
                <span>Notes</span>
                <textarea rows={3} value={branchForm.notes} onChange={(event) => setBranchForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <label className="mb15-checkbox">
              <input type="checkbox" checked={branchForm.isActive} onChange={(event) => setBranchForm((current) => ({ ...current, isActive: event.target.checked }))} />
              Active branch
            </label>
            <button type="button" className="mb15-btn mb15-btn--primary mb15-btn--block" onClick={() => void saveBranch()} disabled={saving}>
              {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
              {branchForm.id ? "Update Branch" : "Create Branch"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

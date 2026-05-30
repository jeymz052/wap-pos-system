"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  BadgeDollarSign,
  Boxes,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type AuditActivityKind, type AuditWorkspace } from "@/lib/audit";
import { useSubscriptionAccess } from "@/components/SubscriptionProvider";
import FeatureLockedPanel from "@/components/subscription/FeatureLockedPanel";

const kindOptions: Array<{ value: AuditActivityKind | ""; label: string }> = [
  { value: "", label: "All activity" },
  { value: "login_history", label: "Login history" },
  { value: "product_change", label: "Product changes" },
  { value: "price_change", label: "Price changes" },
  { value: "stock_adjustment", label: "Stock adjustments" },
  { value: "deleted_record", label: "Deleted records" },
  { value: "void_log", label: "Void logs" },
  { value: "refund_log", label: "Refund logs" },
  { value: "user_activity", label: "User activity" },
];

const moduleOptions = [
  { value: "", label: "All modules" },
  { value: "auth", label: "Auth" },
  { value: "inventory", label: "Inventory" },
  { value: "branches", label: "Branches" },
  { value: "pos", label: "POS" },
  { value: "returns", label: "Returns" },
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "users", label: "Users" },
];

const actionOptions = [
  { value: "", label: "All actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "success", label: "Login success" },
  { value: "failed", label: "Login failed" },
  { value: "locked", label: "Login locked" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function badgeStyle(kind: AuditActivityKind) {
  const styles: Record<AuditActivityKind, { background: string; color: string }> = {
    login_history: { background: "#e0f2fe", color: "#075985" },
    product_change: { background: "#dcfce7", color: "#166534" },
    price_change: { background: "#fef3c7", color: "#92400e" },
    stock_adjustment: { background: "#ede9fe", color: "#6d28d9" },
    deleted_record: { background: "#fee2e2", color: "#991b1b" },
    void_log: { background: "#fce7f3", color: "#9d174d" },
    refund_log: { background: "#cffafe", color: "#155e75" },
    user_activity: { background: "#e2e8f0", color: "#334155" },
  };

  return styles[kind];
}

function renderPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || Object.keys(payload).length === 0) return "None";
  return JSON.stringify(payload, null, 2);
}

async function getAuthHeaders() {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;
  if (!token) throw new Error("Please sign in again to continue.");

  return {
    Authorization: `Bearer ${token}`,
  };
}

type FilterState = {
  search: string;
  kind: string;
  module: string;
  action: string;
  userId: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
};

function AuditLogsScreen({ initialFilters }: { initialFilters: FilterState }) {
  const [workspace, setWorkspace] = useState<AuditWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [filters, setFilters] = useState(initialFilters);

  const deferredSearch = useDeferredValue(filters.search);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));

    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.module) params.set("module", filters.module);
    if (filters.action) params.set("action", filters.action);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.branchId) params.set("branchId", filters.branchId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);

    return params.toString();
  }, [deferredSearch, filters.action, filters.branchId, filters.dateFrom, filters.dateTo, filters.kind, filters.module, filters.userId, limit, page]);

  useEffect(() => {
    let isCancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      setError("");

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/audit-logs?${queryString}`, { headers });
        const payload = (await response.json()) as AuditWorkspace & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load the audit trail.");
        }

        if (!isCancelled) {
          setWorkspace(payload);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the audit trail.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [queryString]);

  async function exportAuditTrail() {
    setExporting(true);
    setError("");

    try {
      const params = new URLSearchParams(queryString);
      params.set("export", "csv");
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/audit-logs?${params.toString()}`, { headers });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to export the audit trail.");
      }

      const csv = await response.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export the audit trail.");
    } finally {
      setExporting(false);
    }
  }

  const rows = workspace?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((workspace?.total ?? 0) / limit));
  const summary = workspace?.summary;

  return (
    <div className="page" style={{ padding: "28px 32px 40px" }}>
      <section
        style={{
          borderRadius: 28,
          padding: "28px 28px 24px",
          background: "linear-gradient(145deg, #0f172a 0%, #1d4ed8 55%, #38bdf8 100%)",
          color: "#f8fafc",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <ShieldCheck size={14} />
              Module 17
            </div>
            <h1 style={{ margin: "14px 0 10px", fontSize: "2rem", lineHeight: 1.1 }}>Audit Logs & Activity History</h1>
            <p style={{ margin: 0, maxWidth: 680, color: "rgba(241,245,249,0.88)", fontSize: 15, lineHeight: 1.7 }}>
              Review login history, product and price changes, stock adjustments, deleted records, voids, refunds, and broader staff activity from one searchable trail.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setFilters({
                  search: "",
                  kind: "",
                  module: "",
                  action: "",
                  userId: "",
                  branchId: "",
                  dateFrom: "",
                  dateTo: "",
                });
                setPage(1);
                setLimit(50);
              }}
              style={{
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                borderRadius: 14,
                padding: "10px 14px",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={16} />
              Reset Filters
            </button>
            <button
              type="button"
              onClick={() => void exportAuditTrail()}
              disabled={exporting || loading}
              style={{
                border: "none",
                background: "#f8fafc",
                color: "#0f172a",
                borderRadius: 14,
                padding: "10px 16px",
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                cursor: exporting || loading ? "not-allowed" : "pointer",
                opacity: exporting || loading ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              {exporting ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}
              Export Audit Trail
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 16, background: "#fee2e2", color: "#991b1b" }}>
          {error}
        </div>
      ) : null}

      <section style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {[
          { label: "Logins", value: summary?.logins ?? 0, icon: ShieldCheck, tone: "#0284c7" },
          { label: "Product Changes", value: summary?.productChanges ?? 0, icon: Boxes, tone: "#16a34a" },
          { label: "Price Changes", value: summary?.priceChanges ?? 0, icon: BadgeDollarSign, tone: "#d97706" },
          { label: "Stock Adjustments", value: summary?.stockAdjustments ?? 0, icon: Archive, tone: "#7c3aed" },
          { label: "Deleted Records", value: summary?.deletedRecords ?? 0, icon: Trash2, tone: "#dc2626" },
          { label: "Voids", value: summary?.voids ?? 0, icon: ReceiptText, tone: "#db2777" },
          { label: "Refunds", value: summary?.refunds ?? 0, icon: RotateCcw, tone: "#0891b2" },
          { label: "User Activity", value: summary?.userActivities ?? 0, icon: UserRound, tone: "#475569" },
        ].map((card) => (
          <article
            key={card.label}
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: "18px 18px 16px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 700 }}>{card.label}</span>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${card.tone}18`,
                  color: card.tone,
                }}
              >
                <card.icon size={16} />
              </span>
            </div>
            <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{card.value}</div>
          </article>
        ))}
      </section>

      <section
        style={{
          marginTop: 22,
          background: "#fff",
          borderRadius: 24,
          border: "1px solid #e2e8f0",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 22, borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Search</span>
              <span style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#94a3b8" }} />
                <input
                  value={filters.search}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, search: event.target.value }));
                    setPage(1);
                  }}
                  placeholder="User, summary, reference..."
                  style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 12, border: "1px solid #cbd5e1" }}
                />
              </span>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Activity Type</span>
              <select
                value={filters.kind}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, kind: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              >
                {kindOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Module</span>
              <select
                value={filters.module}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, module: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              >
                {moduleOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Action</span>
              <select
                value={filters.action}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, action: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              >
                {actionOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>User</span>
              <select
                value={filters.userId}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, userId: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              >
                <option value="">All users</option>
                {(workspace?.users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Branch</span>
              <select
                value={filters.branchId}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, branchId: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              >
                <option value="">All branches</option>
                {(workspace?.branches ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>From</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, dateFrom: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>To</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, dateTo: event.target.value }));
                  setPage(1);
                }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #cbd5e1" }}
              />
            </label>
          </div>
        </div>

        <div style={{ padding: "16px 22px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Showing <strong>{rows.length}</strong> of <strong>{workspace?.total ?? 0}</strong> matching events
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569" }}>
            Rows
            <select
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1" }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#475569" }}>
            <LoaderCircle size={24} className="spin" style={{ marginBottom: 12 }} />
            Loading audit activity...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            No audit records matched the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Event</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>User</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Module</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Branch</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Reference</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const badge = badgeStyle(row.activity_kind);
                  return (
                    <tr key={`${row.event_source}-${row.event_id}`} style={{ borderTop: "1px solid #e2e8f0", verticalAlign: "top" }}>
                      <td style={{ padding: 18 }}>
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                borderRadius: 999,
                                padding: "6px 10px",
                                background: badge.background,
                                color: badge.color,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <Activity size={13} />
                              {kindOptions.find((option) => option.value === row.activity_kind)?.label ?? row.activity_kind}
                            </span>
                            <span style={{ fontSize: 12, color: "#64748b" }}>{formatDate(row.event_at)}</span>
                          </div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.summary}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            Source: {row.event_source} • Action: {row.action}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.actor_name || "System"}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{row.user_id || "No user id"}</div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>{row.module}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{row.reference_type || "No reference type"}</div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <div style={{ color: "#0f172a" }}>{row.branch_name || "Cross-branch / system"}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{row.branch_id || ""}</div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.record_label || row.reference_type || "Record"}</div>
                        <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-all" }}>{row.reference_id || "No reference id"}</div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <details>
                          <summary style={{ cursor: "pointer", color: "#2563eb", fontWeight: 700 }}>View payload</summary>
                          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Old Values</div>
                              <pre style={{ margin: 0, padding: 12, borderRadius: 14, background: "#0f172a", color: "#e2e8f0", fontSize: 12, overflowX: "auto" }}>
                                {renderPayload(row.old_values)}
                              </pre>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>New Values</div>
                              <pre style={{ margin: 0, padding: 12, borderRadius: 14, background: "#eff6ff", color: "#0f172a", fontSize: 12, overflowX: "auto", border: "1px solid #bfdbfe" }}>
                                {renderPayload(row.new_values)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.6 : 1 }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.6 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AuditLogsPageContent() {
  const { loading: subscriptionLoading, hasFeature, requiredPlanFor } = useSubscriptionAccess();
  const searchParams = useSearchParams();

  const initialFilters = useMemo<FilterState>(() => ({
    search: searchParams.get("search") ?? "",
    kind: searchParams.get("kind") ?? "",
    module: searchParams.get("module") ?? "",
    action: searchParams.get("action") ?? "",
    userId: searchParams.get("userId") ?? "",
    branchId: searchParams.get("branchId") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  }), [searchParams]);

  if (!subscriptionLoading && !hasFeature("audit_logs")) {
    return (
      <FeatureLockedPanel
        featureName="Audit Logs"
        requiredPlan={requiredPlanFor("audit_logs")}
        description="Audit trails, activity history, void and refund traceability, and compliance logging are locked on the current plan."
      />
    );
  }

  return <AuditLogsScreen key={searchParams.toString()} initialFilters={initialFilters} />;
}

export default function AuditLogsPage() {
  return (
    <Suspense fallback={<div className="page" style={{ padding: "28px 32px 40px" }}>Loading audit logs...</div>}>
      <AuditLogsPageContent />
    </Suspense>
  );
}

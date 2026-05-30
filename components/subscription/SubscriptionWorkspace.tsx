"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Users,
  Warehouse,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  FEATURE_LABELS,
  PLAN_ORDER,
  formatLimit,
  formatPlanName,
  getPlanRank,
  type SubscriptionPlan,
} from "@/lib/subscription-config";

type WorkspacePayload = {
  actor: {
    canView: boolean;
    canManage: boolean;
  };
  snapshot: {
    plan: SubscriptionPlan;
    display_name: string | null;
    payment_status: string;
    billing_cycle: string;
    currency_code: string;
    renewal_date: string | null;
    is_trial: boolean;
    trial_ends_at: string | null;
    branch_limit: number | null;
    user_limit: number | null;
    product_limit: number | null;
  };
  usage: {
    active_branch_count: number;
    active_user_count: number;
    active_product_count: number;
    open_invoice_count: number;
    branch_usage_percent: number;
    user_usage_percent: number;
    product_usage_percent: number;
  };
  plans: Array<{
    plan: SubscriptionPlan;
    display_name: string;
    description: string;
    branch_limit: number | null;
    user_limit: number | null;
    product_limit: number | null;
    monthly_price: number;
    annual_price: number;
    badge_text: string | null;
    accent_color: string;
  }>;
  features: Array<{
    code: keyof typeof FEATURE_LABELS;
    displayName: string;
    description: string;
    category: string;
    isEnabled: boolean;
    minimumPlan: SubscriptionPlan;
    overrideNotes: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    status: string;
    due_date: string | null;
    issued_at: string;
    billing_period_start: string | null;
    billing_period_end: string | null;
    currency_code: string;
    total_amount: number;
    paid_amount: number;
    payment_reference: string | null;
  }>;
  changes: Array<{
    id: string;
    previous_plan: string | null;
    next_plan: string;
    change_reason: string | null;
    effective_on: string;
    changed_by_name: string | null;
  }>;
};

type ToastState = { ok: boolean; msg: string } | null;

function formatMoney(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace("PHP", "P");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SubscriptionWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");

    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedFetch("/api/subscriptions");
      const payload = (await response.json()) as WorkspacePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load the subscription workspace.");
      }

      setWorkspace(payload);
      setBillingCycle(payload.snapshot.billing_cycle === "annual" ? "annual" : "monthly");
    } catch (error) {
      showToast(false, error instanceof Error ? error.message : "Unable to load the subscription workspace.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function postAction(saveId: string, body: Record<string, unknown>, successMessage: string) {
    setSavingKey(saveId);
    try {
      const response = await authorizedFetch("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update subscription settings.");
      }

      showToast(true, payload.message ?? successMessage);
      await loadWorkspace();
    } catch (error) {
      showToast(false, error instanceof Error ? error.message : "Unable to update subscription settings.");
    } finally {
      setSavingKey(null);
    }
  }

  const currentPlanRank = getPlanRank(workspace?.snapshot.plan);
  const featuresByPlan = useMemo(() => {
    const map = new Map<SubscriptionPlan, string[]>();
    for (const plan of PLAN_ORDER) {
      const enabled = (workspace?.features ?? [])
        .filter((feature) => getPlanRank(feature.minimumPlan) <= getPlanRank(plan))
        .map((feature) => feature.displayName);
      map.set(plan, enabled);
    }
    return map;
  }, [workspace?.features]);

  if (loading || !workspace) {
    return (
      <div style={{ padding: 32, display: "flex", alignItems: "center", gap: 10, color: "#475569" }}>
        <LoaderCircle size={18} className="spin" />
        Loading subscription workspace...
      </div>
    );
  }

  if (!workspace.actor.canView) {
    return (
      <div style={{ padding: 32, color: "#991b1b" }}>
        You do not have permission to view the subscription workspace.
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px 40px", display: "grid", gap: 22 }}>
      <section
        style={{
          borderRadius: 28,
          padding: "28px 28px 24px",
          background: "linear-gradient(145deg, #082f49 0%, #1d4ed8 55%, #38bdf8 100%)",
          color: "#eff6ff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.14)", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              <Sparkles size={14} />
              Module 20
            </div>
            <h1 style={{ margin: "14px 0 10px", fontSize: "2rem", lineHeight: 1.1 }}>
              Subscription &amp; SaaS Management
            </h1>
            <p style={{ margin: 0, lineHeight: 1.7, color: "rgba(239,246,255,0.9)" }}>
              Track your active plan, usage limits, payment status, renewal timing, invoice history,
              and feature access from one workspace.
            </p>
          </div>

          <div style={{ display: "grid", gap: 12, minWidth: 260 }}>
            <div style={{ padding: "16px 18px", borderRadius: 20, background: "rgba(255,255,255,0.14)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.86 }}>Current Plan</div>
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
                {workspace.snapshot.display_name ?? formatPlanName(workspace.snapshot.plan)}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ borderRadius: 999, padding: "6px 10px", background: "rgba(15,23,42,0.28)", fontSize: 12, fontWeight: 700 }}>
                  {normalizeStatus(workspace.snapshot.payment_status)}
                </span>
                <span style={{ borderRadius: 999, padding: "6px 10px", background: "rgba(15,23,42,0.28)", fontSize: 12, fontWeight: 700 }}>
                  {normalizeStatus(workspace.snapshot.billing_cycle)}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div style={{ padding: "14px 16px", borderRadius: 18, background: "rgba(255,255,255,0.12)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.86 }}>Renewal</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{formatDate(workspace.snapshot.renewal_date)}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 18, background: "rgba(255,255,255,0.12)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.86 }}>Trial Ends</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{formatDate(workspace.snapshot.trial_ends_at)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          {
            label: "Active Branches",
            value: `${workspace.usage.active_branch_count} / ${formatLimit(workspace.snapshot.branch_limit)}`,
            sub: `${workspace.usage.branch_usage_percent.toFixed(0)}% used`,
            icon: Warehouse,
            tone: "#0f766e",
          },
          {
            label: "Active Users",
            value: `${workspace.usage.active_user_count} / ${formatLimit(workspace.snapshot.user_limit)}`,
            sub: `${workspace.usage.user_usage_percent.toFixed(0)}% used`,
            icon: Users,
            tone: "#1d4ed8",
          },
          {
            label: "Active Products",
            value: `${workspace.usage.active_product_count} / ${formatLimit(workspace.snapshot.product_limit)}`,
            sub: `${workspace.usage.product_usage_percent.toFixed(0)}% used`,
            icon: TrendingUp,
            tone: "#7c3aed",
          },
          {
            label: "Open Invoices",
            value: `${workspace.usage.open_invoice_count}`,
            sub: normalizeStatus(workspace.snapshot.payment_status),
            icon: ReceiptText,
            tone: "#d97706",
          },
        ].map((card) => (
          <article
            key={card.label}
            style={{
              borderRadius: 22,
              padding: "18px 18px 16px",
              background: "#fff",
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>{card.label}</span>
              <span style={{ width: 36, height: 36, borderRadius: 12, background: `${card.tone}18`, color: card.tone, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <card.icon size={17} />
              </span>
            </div>
            <div style={{ marginTop: 12, fontSize: 27, fontWeight: 800, color: "#0f172a" }}>{card.value}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{card.sub}</div>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {workspace.plans.map((plan) => {
          const isCurrent = plan.plan === workspace.snapshot.plan;
          const recommended = plan.plan === "professional";
          const isUpgrade = getPlanRank(plan.plan) > currentPlanRank;
          const accent = plan.accent_color;

          return (
            <article
              key={plan.plan}
              style={{
                borderRadius: 24,
                border: isCurrent ? `2px solid ${accent}` : "1px solid #dbe4f0",
                background: "#fff",
                boxShadow: isCurrent ? `0 18px 36px ${accent}20` : "0 12px 26px rgba(15, 23, 42, 0.06)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "22px 22px 16px", background: `linear-gradient(145deg, ${accent}18 0%, #ffffff 72%)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>{plan.display_name}</h2>
                    <p style={{ margin: "10px 0 0", color: "#475569", lineHeight: 1.6 }}>{plan.description}</p>
                  </div>
                  {plan.badge_text || recommended ? (
                    <span style={{ borderRadius: 999, padding: "7px 10px", background: accent, color: "#fff", fontSize: 11, fontWeight: 700 }}>
                      {plan.badge_text ?? "Recommended"}
                    </span>
                  ) : null}
                </div>

                <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <strong style={{ fontSize: 32, color: "#0f172a" }}>
                    {formatMoney(billingCycle === "annual" ? plan.annual_price : plan.monthly_price, workspace.snapshot.currency_code)}
                  </strong>
                  <span style={{ color: "#64748b" }}>/{billingCycle === "annual" ? "year" : "month"}</span>
                </div>
              </div>

              <div style={{ padding: 22, display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 16, background: "#f8fafc" }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Branches</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{formatLimit(plan.branch_limit)}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 16, background: "#f8fafc" }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Users</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{formatLimit(plan.user_limit)}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 16, background: "#f8fafc" }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Products</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{formatLimit(plan.product_limit)}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {featuresByPlan.get(plan.plan)?.map((feature) => (
                    <div key={`${plan.plan}-${feature}`} style={{ display: "flex", alignItems: "center", gap: 10, color: "#1e293b" }}>
                      <CheckCircle2 size={15} color={accent} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {workspace.actor.canManage ? (
                  <button
                    type="button"
                    disabled={isCurrent || savingKey === `plan-${plan.plan}`}
                    onClick={() =>
                      void postAction(
                        `plan-${plan.plan}`,
                        {
                          action: "change_plan",
                          plan: plan.plan,
                          billingCycle,
                          reason: isUpgrade ? "Upgraded via subscription workspace." : "Downgraded via subscription workspace.",
                        },
                        "Plan updated.",
                      )
                    }
                    style={{
                      border: "none",
                      borderRadius: 16,
                      padding: "12px 16px",
                      background: isCurrent ? "#cbd5e1" : accent,
                      color: isCurrent ? "#475569" : "#fff",
                      fontWeight: 700,
                      cursor: isCurrent ? "default" : "pointer",
                      display: "inline-flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {savingKey === `plan-${plan.plan}` ? <LoaderCircle size={15} className="spin" /> : <BadgeCheck size={15} />}
                    {isCurrent ? "Current Plan" : isUpgrade ? "Upgrade Plan" : "Downgrade Plan"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.7fr)", gap: 18 }}>
        <article style={{ borderRadius: 24, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", borderBottom: "1px solid #e2e8f0" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Invoice History</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>Renewals, billing periods, and payment references.</p>
            </div>
            {workspace.actor.canManage ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={billingCycle}
                  onChange={(event) => setBillingCycle(event.target.value === "annual" ? "annual" : "monthly")}
                  style={{ borderRadius: 12, border: "1px solid #cbd5e1", padding: "10px 12px" }}
                >
                  <option value="monthly">Monthly Billing</option>
                  <option value="annual">Annual Billing</option>
                </select>
                <button
                  type="button"
                  onClick={() => void postAction("trial", { action: "start_trial", trialDays: 14 }, "Trial updated.")}
                  disabled={savingKey === "trial"}
                  style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 14px", background: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  {savingKey === "trial" ? <LoaderCircle size={15} className="spin" /> : "Start 14-Day Trial"}
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Invoice</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Period</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Amount</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Due</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Payment Ref</th>
                  <th style={{ padding: "14px 18px", fontSize: 12, color: "#475569", textTransform: "uppercase" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {workspace.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                      No subscription invoices recorded yet.
                    </td>
                  </tr>
                ) : (
                  workspace.invoices.map((invoice) => (
                    <tr key={invoice.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 18 }}>
                        <strong>{invoice.invoice_number}</strong>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>Issued {formatDate(invoice.issued_at)}</div>
                      </td>
                      <td style={{ padding: 18, color: "#0f172a" }}>
                        {formatDate(invoice.billing_period_start)} to {formatDate(invoice.billing_period_end)}
                      </td>
                      <td style={{ padding: 18 }}>
                        <strong>{formatMoney(invoice.total_amount, invoice.currency_code)}</strong>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>Paid {formatMoney(invoice.paid_amount, invoice.currency_code)}</div>
                      </td>
                      <td style={{ padding: 18 }}>
                        <span style={{ borderRadius: 999, padding: "6px 10px", background: invoice.status === "paid" ? "#dcfce7" : "#fee2e2", color: invoice.status === "paid" ? "#166534" : "#991b1b", fontSize: 12, fontWeight: 700 }}>
                          {normalizeStatus(invoice.status)}
                        </span>
                      </td>
                      <td style={{ padding: 18 }}>{formatDate(invoice.due_date)}</td>
                      <td style={{ padding: 18, color: "#475569" }}>{invoice.payment_reference ?? "-"}</td>
                      <td style={{ padding: 18 }}>
                        {workspace.actor.canManage && invoice.status !== "paid" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void postAction(
                                `invoice-${invoice.id}`,
                                {
                                  action: "record_invoice_payment",
                                  invoiceId: invoice.id,
                                  paidAmount: invoice.total_amount,
                                  paymentReference: `Manual-${invoice.invoice_number}`,
                                },
                                "Invoice marked as paid.",
                              )
                            }
                            disabled={savingKey === `invoice-${invoice.id}`}
                            style={{ border: "none", borderRadius: 12, padding: "10px 12px", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                          >
                            {savingKey === `invoice-${invoice.id}` ? <LoaderCircle size={14} className="spin" /> : "Mark Paid"}
                          </button>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>Settled</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article style={{ borderRadius: 24, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)", padding: 22, display: "grid", gap: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Feature Locks</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              Live feature access resolves from the current plan plus any admin override.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {workspace.features.map((feature) => (
              <div key={feature.code} style={{ borderRadius: 18, padding: "14px 16px", background: feature.isEnabled ? "#f0fdf4" : "#fff7ed", border: `1px solid ${feature.isEnabled ? "#bbf7d0" : "#fed7aa"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ color: "#0f172a" }}>{feature.displayName}</strong>
                  <span style={{ fontSize: 12, fontWeight: 700, color: feature.isEnabled ? "#166534" : "#9a3412" }}>
                    {feature.isEnabled ? "Enabled" : `Locked until ${formatPlanName(feature.minimumPlan)}`}
                  </span>
                </div>
                <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.5 }}>{feature.description}</p>
                {feature.overrideNotes ? (
                  <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 12 }}>
                    Override: {feature.overrideNotes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ borderRadius: 18, padding: "16px 18px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#0f172a", fontWeight: 700 }}>
              <CalendarDays size={16} />
              Renewal &amp; Change Log
            </div>
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {workspace.changes.length === 0 ? (
                <div style={{ color: "#64748b" }}>No plan changes logged yet.</div>
              ) : (
                workspace.changes.map((change) => (
                  <div key={change.id} style={{ paddingBottom: 10, borderBottom: "1px dashed #cbd5e1" }}>
                    <strong style={{ color: "#0f172a" }}>
                      {change.previous_plan ? formatPlanName(change.previous_plan) : "Initial Plan"} to {formatPlanName(change.next_plan)}
                    </strong>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                      Effective {formatDate(change.effective_on)} {change.changed_by_name ? `by ${change.changed_by_name}` : ""}
                    </div>
                    {change.change_reason ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>{change.change_reason}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          {workspace.actor.canManage ? (
            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={() => void postAction("status-paid", { action: "update_payment_status", paymentStatus: "paid" }, "Subscription marked paid.")}
                disabled={savingKey === "status-paid"}
                style={{ border: "none", borderRadius: 14, padding: "12px 14px", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {savingKey === "status-paid" ? <LoaderCircle size={15} className="spin" /> : <CreditCard size={15} />}
                Set Payment Status: Paid
              </button>
              <button
                type="button"
                onClick={() => void postAction("status-overdue", { action: "update_payment_status", paymentStatus: "overdue" }, "Subscription marked overdue.")}
                disabled={savingKey === "status-overdue"}
                style={{ border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", background: "#fff1f2", color: "#b91c1c", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {savingKey === "status-overdue" ? <LoaderCircle size={15} className="spin" /> : <AlertTriangle size={15} />}
                Set Payment Status: Overdue
              </button>
            </div>
          ) : null}
        </article>
      </section>

      {toast ? (
        <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 50, borderRadius: 16, padding: "12px 14px", background: toast.ok ? "#ecfdf5" : "#fef2f2", color: toast.ok ? "#166534" : "#991b1b", boxShadow: "0 20px 34px rgba(15, 23, 42, 0.12)", display: "flex", gap: 10, alignItems: "center" }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{toast.msg}</span>
        </div>
      ) : null}
    </div>
  );
}

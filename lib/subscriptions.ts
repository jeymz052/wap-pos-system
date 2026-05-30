import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  FEATURE_LABELS,
  FEATURE_MIN_PLAN,
  FEATURE_ORDER,
  formatPlanName,
  getPlanRank,
  type SubscriptionFeatureCode,
  type SubscriptionPlan,
} from "@/lib/subscription-config";

type AccessLike = {
  roleName: string | null;
  permissions: Set<string>;
};

export type PlanDefinition = {
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
  sort_order: number;
};

export type SubscriptionUsage = {
  active_branch_count: number;
  active_user_count: number;
  active_product_count: number;
  open_invoice_count: number;
  branch_usage_percent: number;
  user_usage_percent: number;
  product_usage_percent: number;
};

export type SubscriptionSnapshot = {
  subscription_id: string | null;
  plan: SubscriptionPlan;
  display_name: string | null;
  is_active: boolean;
  is_trial: boolean;
  trial_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  renewal_date: string | null;
  payment_status: string;
  billing_cycle: string;
  currency_code: string;
  branch_limit: number | null;
  user_limit: number | null;
  product_limit: number | null;
};

export type SubscriptionFeatureState = {
  code: SubscriptionFeatureCode;
  displayName: string;
  description: string;
  category: string;
  isEnabled: boolean;
  minimumPlan: SubscriptionPlan;
  overrideNotes: string | null;
};

export type SubscriptionAccessSummary = {
  snapshot: SubscriptionSnapshot;
  usage: SubscriptionUsage;
  features: SubscriptionFeatureState[];
};

export type SubscriptionInvoice = {
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
  created_at: string;
};

export type SubscriptionChangeLog = {
  id: string;
  previous_plan: string | null;
  next_plan: string;
  change_reason: string | null;
  effective_on: string;
  created_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
};

export type SubscriptionWorkspace = {
  actor: {
    canView: boolean;
    canManage: boolean;
  };
  snapshot: SubscriptionSnapshot;
  usage: SubscriptionUsage;
  plans: PlanDefinition[];
  features: SubscriptionFeatureState[];
  invoices: SubscriptionInvoice[];
  changes: SubscriptionChangeLog[];
};

function hasPermission(actor: AccessLike | null | undefined, permission: string) {
  if (!actor) return false;
  return actor.roleName === "super_admin" || actor.permissions.has(permission);
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = normalizeNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePlan(value: string | null | undefined): SubscriptionPlan {
  if (value === "professional" || value === "enterprise") return value;
  return "starter";
}

export function buildDefaultAccessSummary(): SubscriptionAccessSummary {
  const snapshot: SubscriptionSnapshot = {
    subscription_id: null,
    plan: "starter",
    display_name: formatPlanName("starter"),
    is_active: true,
    is_trial: true,
    trial_ends_at: null,
    starts_at: null,
    ends_at: null,
    renewal_date: null,
    payment_status: "trial",
    billing_cycle: "monthly",
    currency_code: "PHP",
    branch_limit: 1,
    user_limit: 3,
    product_limit: 500,
  };

  return {
    snapshot,
    usage: {
      active_branch_count: 0,
      active_user_count: 0,
      active_product_count: 0,
      open_invoice_count: 0,
      branch_usage_percent: 0,
      user_usage_percent: 0,
      product_usage_percent: 0,
    },
    features: FEATURE_ORDER.map((code) => ({
      code,
      displayName: FEATURE_LABELS[code],
      description: FEATURE_LABELS[code],
      category: "operations",
      isEnabled: getPlanRank(snapshot.plan) >= getPlanRank(FEATURE_MIN_PLAN[code]),
      minimumPlan: FEATURE_MIN_PLAN[code],
      overrideNotes: null,
    })),
  };
}

export async function getSubscriptionAccessSummary(): Promise<SubscriptionAccessSummary> {
  const usageResult = await supabaseAdmin.from("v_subscription_usage").select("*").maybeSingle();
  const featureResult = await supabaseAdmin.from("v_subscription_feature_matrix").select("*").order("category").order("display_name");

  if (usageResult.error) throw usageResult.error;
  if (featureResult.error) throw featureResult.error;

  if (!usageResult.data) {
    return buildDefaultAccessSummary();
  }

  const usageRow = usageResult.data as Record<string, unknown>;
  const snapshot: SubscriptionSnapshot = {
    subscription_id: typeof usageRow.subscription_id === "string" ? usageRow.subscription_id : null,
    plan: normalizePlan(usageRow.plan as string | null | undefined),
    display_name: typeof usageRow.display_name === "string" ? usageRow.display_name : null,
    is_active: Boolean(usageRow.is_active),
    is_trial: Boolean(usageRow.is_trial),
    trial_ends_at: typeof usageRow.trial_ends_at === "string" ? usageRow.trial_ends_at : null,
    starts_at: typeof usageRow.starts_at === "string" ? usageRow.starts_at : null,
    ends_at: typeof usageRow.ends_at === "string" ? usageRow.ends_at : null,
    renewal_date: typeof usageRow.renewal_date === "string" ? usageRow.renewal_date : null,
    payment_status: typeof usageRow.payment_status === "string" ? usageRow.payment_status : "trial",
    billing_cycle: typeof usageRow.billing_cycle === "string" ? usageRow.billing_cycle : "monthly",
    currency_code: typeof usageRow.currency_code === "string" ? usageRow.currency_code : "PHP",
    branch_limit: normalizeNullableNumber(usageRow.branch_limit),
    user_limit: normalizeNullableNumber(usageRow.user_limit),
    product_limit: normalizeNullableNumber(usageRow.product_limit),
  };

  return {
    snapshot,
    usage: {
      active_branch_count: normalizeNumber(usageRow.active_branch_count),
      active_user_count: normalizeNumber(usageRow.active_user_count),
      active_product_count: normalizeNumber(usageRow.active_product_count),
      open_invoice_count: normalizeNumber(usageRow.open_invoice_count),
      branch_usage_percent: normalizeNumber(usageRow.branch_usage_percent),
      user_usage_percent: normalizeNumber(usageRow.user_usage_percent),
      product_usage_percent: normalizeNumber(usageRow.product_usage_percent),
    },
    features: ((featureResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const code = String(row.code ?? "") as SubscriptionFeatureCode;
      return {
        code,
        displayName: String(row.display_name ?? FEATURE_LABELS[code]),
        description: String(row.description ?? FEATURE_LABELS[code]),
        category: String(row.category ?? "operations"),
        isEnabled: Boolean(row.is_enabled),
        minimumPlan: FEATURE_MIN_PLAN[code] ?? "starter",
        overrideNotes: typeof row.override_notes === "string" ? row.override_notes : null,
      };
    }),
  };
}

export async function getSubscriptionWorkspace(actor: AccessLike | null | undefined): Promise<SubscriptionWorkspace> {
  const [access, plansResult, invoicesResult, changesResult] = await Promise.all([
    getSubscriptionAccessSummary(),
    supabaseAdmin.from("subscription_plan_definitions").select("*").eq("is_active", true).order("sort_order"),
    supabaseAdmin
      .from("subscription_invoices")
      .select("id, invoice_number, status, due_date, issued_at, billing_period_start, billing_period_end, currency_code, total_amount, paid_amount, payment_reference, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("subscription_plan_change_log")
      .select("id, previous_plan, next_plan, change_reason, effective_on, created_at, changed_by, users(first_name, last_name, username)")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  if (plansResult.error) throw plansResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  if (changesResult.error) throw changesResult.error;

  return {
    actor: {
      canView: hasPermission(actor, "subscriptions:view") || hasPermission(actor, "subscriptions:manage"),
      canManage: hasPermission(actor, "subscriptions:manage"),
    },
    snapshot: access.snapshot,
    usage: access.usage,
    plans: ((plansResult.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => ({
        plan: normalizePlan(row.plan as string | null | undefined),
        display_name: String(row.display_name ?? formatPlanName(row.plan as string)),
        description: String(row.description ?? ""),
        branch_limit: normalizeNullableNumber(row.branch_limit),
        user_limit: normalizeNullableNumber(row.user_limit),
        product_limit: normalizeNullableNumber(row.product_limit),
        monthly_price: normalizeNumber(row.monthly_price),
        annual_price: normalizeNumber(row.annual_price),
        badge_text: typeof row.badge_text === "string" ? row.badge_text : null,
        accent_color: typeof row.accent_color === "string" ? row.accent_color : "#1d4ed8",
        sort_order: normalizeNumber(row.sort_order),
      }))
      .sort((left, right) => getPlanRank(left.plan) - getPlanRank(right.plan)),
    features: access.features.sort((left, right) => FEATURE_ORDER.indexOf(left.code) - FEATURE_ORDER.indexOf(right.code)),
    invoices: ((invoicesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      invoice_number: String(row.invoice_number ?? `SUB-${String(row.id).slice(0, 8)}`),
      status: String(row.status ?? "unpaid"),
      due_date: typeof row.due_date === "string" ? row.due_date : null,
      issued_at: String(row.issued_at ?? row.created_at ?? new Date().toISOString()),
      billing_period_start: typeof row.billing_period_start === "string" ? row.billing_period_start : null,
      billing_period_end: typeof row.billing_period_end === "string" ? row.billing_period_end : null,
      currency_code: String(row.currency_code ?? "PHP"),
      total_amount: normalizeNumber(row.total_amount),
      paid_amount: normalizeNumber(row.paid_amount),
      payment_reference: typeof row.payment_reference === "string" ? row.payment_reference : null,
      created_at: String(row.created_at ?? new Date().toISOString()),
    })),
    changes: ((changesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const userRelation = row.users as
        | { first_name?: string | null; last_name?: string | null; username?: string | null }
        | Array<{ first_name?: string | null; last_name?: string | null; username?: string | null }>
        | null
        | undefined;
      const user = Array.isArray(userRelation) ? userRelation[0] : userRelation;
      const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.username || null;

      return {
        id: String(row.id),
        previous_plan: typeof row.previous_plan === "string" ? row.previous_plan : null,
        next_plan: String(row.next_plan ?? "starter"),
        change_reason: typeof row.change_reason === "string" ? row.change_reason : null,
        effective_on: String(row.effective_on ?? new Date().toISOString().slice(0, 10)),
        created_at: String(row.created_at ?? new Date().toISOString()),
        changed_by: typeof row.changed_by === "string" ? row.changed_by : null,
        changed_by_name: displayName,
      };
    }),
  };
}

export function hasSubscriptionFeature(summary: SubscriptionAccessSummary, feature: SubscriptionFeatureCode) {
  return summary.features.some((item) => item.code === feature && item.isEnabled);
}

export async function requireSubscriptionFeature(feature: SubscriptionFeatureCode) {
  const summary = await getSubscriptionAccessSummary();
  return hasSubscriptionFeature(summary, feature);
}

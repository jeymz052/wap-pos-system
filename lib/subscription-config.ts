export const PLAN_ORDER = ["starter", "professional", "enterprise"] as const;

export type SubscriptionPlan = (typeof PLAN_ORDER)[number];

export const FEATURE_ORDER = [
  "pos",
  "basic_inventory",
  "basic_reports",
  "barcode_printing",
  "purchase_orders",
  "customer_credit",
  "advanced_reports",
  "multi_branch_transfers",
  "api_access",
  "audit_logs",
  "advanced_analytics",
  "custom_branding",
] as const;

export type SubscriptionFeatureCode = (typeof FEATURE_ORDER)[number];

export const FEATURE_LABELS: Record<SubscriptionFeatureCode, string> = {
  pos: "POS",
  basic_inventory: "Basic Inventory",
  basic_reports: "Basic Reports",
  barcode_printing: "Barcode Printing",
  purchase_orders: "Purchase Orders",
  customer_credit: "Customer Credit",
  advanced_reports: "Advanced Reports",
  multi_branch_transfers: "Multi-Branch Transfers",
  api_access: "API Access",
  audit_logs: "Audit Logs",
  advanced_analytics: "Advanced Analytics",
  custom_branding: "Custom Branding",
};

export const FEATURE_MIN_PLAN: Record<SubscriptionFeatureCode, SubscriptionPlan> = {
  pos: "starter",
  basic_inventory: "starter",
  basic_reports: "starter",
  barcode_printing: "professional",
  purchase_orders: "professional",
  customer_credit: "professional",
  advanced_reports: "professional",
  multi_branch_transfers: "enterprise",
  api_access: "enterprise",
  audit_logs: "enterprise",
  advanced_analytics: "enterprise",
  custom_branding: "enterprise",
};

export function getPlanRank(plan: string | null | undefined) {
  const index = PLAN_ORDER.indexOf((plan ?? "") as SubscriptionPlan);
  return index === -1 ? 0 : index;
}

export function formatPlanName(plan: string | null | undefined) {
  switch (plan) {
    case "starter":
      return "Starter Plan";
    case "professional":
      return "Professional Plan";
    case "enterprise":
      return "Enterprise Plan";
    default:
      return "Subscription Plan";
  }
}

export function formatLimit(limit: number | null | undefined) {
  if (limit === null || limit === undefined || limit <= 0) return "Unlimited";
  return `${limit}`;
}

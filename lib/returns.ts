export const returnStatusOptions = [
  "requested",
  "approved",
  "rejected",
  "refunded",
  "exchanged",
  "warranty_processing",
] as const;

export const returnRequestTypes = ["refund", "exchange", "warranty"] as const;
export const refundMethodOptions = ["cash", "card", "gcash", "ewallet", "customer_credit"] as const;
export const returnConditionOptions = ["good", "damaged", "defective"] as const;
export const stockActionOptions = ["restock", "hold", "damage", "vendor_return"] as const;

export type ReturnStatus = (typeof returnStatusOptions)[number];
export type ReturnRequestType = (typeof returnRequestTypes)[number];
export type RefundMethod = (typeof refundMethodOptions)[number];
export type ReturnCondition = (typeof returnConditionOptions)[number];
export type StockAction = (typeof stockActionOptions)[number];

export function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatReturnLabel(value?: string | null) {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace("PHP", "\u20b1");
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

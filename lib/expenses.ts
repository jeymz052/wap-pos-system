export type ExpenseStatus = "pending" | "approved" | "rejected";

export type ExpenseType =
  | "operating"
  | "supplier_payment"
  | "salary"
  | "rent"
  | "utilities"
  | "delivery"
  | "other";

export type ExpensePaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "gcash"
  | "ewallet"
  | "customer_credit"
  | "split";

export type BranchRow = {
  id: string;
  name: string;
  is_main?: boolean | null;
};

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean | null;
};

export type SupplierRow = {
  id: string;
  name: string;
  branch_id?: string | null;
};

export type StaffUserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  branch_id?: string | null;
  is_active?: boolean | null;
};

export type ExpenseRow = {
  id: string;
  branch_id: string;
  expense_category_id?: string | null;
  supplier_id?: string | null;
  supplier_payment_id?: string | null;
  staff_user_id?: string | null;
  expense_type: ExpenseType;
  amount: number | string;
  description: string;
  expense_date: string;
  payment_method?: ExpensePaymentMethod | null;
  receipt_url?: string | null;
  receipt_file_name?: string | null;
  reference_number?: string | null;
  status: ExpenseStatus;
  approval_notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type ExpensesSnapshot = {
  branches: BranchRow[];
  categories: ExpenseCategoryRow[];
  suppliers: SupplierRow[];
  staff: StaffUserRow[];
  expenses: ExpenseRow[];
  actor: {
    profileId: string;
    branchId: string | null;
    roleName: string;
    dataAccessScope: string;
  };
};

export const EXPENSE_TYPE_OPTIONS: Array<{ value: ExpenseType; label: string }> = [
  { value: "operating", label: "Operating Expense" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "salary", label: "Staff Salary" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "delivery", label: "Delivery Expense" },
  { value: "other", label: "Other" },
];

export const EXPENSE_STATUS_OPTIONS: Array<{ value: ExpenseStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const EXPENSE_PAYMENT_METHOD_OPTIONS: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "gcash", label: "GCash" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "customer_credit", label: "Customer Credit" },
  { value: "split", label: "Split" },
];

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace("PHP", "PHP ");
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLabel(value?: string | null) {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatUserName(user?: StaffUserRow | null) {
  if (!user) return "Unassigned";
  const fullName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
  return fullName || user.username?.trim() || "Unassigned";
}

export function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

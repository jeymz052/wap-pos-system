// ─── Route → required permission mapping ─────────────────────────────────────
// Each route requires at minimum this permission (module:action).
// Public routes need no permission (e.g. login page is handled separately).

export type Permission = `${string}:${string}`;

export interface NavPermission {
  href: string;
  requiredPermission: Permission;
}

// Maps URL pathname prefixes → minimum permission to access.
// /dashboard is intentionally omitted — all authenticated users can access it.
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  "/pos":         "pos:view",
  "/inventory":   "inventory:view",
  "/catalog":     "inventory:view",
  "/purchasing":  "purchasing:view",
  "/receivables": "receivables:view",
  "/payables":    "payables:view",
  "/customers":   "customers:view",
  "/suppliers":   "suppliers:view",
  "/reports":     "reports:view",
  "/users-roles": "users:view",
  "/settings":    "settings:view",
  // /security is accessible to all authenticated users — no special permission required
};

// Public routes that don't require auth
export const PUBLIC_ROUTES = ["/", "/login", "/reset-password"];

// Fallback route when user is denied access
export const DENIED_REDIRECT = "/dashboard";
export const LOGIN_REDIRECT  = "/";

// ─── Role → label mapping ─────────────────────────────────────────────────────
export const ROLE_LABELS: Record<string, string> = {
  super_admin:     "Super Admin",
  admin:           "Admin",
  cashier:         "Cashier",
  inventory_staff: "Inventory Staff",
  accountant:      "Accountant",
  branch_staff:    "Branch Staff",
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name:  string | null;
  username:   string;
  email:      string;
  role_id:    string | null;
  branch_id:  string | null;
  is_active:  boolean | null;
}

export interface RoleInfo {
  id:          string;
  name:        string;
  description: string | null;
}

export interface RbacContextValue {
  user:          UserProfile | null;
  role:          RoleInfo    | null;
  permissions:   Set<string>;          // "module:action" strings
  loading:       boolean;
  /** Returns true if the user has ALL of the provided permissions */
  can:           (...perms: Permission[]) => boolean;
  /** Returns true if the user has at least one of the provided permissions */
  canAny:        (...perms: Permission[]) => boolean;
}

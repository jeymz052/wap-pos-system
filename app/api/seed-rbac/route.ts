import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getPublicSupabase() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAdminSupabase() {
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to seed RBAC.");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireSuperAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { error: "Missing session token.", status: 401 as const };
  }

  const publicSupabase = getPublicSupabase();
  const {
    data: { user },
    error: authError,
  } = await publicSupabase.auth.getUser(token);

  if (authError || !user) {
    return { error: "Unable to verify your session.", status: 401 as const };
  }

  const adminSupabase = getAdminSupabase();
  const { data: profile, error: profileError } = await adminSupabase
    .from("users")
    .select("role_id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: profileError.message, status: 500 as const };
  }

  const roleId = (profile as { role_id?: string | null } | null)?.role_id ?? null;
  if (!roleId) {
    return { error: "Your account does not have a role assigned.", status: 403 as const };
  }

  const { data: role, error: roleError } = await adminSupabase
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .maybeSingle();

  if (roleError) {
    return { error: roleError.message, status: 500 as const };
  }

  const roleName = ((role as { name?: string | null } | null)?.name ?? "").toLowerCase();
  if (roleName !== "super_admin") {
    return { error: "Only Super Admin can seed RBAC.", status: 403 as const };
  }

  return null;
}

// ── Role definitions ──────────────────────────────────────────────────────────

const ROLES = [
  { name: "super_admin",     description: "Full system access to all modules and settings",               is_system: true },
  { name: "admin",           description: "Manage daily operations, staff, customers, receivables, payables, and reports", is_system: true },
  { name: "cashier",         description: "Process POS sales, print receipts, view own transactions",     is_system: true },
  { name: "inventory_staff", description: "Manage inventory, stock movements, and barcode printing",      is_system: true },
  { name: "accountant",      description: "Manage financial reports, expenses, receivables, payables, and cash drawer reports", is_system: true },
  { name: "branch_staff",    description: "Access limited to assigned branch only",                       is_system: true },
];

// ── Permission definitions ────────────────────────────────────────────────────

const PERMISSIONS: Array<{ module: string; action: string; description: string }> = [
  // Dashboard
  { module: "dashboard",     action: "view",           description: "View dashboard and summary" },
  // POS
  { module: "pos",           action: "view",           description: "View POS and sales transactions" },
  { module: "pos",           action: "create",         description: "Process sales and checkout" },
  { module: "pos",           action: "edit",           description: "Edit held or pending sales" },
  { module: "pos",           action: "void",           description: "Void completed transactions" },
  { module: "pos",           action: "apply_discount", description: "Apply discounts to items or orders" },
  { module: "pos",           action: "hold_order",     description: "Place orders on hold" },
  { module: "pos",           action: "print_receipt",  description: "Print transaction receipts" },
  { module: "pos",           action: "manage",         description: "Full POS management and monitoring access" },
  // Inventory
  { module: "inventory",     action: "view",           description: "View product list and stock levels" },
  { module: "inventory",     action: "view_cost_price",description: "View product cost price and margin-sensitive inventory values" },
  { module: "inventory",     action: "create",         description: "Add new products to the catalogue" },
  { module: "inventory",     action: "edit",           description: "Edit existing product details" },
  { module: "inventory",     action: "delete",         description: "Delete or deactivate products" },
  { module: "inventory",     action: "receive_stock",  description: "Receive stock from purchase orders" },
  { module: "inventory",     action: "adjust_stock",   description: "Adjust stock quantities manually" },
  { module: "inventory",     action: "transfer_stock", description: "Transfer stock between branches" },
  { module: "inventory",     action: "print_barcode",  description: "Print barcodes and product labels" },
  { module: "inventory",     action: "manage",         description: "Full inventory management access" },
  // Purchasing
  { module: "purchasing",    action: "view",           description: "View purchase orders and history" },
  { module: "purchasing",    action: "create",         description: "Create new purchase orders" },
  { module: "purchasing",    action: "edit",           description: "Edit draft or pending purchase orders" },
  { module: "purchasing",    action: "approve",        description: "Approve purchase orders" },
  { module: "purchasing",    action: "delete",         description: "Delete draft purchase orders" },
  { module: "purchasing",    action: "manage",         description: "Full purchasing management access" },
  // Sales orders and quotations
  { module: "sales_orders",  action: "view",           description: "View quotations, sales orders, and pricing rules" },
  { module: "sales_orders",  action: "create",         description: "Create quotations and sales orders" },
  { module: "sales_orders",  action: "edit",           description: "Edit quotations, sales orders, and reservations" },
  { module: "sales_orders",  action: "approve",        description: "Approve quotations or convert them to sales" },
  { module: "sales_orders",  action: "email",          description: "Send quotations via email" },
  { module: "sales_orders",  action: "manage",         description: "Full quotation and sales order management access" },
  // Suppliers
  { module: "suppliers",     action: "view",           description: "View supplier list and details" },
  { module: "suppliers",     action: "create",         description: "Add new suppliers" },
  { module: "suppliers",     action: "edit",           description: "Edit supplier information" },
  { module: "suppliers",     action: "delete",         description: "Delete or deactivate suppliers" },
  { module: "suppliers",     action: "manage",         description: "Full supplier management access" },
  // Customers
  { module: "customers",     action: "view",           description: "View customer list and profiles" },
  { module: "customers",     action: "create",         description: "Add new customer records" },
  { module: "customers",     action: "edit",           description: "Edit customer information" },
  { module: "customers",     action: "delete",         description: "Delete or deactivate customers" },
  { module: "customers",     action: "manage",         description: "Full customer management access" },
  // Reports
  { module: "reports",       action: "view",           description: "Access and view all reports" },
  { module: "reports",       action: "create",         description: "Generate and schedule reports" },
  { module: "reports",       action: "export",         description: "Export reports to PDF or Excel" },
  { module: "reports",       action: "manage",         description: "Full reports management access" },
  // Notifications
  { module: "notifications", action: "view",           description: "View in-app notifications and alert history" },
  { module: "notifications", action: "manage",         description: "Manage alert generation and notification delivery" },
  // Settings
  { module: "settings",      action: "view",           description: "View system settings" },
  { module: "settings",      action: "edit",           description: "Edit system settings" },
  { module: "settings",      action: "manage",         description: "Full settings management access" },
  // Users / Staff
  { module: "users",         action: "view",           description: "View staff accounts and profiles" },
  { module: "users",         action: "create",         description: "Create new staff accounts" },
  { module: "users",         action: "edit",           description: "Edit staff account details and roles" },
  { module: "users",         action: "delete",         description: "Delete or deactivate staff accounts" },
  { module: "users",         action: "manage",         description: "Full user and role management access" },
  // Branches
  { module: "branches",      action: "view",           description: "View branch list and details" },
  { module: "branches",      action: "create",         description: "Create new branches" },
  { module: "branches",      action: "edit",           description: "Edit branch information" },
  { module: "branches",      action: "delete",         description: "Delete or deactivate branches" },
  { module: "branches",      action: "manage",         description: "Full branch management access" },
  // Subscriptions
  { module: "subscriptions", action: "view",           description: "View subscription plans and status" },
  { module: "subscriptions", action: "manage",         description: "Manage subscription and billing" },
  // Audit Logs
  { module: "audit_logs",    action: "view",           description: "View system audit logs" },
  // Returns
  { module: "returns",       action: "view",           description: "View return and refund requests" },
  { module: "returns",       action: "create",         description: "Create new return requests" },
  { module: "returns",       action: "approve",        description: "Approve or reject return requests" },
  { module: "returns",       action: "refund",         description: "Finalize customer refunds and issue store credit" },
  { module: "returns",       action: "manage",         description: "Full returns and refund management" },
  // Expenses
  { module: "expenses",      action: "view",           description: "View expense records" },
  { module: "expenses",      action: "create",         description: "Record new expenses" },
  { module: "expenses",      action: "edit",           description: "Edit expense records" },
  { module: "expenses",      action: "approve",        description: "Approve or reject expense claims" },
  { module: "expenses",      action: "manage",         description: "Full expense management access" },
  // Receivables
  { module: "receivables",   action: "view",           description: "View customer receivables and collections" },
  { module: "receivables",   action: "create",         description: "Create customer receivables and collection records" },
  { module: "receivables",   action: "edit",           description: "Edit receivables and received payments" },
  { module: "receivables",   action: "manage",         description: "Full receivables management access" },
  // Payables
  { module: "payables",      action: "view",           description: "View supplier payables and payment history" },
  { module: "payables",      action: "create",         description: "Create supplier payable and payment records" },
  { module: "payables",      action: "edit",           description: "Edit payables and supplier payments" },
  { module: "payables",      action: "manage",         description: "Full payables management access" },
];

// ── Role → Permission mapping ─────────────────────────────────────────────────

type ModuleActions = Record<string, string[]>;

const ROLE_PERMISSIONS: Record<string, ModuleActions> = {
  super_admin: {
    // All permissions — built dynamically
    __all__: [],
  },
  admin: {
    dashboard:     ["view"],
    pos:           ["view","create","edit","void","apply_discount","hold_order","print_receipt","manage"],
    inventory:     ["view","view_cost_price","create","edit","receive_stock","adjust_stock","transfer_stock","print_barcode","manage"],
    purchasing:    ["view","create","edit","approve","manage"],
    sales_orders:  ["view","create","edit","approve","email","manage"],
    suppliers:     ["view","create","edit","manage"],
    customers:     ["view","create","edit","manage"],
    reports:       ["view","create","export","manage"],
    notifications: ["view","manage"],
    settings:      ["view","edit"],
    users:         ["view","create","edit"],
    branches:      ["view"],
    returns:       ["view","create","approve","refund","manage"],
    expenses:      ["view","create","edit","approve","manage"],
    receivables:   ["view","create","edit","manage"],
    payables:      ["view","create","edit","manage"],
    audit_logs:    ["view"],
  },
  cashier: {
    pos:           ["view","create","apply_discount","hold_order","print_receipt"],
    sales_orders:  ["view","create","approve"],
    inventory:     ["view"],
    customers:     ["view","create"],
    reports:       ["view"],
    notifications: ["view"],
  },
  inventory_staff: {
    inventory:     ["view","view_cost_price","create","edit","receive_stock","adjust_stock","transfer_stock","print_barcode","manage"],
    purchasing:    ["view","create"],
    sales_orders:  ["view"],
    suppliers:     ["view"],
    reports:       ["view"],
    notifications: ["view"],
  },
  accountant: {
    reports:       ["view","create","export"],
    inventory:     ["view_cost_price"],
    expenses:      ["view","create","edit","approve"],
    receivables:   ["view","create","edit"],
    payables:      ["view","create","edit"],
    purchasing:    ["view"],
    sales_orders:  ["view"],
    customers:     ["view"],
    suppliers:     ["view"],
    pos:           ["view"],
    notifications: ["view"],
  },
  branch_staff: {
    pos:           ["view","create","print_receipt"],
    sales_orders:  ["view","create"],
    inventory:     ["view"],
    customers:     ["view","create"],
    reports:       ["view"],
    notifications: ["view"],
  },
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    if (!serviceKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required to seed RBAC." },
        { status: 500 }
      );
    }

    const authFailure = await requireSuperAdmin(request);
    if (authFailure) {
      return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    }

    const supabase = getAdminSupabase();

    // 1. Upsert roles
    const { error: rolesError } = await supabase
      .from("roles")
      .upsert(ROLES, { onConflict: "name" });

    if (rolesError) {
      return NextResponse.json({ error: `Roles: ${rolesError.message}` }, { status: 500 });
    }

    // 2. Upsert permissions
    const { error: permsError } = await supabase
      .from("permissions")
      .upsert(PERMISSIONS, { onConflict: "module,action" });

    if (permsError) {
      return NextResponse.json({ error: `Permissions: ${permsError.message}` }, { status: 500 });
    }

    // 3. Fetch inserted roles & permissions to get their UUIDs
    const { data: roleRows, error: fetchRolesErr } = await supabase
      .from("roles")
      .select("id, name");
    const { data: permRows, error: fetchPermsErr } = await supabase
      .from("permissions")
      .select("id, module, action");

    if (fetchRolesErr || fetchPermsErr) {
      return NextResponse.json(
        { error: fetchRolesErr?.message ?? fetchPermsErr?.message },
        { status: 500 }
      );
    }

    const roleMap = new Map((roleRows ?? []).map((r) => [r.name as string, r.id as string]));
    const permMap = new Map(
      (permRows ?? []).map((p) => [`${p.module as string}:${p.action as string}`, p.id as string])
    );

    // 4. Build role_permissions rows
    const rpRows: Array<{ role_id: string; permission_id: string; is_allowed: boolean }> = [];

    for (const [roleName, moduleActions] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap.get(roleName);
      if (!roleId) continue;

      if ("__all__" in moduleActions) {
        // super_admin gets every permission
        for (const permId of permMap.values()) {
          rpRows.push({ role_id: roleId, permission_id: permId, is_allowed: true });
        }
      } else {
        for (const [mod, actions] of Object.entries(moduleActions)) {
          for (const action of actions) {
            const permId = permMap.get(`${mod}:${action}`);
            if (permId) {
              rpRows.push({ role_id: roleId, permission_id: permId, is_allowed: true });
            }
          }
        }
      }
    }

    // 5. Upsert role_permissions in batches of 100
    const BATCH = 100;
    for (let i = 0; i < rpRows.length; i += BATCH) {
      const { error: rpError } = await supabase
        .from("role_permissions")
        .upsert(rpRows.slice(i, i + BATCH), { onConflict: "role_id,permission_id" });
      if (rpError) {
        return NextResponse.json({ error: `RolePerms batch ${i}: ${rpError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      roles: roleRows?.length ?? 0,
      permissions: permRows?.length ?? 0,
      mappings: rpRows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required to inspect RBAC seed status." },
      { status: 500 }
    );
  }

  const supabase = getAdminSupabase();

  // Quick status check
  const [{ count: rCount }, { count: pCount }, { count: rpCount }] = await Promise.all([
    supabase.from("roles").select("*", { count: "exact", head: true }),
    supabase.from("permissions").select("*", { count: "exact", head: true }),
    supabase.from("role_permissions").select("*", { count: "exact", head: true }),
  ]);
  return NextResponse.json({ roles: rCount, permissions: pCount, role_permissions: rpCount });
}

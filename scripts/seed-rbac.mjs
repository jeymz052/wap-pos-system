// Standalone RBAC seed script — run with: node scripts/seed-rbac.mjs
// Reads .env.local automatically, no dev server required.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(__dir, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY      = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API_KEY       = SERVICE_KEY || ANON_KEY;

if (!SUPABASE_URL || !API_KEY) {
  console.error("❌  Missing SUPABASE_URL or keys in .env.local"); process.exit(1);
}
if (!SERVICE_KEY) {
  console.warn("⚠️  No SUPABASE_SERVICE_ROLE_KEY found — using anon key (may fail due to RLS)");
}

const headers = {
  "Content-Type": "application/json",
  "apikey": API_KEY,
  "Authorization": `Bearer ${API_KEY}`,
  "Prefer": "resolution=merge-duplicates",
};

async function post(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, { method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${table}: ${res.status} ${txt}`);
  }
}

async function get(table, select) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Data ─────────────────────────────────────────────────────────────────────

const ROLES = [
  { name: "super_admin",     description: "Full system access to all modules and settings",               is_system: true },
  { name: "admin",           description: "Manage daily operations and view all reports",                 is_system: true },
  { name: "manager",         description: "Manage daily operations, staff performance, and customers",    is_system: true },
  { name: "cashier",         description: "Process POS sales, print receipts, view own transactions",     is_system: true },
  { name: "inventory_staff", description: "Manage inventory, stock movements, and barcode printing",      is_system: true },
  { name: "accountant",      description: "Manage financial reports, expenses, and cash drawer",          is_system: true },
  { name: "branch_staff",    description: "Access limited to assigned branch only",                       is_system: true },
];

const PERMISSIONS = [
  { module:"dashboard",     action:"view",           description:"View dashboard and summary" },
  { module:"pos",           action:"view",           description:"View POS and sales transactions" },
  { module:"pos",           action:"create",         description:"Process sales and checkout" },
  { module:"pos",           action:"edit",           description:"Edit held or pending sales" },
  { module:"pos",           action:"void",           description:"Void completed transactions" },
  { module:"pos",           action:"apply_discount", description:"Apply discounts to items or orders" },
  { module:"pos",           action:"hold_order",     description:"Place orders on hold" },
  { module:"pos",           action:"print_receipt",  description:"Print transaction receipts" },
  { module:"pos",           action:"manage",         description:"Full POS management and monitoring access" },
  { module:"inventory",     action:"view",           description:"View product list and stock levels" },
  { module:"inventory",     action:"create",         description:"Add new products to the catalogue" },
  { module:"inventory",     action:"edit",           description:"Edit existing product details" },
  { module:"inventory",     action:"delete",         description:"Delete or deactivate products" },
  { module:"inventory",     action:"receive_stock",  description:"Receive stock from purchase orders" },
  { module:"inventory",     action:"adjust_stock",   description:"Adjust stock quantities manually" },
  { module:"inventory",     action:"transfer_stock", description:"Transfer stock between branches" },
  { module:"inventory",     action:"print_barcode",  description:"Print barcodes and product labels" },
  { module:"inventory",     action:"manage",         description:"Full inventory management access" },
  { module:"purchasing",    action:"view",           description:"View purchase orders and history" },
  { module:"purchasing",    action:"create",         description:"Create new purchase orders" },
  { module:"purchasing",    action:"edit",           description:"Edit draft or pending purchase orders" },
  { module:"purchasing",    action:"approve",        description:"Approve purchase orders" },
  { module:"purchasing",    action:"delete",         description:"Delete draft purchase orders" },
  { module:"purchasing",    action:"manage",         description:"Full purchasing management access" },
  { module:"suppliers",     action:"view",           description:"View supplier list and details" },
  { module:"suppliers",     action:"create",         description:"Add new suppliers" },
  { module:"suppliers",     action:"edit",           description:"Edit supplier information" },
  { module:"suppliers",     action:"delete",         description:"Delete or deactivate suppliers" },
  { module:"suppliers",     action:"manage",         description:"Full supplier management access" },
  { module:"customers",     action:"view",           description:"View customer list and profiles" },
  { module:"customers",     action:"create",         description:"Add new customer records" },
  { module:"customers",     action:"edit",           description:"Edit customer information" },
  { module:"customers",     action:"delete",         description:"Delete or deactivate customers" },
  { module:"customers",     action:"manage",         description:"Full customer management access" },
  { module:"reports",       action:"view",           description:"Access and view all reports" },
  { module:"reports",       action:"create",         description:"Generate and schedule reports" },
  { module:"reports",       action:"export",         description:"Export reports to PDF or Excel" },
  { module:"reports",       action:"manage",         description:"Full reports management access" },
  { module:"settings",      action:"view",           description:"View system settings" },
  { module:"settings",      action:"edit",           description:"Edit system settings" },
  { module:"settings",      action:"manage",         description:"Full settings management access" },
  { module:"users",         action:"view",           description:"View staff accounts and profiles" },
  { module:"users",         action:"create",         description:"Create new staff accounts" },
  { module:"users",         action:"edit",           description:"Edit staff account details and roles" },
  { module:"users",         action:"delete",         description:"Delete or deactivate staff accounts" },
  { module:"users",         action:"manage",         description:"Full user and role management access" },
  { module:"branches",      action:"view",           description:"View branch list and details" },
  { module:"branches",      action:"create",         description:"Create new branches" },
  { module:"branches",      action:"edit",           description:"Edit branch information" },
  { module:"branches",      action:"delete",         description:"Delete or deactivate branches" },
  { module:"branches",      action:"manage",         description:"Full branch management access" },
  { module:"subscriptions", action:"view",           description:"View subscription plans and status" },
  { module:"subscriptions", action:"manage",         description:"Manage subscription and billing" },
  { module:"audit_logs",    action:"view",           description:"View system audit logs" },
  { module:"returns",       action:"view",           description:"View return and refund requests" },
  { module:"returns",       action:"create",         description:"Create new return requests" },
  { module:"returns",       action:"approve",        description:"Approve or reject return requests" },
  { module:"returns",       action:"manage",         description:"Full returns and refund management" },
  { module:"expenses",      action:"view",           description:"View expense records" },
  { module:"expenses",      action:"create",         description:"Record new expenses" },
  { module:"expenses",      action:"edit",           description:"Edit expense records" },
  { module:"expenses",      action:"approve",        description:"Approve or reject expense claims" },
  { module:"expenses",      action:"manage",         description:"Full expense management access" },
];

const ROLE_PERMS = {
  super_admin:     { __all__: true },
  admin:           { dashboard:["view"], pos:["view","create","edit","void","apply_discount","hold_order","print_receipt","manage"], inventory:["view","create","edit","receive_stock","adjust_stock","transfer_stock","print_barcode","manage"], purchasing:["view","create","edit","approve","manage"], suppliers:["view","create","edit","manage"], customers:["view","create","edit","manage"], reports:["view","create","export","manage"], settings:["view","edit"], users:["view","create","edit"], branches:["view"], returns:["view","create","approve","manage"], expenses:["view","create","edit","approve","manage"], audit_logs:["view"] },
  manager:         { dashboard:["view"], pos:["view","create","edit","apply_discount","hold_order","print_receipt","manage"], inventory:["view","create","edit","receive_stock","adjust_stock","transfer_stock","manage"], purchasing:["view","create","edit","approve","manage"], suppliers:["view","create","edit"], customers:["view","create","edit","manage"], reports:["view","create","export"], settings:["view"], users:["view","create","edit"], branches:["view"], returns:["view","create","approve","manage"], expenses:["view","create","edit"] },
  cashier:         { pos:["view","create","apply_discount","hold_order","print_receipt"], inventory:["view"], customers:["view","create"], reports:["view"] },
  inventory_staff: { inventory:["view","create","edit","receive_stock","adjust_stock","transfer_stock","print_barcode","manage"], purchasing:["view","create"], suppliers:["view"], reports:["view"] },
  accountant:      { reports:["view","create","export"], expenses:["view","create","edit","approve"], purchasing:["view"], customers:["view"], suppliers:["view"], pos:["view"] },
  branch_staff:    { pos:["view","create","print_receipt"], inventory:["view"], customers:["view","create"], reports:["view"] },
};

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🔄  Seeding roles...");
  await post("roles", ROLES, "name");
  console.log(`✅  ${ROLES.length} roles upserted`);

  console.log("🔄  Seeding permissions...");
  // Batch in 50s
  for (let i = 0; i < PERMISSIONS.length; i += 50)
    await post("permissions", PERMISSIONS.slice(i, i + 50), "module%2Caction");
  console.log(`✅  ${PERMISSIONS.length} permissions upserted`);

  console.log("🔄  Fetching role & permission IDs...");
  const roleRows = await get("roles", "id%2Cname");
  const permRows = await get("permissions", "id%2Cmodule%2Caction");

  const roleMap = new Map(roleRows.map(r => [r.name, r.id]));
  const permMap = new Map(permRows.map(p => [`${p.module}:${p.action}`, p.id]));

  console.log("🔄  Building role-permission mappings...");
  const rpRows = [];
  for (const [roleName, modActions] of Object.entries(ROLE_PERMS)) {
    const roleId = roleMap.get(roleName);
    if (!roleId) { console.warn(`  ⚠️  role not found: ${roleName}`); continue; }
    if (modActions.__all__) {
      for (const permId of permMap.values()) rpRows.push({ role_id: roleId, permission_id: permId, is_allowed: true });
    } else {
      for (const [mod, actions] of Object.entries(modActions)) {
        for (const action of actions) {
          const permId = permMap.get(`${mod}:${action}`);
          if (permId) rpRows.push({ role_id: roleId, permission_id: permId, is_allowed: true });
          else console.warn(`  ⚠️  permission not found: ${mod}:${action}`);
        }
      }
    }
  }

  console.log(`🔄  Upserting ${rpRows.length} role-permission rows...`);
  const BATCH = 50;
  for (let i = 0; i < rpRows.length; i += BATCH) {
    await post("role_permissions", rpRows.slice(i, i + BATCH), "role_id%2Cpermission_id");
    process.stdout.write(`  ↳  ${Math.min(i + BATCH, rpRows.length)}/${rpRows.length}\r`);
  }
  console.log(`\n✅  ${rpRows.length} role-permission rows upserted`);
  console.log("\n🎉  RBAC seed complete!\n");

  // Summary
  const summary = await get("roles", "name");
  console.log("Roles in database:");
  summary.forEach(r => console.log(`  • ${r.name}`));
}

seed().catch(e => { console.error("❌ Seed failed:", e.message); process.exit(1); });

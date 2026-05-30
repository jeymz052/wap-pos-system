import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBearerToken } from "@/lib/server-auth";
import {
  type AccessProfile,
  canAccessBranch,
  getAccessProfileByAuthUserId,
  hasAnyPermission,
  logAuditEvent,
} from "@/lib/user-access";
import { DATA_MODULE_LABELS, SETTINGS_DEFAULTS, SETTINGS_KEYS, mergeSettingsRows } from "@/lib/settings-config";

export const dynamic = "force-dynamic";

type BackupRunRow = {
  id: string;
  status: string;
  backup_scope: string;
  file_name: string;
  file_size_bytes?: number | null;
  summary?: Record<string, unknown> | null;
  completed_at?: string | null;
  created_at: string;
};

type ExchangeLogRow = {
  id: string;
  direction: string;
  module_name: string;
  file_name: string;
  file_format: string;
  row_count: number;
  status: string;
  completed_at?: string | null;
  created_at: string;
};

type BranchRow = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  manager_name?: string | null;
  timezone?: string | null;
  receipt_header?: string | null;
  pricing_mode?: string | null;
  is_active?: boolean | null;
};

type ExportModuleKey = keyof typeof DATA_MODULE_LABELS;

const EXPORT_CONFIG: Record<
  ExportModuleKey,
  {
    source: string;
    columns: string;
    branchColumn?: string;
    orderBy?: string;
  }
> = {
  products: {
    source: "products",
    columns:
      "id,name,part_number,sku,barcode,unit_type,cost_price,selling_price,wholesale_price,minimum_price,reorder_level,critical_stock_level,shelf_location,warranty_period_days,status,created_at,updated_at",
    orderBy: "name",
  },
  customers: {
    source: "customers",
    columns:
      "id,code,name,customer_type,phone,email,address,credit_limit,current_balance,loyalty_points,branch_id,is_active,created_at,updated_at",
    branchColumn: "branch_id",
    orderBy: "name",
  },
  suppliers: {
    source: "suppliers",
    columns:
      "id,code,name,supplier_type,contact_person,phone,email,address,tax_number,payment_terms,credit_limit,current_balance,is_active,created_at,updated_at",
    orderBy: "name",
  },
  branches: {
    source: "branches",
    columns:
      "id,name,code,address,phone,email,manager_name,timezone,receipt_header,pricing_mode,is_active,created_at,updated_at",
    orderBy: "name",
  },
  sales: {
    source: "v_daily_sales_summary",
    columns:
      "sale_date,branch_id,branch_name,total_transactions,gross_sales,total_discounts,total_tax,net_sales",
    branchColumn: "branch_id",
    orderBy: "sale_date",
  },
  inventory: {
    source: "v_inventory_valuation",
    columns:
      "branch_id,branch_name,product_id,product_name,sku,quantity,cost_price,selling_price,total_cost_value,total_retail_value",
    branchColumn: "branch_id",
    orderBy: "branch_name",
  },
  users: {
    source: "users",
    columns:
      "id,first_name,last_name,username,email,phone,employee_id,branch_id,is_active,allow_login,data_access_scope,last_login_at,created_at,updated_at",
    branchColumn: "branch_id",
    orderBy: "first_name",
  },
};

const IMPORT_CONFIG = {
  products: {
    table: "products",
    conflictKey: "sku",
    allowedColumns: [
      "name",
      "part_number",
      "sku",
      "barcode",
      "unit_type",
      "cost_price",
      "selling_price",
      "wholesale_price",
      "minimum_price",
      "reorder_level",
      "critical_stock_level",
      "shelf_location",
      "warranty_period_days",
      "status",
    ],
    requiredColumns: ["name", "sku", "selling_price"],
  },
  customers: {
    table: "customers",
    conflictKey: "code",
    allowedColumns: [
      "code",
      "name",
      "customer_type",
      "phone",
      "email",
      "address",
      "credit_limit",
      "current_balance",
      "loyalty_points",
      "branch_id",
      "is_active",
    ],
    requiredColumns: ["code", "name"],
  },
  suppliers: {
    table: "suppliers",
    conflictKey: "code",
    allowedColumns: [
      "code",
      "name",
      "supplier_type",
      "contact_person",
      "phone",
      "email",
      "address",
      "tax_number",
      "payment_terms",
      "credit_limit",
      "current_balance",
      "is_active",
    ],
    requiredColumns: ["code", "name"],
  },
  branches: {
    table: "branches",
    conflictKey: "code",
    allowedColumns: [
      "name",
      "code",
      "address",
      "phone",
      "email",
      "manager_name",
      "timezone",
      "receipt_header",
      "pricing_mode",
      "is_active",
    ],
    requiredColumns: ["name", "code"],
  },
} as const;

function isSchemaMismatchError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  const code = String(error?.code ?? "");
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  return (
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function isElevated(actor: AccessProfile) {
  return (
    actor.roleName === "super_admin" ||
    actor.roleName === "admin" ||
    actor.dataAccessScope === "all_data"
  );
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeScalar(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && trimmed !== "") return numeric;
    return trimmed;
  }
  return value;
}

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null);
}

async function resolveActor(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return null;

  return getAccessProfileByAuthUserId(user.id);
}

async function insertExchangeLog(payload: Record<string, unknown>) {
  const result = await supabaseAdmin.from("data_exchange_logs").insert(payload);
  if (result.error && !isSchemaMismatchError(result.error)) {
    throw result.error;
  }
}

async function insertBackupLog(payload: Record<string, unknown>) {
  const result = await supabaseAdmin.from("system_backup_runs").insert(payload);
  if (result.error && !isSchemaMismatchError(result.error)) {
    throw result.error;
  }
}

async function loadWorkspace(actor: AccessProfile) {
  const settingsResult = await supabaseAdmin
    .from("settings")
    .select("branch_id,key,value,updated_at")
    .is("branch_id", null)
    .order("key", { ascending: true });

  if (settingsResult.error) throw settingsResult.error;

  let branchQuery = supabaseAdmin
    .from("branches")
    .select("id,name,code,address,phone,email,manager_name,timezone,receipt_header,pricing_mode,is_active")
    .order("name", { ascending: true });

  if (!isElevated(actor) && actor.branchId) {
    branchQuery = branchQuery.eq("id", actor.branchId);
  }

  const [branchResult, backupRunsResult, exchangeLogsResult] = await Promise.all([
    branchQuery,
    supabaseAdmin
      .from("system_backup_runs")
      .select("id,status,backup_scope,file_name,file_size_bytes,summary,completed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("data_exchange_logs")
      .select("id,direction,module_name,file_name,file_format,row_count,status,completed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  if (branchResult.error) throw branchResult.error;
  if (backupRunsResult.error && !isSchemaMismatchError(backupRunsResult.error)) throw backupRunsResult.error;
  if (exchangeLogsResult.error && !isSchemaMismatchError(exchangeLogsResult.error)) throw exchangeLogsResult.error;

  return {
    settings: mergeSettingsRows(settingsResult.data as Array<{ key?: string | null; value?: string | null }>),
    branches: (branchResult.data ?? []) as BranchRow[],
    backupRuns: (backupRunsResult.error ? [] : backupRunsResult.data ?? []) as BackupRunRow[],
    exchangeLogs: (exchangeLogsResult.error ? [] : exchangeLogsResult.data ?? []) as ExchangeLogRow[],
    actor: {
      branchId: actor.branchId,
      roleName: actor.roleName,
      canEdit: hasAnyPermission(actor, "settings:edit", "settings:manage"),
      canManageBranches: isElevated(actor) || hasAnyPermission(actor, "branches:edit", "branches:manage"),
    },
  };
}

async function runBackup(actor: AccessProfile) {
  const [
    branchesCount,
    productsCount,
    customersCount,
    suppliersCount,
    usersCount,
    salesCount,
    settingsRows,
  ] = await Promise.all([
    supabaseAdmin.from("branches").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("customers").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("suppliers").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("sales").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("settings").select("branch_id,key,value,updated_at").order("key", { ascending: true }),
  ]);

  const fatalError =
    branchesCount.error ||
    productsCount.error ||
    customersCount.error ||
    suppliersCount.error ||
    usersCount.error ||
    salesCount.error ||
    settingsRows.error;

  if (fatalError) {
    throw fatalError;
  }

  const summary = {
    branches: branchesCount.count ?? 0,
    products: productsCount.count ?? 0,
    customers: customersCount.count ?? 0,
    suppliers: suppliersCount.count ?? 0,
    users: usersCount.count ?? 0,
    sales: salesCount.count ?? 0,
    settings: (settingsRows.data ?? []).length,
  };

  const timestamp = new Date().toISOString();
  const fileName = `settings-backup-${timestamp.slice(0, 10)}-${timestamp.slice(11, 19).replace(/:/g, "")}.json`;
  const payload = {
    generatedAt: timestamp,
    generatedBy: actor.profileId,
    backupScope: isElevated(actor) ? "full_system" : "branch_only",
    summary,
    settings: settingsRows.data ?? [],
  };

  const serialized = JSON.stringify(payload, null, 2);

  await insertBackupLog({
    branch_id: isElevated(actor) ? null : actor.branchId,
    status: "completed",
    backup_scope: isElevated(actor) ? "full_system" : "branch_only",
    file_name: fileName,
    file_size_bytes: Buffer.byteLength(serialized, "utf8"),
    summary,
    triggered_by: actor.profileId,
    completed_at: timestamp,
    created_at: timestamp,
  });

  await logAuditEvent({
    userId: actor.profileId,
    branchId: actor.branchId,
    module: "settings",
    action: "run_backup",
    referenceType: "system_backup_run",
    newValues: { file_name: fileName, summary },
  });

  return { fileName, content: serialized, summary };
}

async function exportModuleData(actor: AccessProfile, moduleName: ExportModuleKey) {
  const config = EXPORT_CONFIG[moduleName];
  let query = supabaseAdmin.from(config.source).select(config.columns);

  if (!isElevated(actor) && actor.branchId && config.branchColumn) {
    query = query.eq(config.branchColumn, actor.branchId);
  }

  if (config.orderBy) {
    query = query.order(config.orderBy, { ascending: true });
  }

  const result = await query;
  if (result.error) throw result.error;

  const timestamp = new Date().toISOString();
  const fileName = `${moduleName}-export-${timestamp.slice(0, 10)}.csv`;
  const rows = isRecordArray(result.data) ? result.data : [];

  await insertExchangeLog({
    branch_id: !isElevated(actor) ? actor.branchId : null,
    direction: "export",
    module_name: moduleName,
    file_name: fileName,
    file_format: "csv",
    row_count: rows.length,
    status: "completed",
    summary: {
      label: DATA_MODULE_LABELS[moduleName],
      branchRestricted: !isElevated(actor) && Boolean(config.branchColumn),
    },
    initiated_by: actor.profileId,
    completed_at: timestamp,
    created_at: timestamp,
  });

  await logAuditEvent({
    userId: actor.profileId,
    branchId: actor.branchId,
    module: "settings",
    action: "export_data",
    referenceType: "data_exchange_log",
    newValues: { module_name: moduleName, row_count: rows.length, file_name: fileName },
  });

  return { fileName, rows };
}

function sanitizeImportRows(
  actor: AccessProfile,
  moduleName: keyof typeof IMPORT_CONFIG,
  rows: Array<Record<string, unknown>>,
) {
  const config = IMPORT_CONFIG[moduleName];

  return rows
    .map((row) => {
      const entry = Object.fromEntries(
        config.allowedColumns
          .map((column) => [column, normalizeScalar(row[column])])
          .filter(([, value]) => value !== null),
      ) as Record<string, unknown>;

      if (moduleName === "customers") {
        entry.branch_id = isElevated(actor) ? entry.branch_id ?? actor.branchId : actor.branchId;
      }

      if (moduleName === "branches") {
        if (!isElevated(actor)) return null;
        if (entry.pricing_mode !== "branch_override") {
          entry.pricing_mode = "global";
        }
      }

      if (!config.requiredColumns.every((column) => cleanText(String(entry[column] ?? "")) !== null)) {
        return null;
      }

      return entry;
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasAnyPermission(actor, "settings:view", "settings:edit", "settings:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await loadWorkspace(actor);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[settings:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      branchId?: string | null;
      entries?: Record<string, unknown>;
      module?: ExportModuleKey | keyof typeof IMPORT_CONFIG;
      rows?: Array<Record<string, unknown>>;
    };

    switch (body.action) {
      case "save_settings": {
        if (!hasAnyPermission(actor, "settings:edit", "settings:manage")) {
          return NextResponse.json({ error: "You do not have permission to edit settings." }, { status: 403 });
        }

        const branchId = body.branchId?.trim() || null;
        if (branchId && !canAccessBranch(actor, branchId)) {
          return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
        }

        const sourceEntries = body.entries ?? {};
        const rows = Object.entries(sourceEntries)
          .filter(([key]) => SETTINGS_KEYS.includes(key))
          .map(([key, value]) => ({
            branch_id: branchId,
            key,
            value:
              typeof value === "string"
                ? value
                : Array.isArray(value) || typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? ""),
            updated_by: actor.profileId,
            updated_at: new Date().toISOString(),
          }));

        if (!rows.length) {
          return NextResponse.json({ error: "No valid settings were provided." }, { status: 400 });
        }

        const result = await supabaseAdmin.from("settings").upsert(rows, { onConflict: "branch_id,key" });
        if (result.error) throw result.error;

        await logAuditEvent({
          userId: actor.profileId,
          branchId,
          module: "settings",
          action: "save_settings",
          referenceType: "setting",
          newValues: { keys: rows.map((row) => row.key) },
        });

        return NextResponse.json({ success: true, message: "Settings saved successfully." });
      }

      case "reset_defaults": {
        if (!hasAnyPermission(actor, "settings:edit", "settings:manage")) {
          return NextResponse.json({ error: "You do not have permission to reset settings." }, { status: 403 });
        }

        const rows = Object.entries(SETTINGS_DEFAULTS).map(([key, value]) => ({
          branch_id: null,
          key,
          value,
          updated_by: actor.profileId,
          updated_at: new Date().toISOString(),
        }));

        const result = await supabaseAdmin.from("settings").upsert(rows, { onConflict: "branch_id,key" });
        if (result.error) throw result.error;

        await logAuditEvent({
          userId: actor.profileId,
          branchId: actor.branchId,
          module: "settings",
          action: "reset_defaults",
          referenceType: "setting",
          newValues: { keys: SETTINGS_KEYS },
        });

        return NextResponse.json({ success: true, message: "Defaults restored." });
      }

      case "run_backup": {
        if (!hasAnyPermission(actor, "settings:edit", "settings:manage")) {
          return NextResponse.json({ error: "You do not have permission to run backups." }, { status: 403 });
        }

        const backup = await runBackup(actor);
        return NextResponse.json({ success: true, backup });
      }

      case "export_data": {
        if (!hasAnyPermission(actor, "settings:view", "settings:edit", "settings:manage", "reports:export")) {
          return NextResponse.json({ error: "You do not have permission to export data." }, { status: 403 });
        }

        const moduleName = body.module;
        if (!moduleName || !(moduleName in EXPORT_CONFIG)) {
          return NextResponse.json({ error: "Unsupported export module." }, { status: 400 });
        }

        const payload = await exportModuleData(actor, moduleName as ExportModuleKey);
        return NextResponse.json({ success: true, ...payload });
      }

      case "import_data": {
        if (!hasAnyPermission(actor, "settings:edit", "settings:manage")) {
          return NextResponse.json({ error: "You do not have permission to import data." }, { status: 403 });
        }

        const moduleName = body.module;
        if (!moduleName || !(moduleName in IMPORT_CONFIG)) {
          return NextResponse.json({ error: "Unsupported import module." }, { status: 400 });
        }

        const rawRows = Array.isArray(body.rows) ? body.rows : [];
        const rows = sanitizeImportRows(actor, moduleName as keyof typeof IMPORT_CONFIG, rawRows);

        if (!rows.length) {
          return NextResponse.json({ error: "No valid rows were found in the uploaded file." }, { status: 400 });
        }

        const config = IMPORT_CONFIG[moduleName as keyof typeof IMPORT_CONFIG];
        const result = await supabaseAdmin
          .from(config.table)
          .upsert(rows, { onConflict: config.conflictKey })
          .select(config.conflictKey);

        if (result.error) throw result.error;

        const timestamp = new Date().toISOString();
        const fileName = `${moduleName}-import-${timestamp.slice(0, 10)}.csv`;

        await insertExchangeLog({
          branch_id: !isElevated(actor) ? actor.branchId : null,
          direction: "import",
          module_name: moduleName,
          file_name: fileName,
          file_format: "csv",
          row_count: rows.length,
          status: "completed",
          summary: {
            label: DATA_MODULE_LABELS[moduleName as ExportModuleKey] ?? moduleName,
            accepted_rows: rows.length,
          },
          initiated_by: actor.profileId,
          completed_at: timestamp,
          created_at: timestamp,
        });

        await logAuditEvent({
          userId: actor.profileId,
          branchId: actor.branchId,
          module: "settings",
          action: "import_data",
          referenceType: "data_exchange_log",
          newValues: { module_name: moduleName, row_count: rows.length },
        });

        return NextResponse.json({
          success: true,
          message: `${rows.length} row(s) imported successfully.`,
          imported: rows.length,
          returned: (result.data ?? []).length,
        });
      }

      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[settings:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

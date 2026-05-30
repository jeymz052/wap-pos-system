import { NextRequest, NextResponse } from "next/server";
import { buildAuditCsv, type AuditActivityRow, type AuditSummary } from "@/lib/audit";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSubscriptionFeature } from "@/lib/subscriptions";

type ActorContext = {
  profileId: string;
  branchId: string | null;
  roleName: string | null;
  dataAccessScope: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function cleanFilter(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function isElevated(actor: ActorContext) {
  return actor.roleName === "super_admin" || actor.roleName === "admin" || actor.dataAccessScope === "all_data";
}

function canAccessRow(actor: ActorContext, row: AuditActivityRow) {
  if (isElevated(actor)) return true;
  if (row.user_id && row.user_id === actor.profileId) return true;
  if (row.branch_id && actor.branchId && row.branch_id === actor.branchId) return true;
  return false;
}

function matchesSearch(row: AuditActivityRow, search: string) {
  if (!search) return true;
  const haystack = [
    row.actor_name,
    row.branch_name,
    row.module,
    row.action,
    row.reference_type,
    row.reference_id,
    row.summary,
    row.record_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function buildSummary(rows: AuditActivityRow[]): AuditSummary {
  return rows.reduce<AuditSummary>(
    (summary, row) => {
      summary.total += 1;

      switch (row.activity_kind) {
        case "login_history":
          summary.logins += 1;
          break;
        case "product_change":
          summary.productChanges += 1;
          break;
        case "price_change":
          summary.priceChanges += 1;
          break;
        case "stock_adjustment":
          summary.stockAdjustments += 1;
          break;
        case "deleted_record":
          summary.deletedRecords += 1;
          break;
        case "void_log":
          summary.voids += 1;
          break;
        case "refund_log":
          summary.refunds += 1;
          break;
        default:
          summary.userActivities += 1;
          break;
      }

      return summary;
    },
    {
      total: 0,
      logins: 0,
      productChanges: 0,
      priceChanges: 0,
      stockAdjustments: 0,
      deletedRecords: 0,
      voids: 0,
      refunds: 0,
      userActivities: 0,
    },
  );
}

async function resolveActor(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;

  if (!(await requireSubscriptionFeature("audit_logs"))) {
    throw new Error("Audit logs are not enabled on the current subscription plan.");
  }

  const result = await supabaseAdmin
    .from("users")
    .select("id, branch_id, data_access_scope, roles(name)")
    .eq("id", user.profileId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw result.error ?? new Error("Unable to resolve the authenticated user.");
  }

  const row = result.data as {
    id: string;
    branch_id?: string | null;
    data_access_scope?: string | null;
    roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
  };

  const roleRelation = Array.isArray(row.roles) ? row.roles[0] : row.roles;

  return {
    authUser: user,
    actor: {
      profileId: row.id,
      branchId: row.branch_id ?? null,
      roleName: roleRelation?.name ?? null,
      dataAccessScope: row.data_access_scope ?? "branch_only",
    } satisfies ActorContext,
  };
}

async function loadFilterLookups(actor: ActorContext) {
  let branchesQuery = supabaseAdmin.from("branches").select("id, name").eq("is_active", true).order("name", { ascending: true });
  let usersQuery = supabaseAdmin.from("users").select("id, first_name, last_name, username, email, branch_id").eq("is_active", true).order("first_name", { ascending: true });

  if (!isElevated(actor) && actor.branchId) {
    branchesQuery = branchesQuery.eq("id", actor.branchId);
    usersQuery = usersQuery.eq("branch_id", actor.branchId);
  }

  const [branchesResult, usersResult] = await Promise.all([branchesQuery, usersQuery]);
  if (branchesResult.error) throw branchesResult.error;
  if (usersResult.error) throw usersResult.error;

  const users = ((usersResult.data ?? []) as Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    email?: string | null;
  }>).map((row) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.username || row.email || "Unknown User",
  }));

  return {
    branches: (branchesResult.data ?? []) as Array<{ id: string; name: string }>,
    users,
  };
}

async function loadAuditRows(request: NextRequest, actor: ActorContext) {
  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 500);
  const limit = parsePositiveInt(searchParams.get("limit"), 50, 200);
  const exportMode = cleanFilter(searchParams.get("export")) === "csv";
  const maxRows = exportMode ? 5000 : 1500;

  const source = cleanFilter(searchParams.get("source"));
  const kind = cleanFilter(searchParams.get("kind"));
  const moduleName = cleanFilter(searchParams.get("module"));
  const action = cleanFilter(searchParams.get("action"));
  const userId = cleanFilter(searchParams.get("userId"));
  const branchId = cleanFilter(searchParams.get("branchId"));
  const dateFrom = cleanFilter(searchParams.get("dateFrom"));
  const dateTo = cleanFilter(searchParams.get("dateTo"));
  const search = cleanFilter(searchParams.get("search"));

  let query = supabaseAdmin
    .from("v_audit_activity_history")
    .select("*")
    .order("event_at", { ascending: false })
    .limit(maxRows);

  if (source) query = query.eq("event_source", source);
  if (kind) query = query.eq("activity_kind", kind);
  if (moduleName) query = query.eq("module", moduleName);
  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);
  if (branchId) query = query.eq("branch_id", branchId);
  if (dateFrom) query = query.gte("event_at", `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte("event_at", `${dateTo}T23:59:59`);

  const result = await query;
  if (result.error) throw result.error;

  const rows = ((result.data ?? []) as AuditActivityRow[])
    .filter((row) => canAccessRow(actor, row))
    .filter((row) => matchesSearch(row, search));

  const summary = buildSummary(rows);
  const total = rows.length;

  if (exportMode) {
    return {
      exportMode,
      rows,
      summary,
      total,
      page: 1,
      limit: rows.length || limit,
    };
  }

  const start = (page - 1) * limit;
  return {
    exportMode,
    rows: rows.slice(start, start + limit),
    summary,
    total,
    page,
    limit,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveActor(request);
    if (!resolved || !hasAnyPermission(resolved.authUser, "audit_logs:view")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [auditData, lookups] = await Promise.all([
      loadAuditRows(request, resolved.actor),
      loadFilterLookups(resolved.actor),
    ]);

    if (auditData.exportMode) {
      const csv = buildAuditCsv(auditData.rows);
      const filename = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      actor: resolved.actor,
      rows: auditData.rows,
      summary: auditData.summary,
      total: auditData.total,
      page: auditData.page,
      limit: auditData.limit,
      branches: lookups.branches,
      users: lookups.users,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[audit-logs:get]", message);
    const status = message.includes("not enabled on the current subscription plan") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

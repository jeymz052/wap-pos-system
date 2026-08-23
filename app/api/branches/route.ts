import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSubscriptionAccessSummary } from "@/lib/subscriptions";

type ActorContext = {
  profileId: string;
  branchId: string | null;
  roleName: string | null;
  dataAccessScope: string;
  permissions: Set<string>;
};

type BranchMutationPayload = {
  id?: string;
  name?: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  timezone?: string | null;
  receiptHeader?: string | null;
  pricingMode?: "global" | "branch_override";
  notes?: string | null;
  isActive?: boolean;
};

function hasPermission(actor: ActorContext, ...required: string[]) {
  return required.some((permission) => actor.permissions.has(permission));
}

function isElevated(actor: ActorContext) {
  return actor.roleName === "super_admin" || actor.roleName === "admin" || actor.dataAccessScope === "all_data";
}

function canAccessBranch(actor: ActorContext, branchId?: string | null) {
  if (!branchId) return true;
  return isElevated(actor) || actor.branchId === branchId;
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeBranchCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

async function resolveActor(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;

  const profileResult = await supabaseAdmin
    .from("users")
    .select("branch_id, data_access_scope, roles(name)")
    .eq("id", user.profileId)
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    throw profileResult.error ?? new Error("Unable to resolve the authenticated user.");
  }

  const row = profileResult.data as {
    branch_id?: string | null;
    data_access_scope?: string | null;
    roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
  };

  const roleRelation = Array.isArray(row.roles) ? row.roles[0] : row.roles;

  return {
    profileId: user.profileId,
    branchId: row.branch_id ?? null,
    roleName: roleRelation?.name ?? null,
    dataAccessScope: row.data_access_scope ?? "branch_only",
    permissions: user.permissions,
  } satisfies ActorContext;
}

async function loadWorkspace(actor: ActorContext) {
  let branchesQuery = supabaseAdmin
    .from("branches")
    .select("id, name, code, address, phone, email, is_main, is_active, manager_name, timezone, receipt_header, pricing_mode, notes, created_at, updated_at")
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  let branchDashboardQuery = supabaseAdmin
    .from("v_branch_performance_dashboard")
    .select("*")
    .order("total_sales_30d", { ascending: false });

  let inventorySummaryQuery = supabaseAdmin
    .from("v_branch_inventory_summary")
    .select("*")
    .order("branch_name", { ascending: true });

  let salesSummaryQuery = supabaseAdmin
    .from("v_branch_sales_summary")
    .select("*")
    .order("branch_name", { ascending: true });

  let staffAssignmentsQuery = supabaseAdmin
    .from("v_branch_staff_assignments")
    .select("*")
    .order("branch_name", { ascending: true })
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  let usersQuery = supabaseAdmin
    .from("users")
    .select("id, first_name, last_name, username, email, branch_id, is_active, roles(name)")
    .eq("is_active", true)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  let priceOverridesQuery = supabaseAdmin
    .from("branch_product_prices")
    .select(`
      id,
      branch_id,
      product_id,
      price,
      min_price,
      max_price,
      is_active,
      notes,
      updated_at,
      branches(name),
      products(name, sku, selling_price)
    `)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (!isElevated(actor) && actor.branchId) {
    branchesQuery = branchesQuery.eq("id", actor.branchId);
    branchDashboardQuery = branchDashboardQuery.eq("branch_id", actor.branchId);
    inventorySummaryQuery = inventorySummaryQuery.eq("branch_id", actor.branchId);
    salesSummaryQuery = salesSummaryQuery.eq("branch_id", actor.branchId);
    staffAssignmentsQuery = staffAssignmentsQuery.eq("branch_id", actor.branchId);
    usersQuery = usersQuery.eq("branch_id", actor.branchId);
    priceOverridesQuery = priceOverridesQuery.eq("branch_id", actor.branchId);
  }

  const [
    branchesResult,
    branchDashboardResult,
    inventorySummaryResult,
    salesSummaryResult,
    transferSummaryResult,
    staffAssignmentsResult,
    priceOverridesResult,
    productsResult,
    usersResult,
    ownerDashboardResult,
  ] = await Promise.all([
    branchesQuery,
    branchDashboardQuery,
    inventorySummaryQuery,
    salesSummaryQuery,
    supabaseAdmin
      .from("v_branch_transfer_summary")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    staffAssignmentsQuery,
    priceOverridesQuery,
    supabaseAdmin
      .from("products")
      .select("id, name, sku, selling_price")
      .order("name", { ascending: true })
      .limit(250),
    usersQuery,
    isElevated(actor)
      ? supabaseAdmin.from("v_owner_dashboard").select("*").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const fatalError =
    branchesResult.error ||
    branchDashboardResult.error ||
    inventorySummaryResult.error ||
    salesSummaryResult.error ||
    transferSummaryResult.error ||
    staffAssignmentsResult.error ||
    priceOverridesResult.error ||
    productsResult.error ||
    usersResult.error ||
    ownerDashboardResult.error;

  if (fatalError) {
    throw fatalError;
  }

  const transfers = ((transferSummaryResult.data ?? []) as Array<{
    from_branch_id?: string | null;
    to_branch_id?: string | null;
  }>).filter((transfer) =>
    canAccessBranch(actor, transfer.from_branch_id ?? null) || canAccessBranch(actor, transfer.to_branch_id ?? null),
  );

  return {
    actor: {
      roleName: actor.roleName,
      branchId: actor.branchId,
      canManageBranches: isElevated(actor) || hasPermission(actor, "branches:manage", "branches:create", "branches:edit"),
      canAssignStaff: isElevated(actor) || hasPermission(actor, "branches:manage", "users:edit", "users:manage"),
      canManagePricing: isElevated(actor) || hasPermission(actor, "branches:manage", "branches:edit"),
      canTransferStock: hasPermission(actor, "inventory:transfer_stock", "inventory:manage"),
    },
    branches: branchesResult.data ?? [],
    branchDashboard: branchDashboardResult.data ?? [],
    inventorySummary: inventorySummaryResult.data ?? [],
    salesSummary: salesSummaryResult.data ?? [],
    transferSummary: transfers,
    staffAssignments: staffAssignmentsResult.data ?? [],
    priceOverrides: priceOverridesResult.data ?? [],
    products: productsResult.data ?? [],
    users: (usersResult.data ?? []).map((row) => {
      const userRow = row as {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        email?: string | null;
        branch_id?: string | null;
        is_active?: boolean | null;
        roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
      };
      const roleRelation = Array.isArray(userRow.roles) ? userRow.roles[0] : userRow.roles;
      return {
        id: userRow.id,
        first_name: userRow.first_name ?? null,
        last_name: userRow.last_name ?? null,
        username: userRow.username ?? null,
        email: userRow.email ?? null,
        branch_id: userRow.branch_id ?? null,
        is_active: userRow.is_active ?? true,
        role_name: roleRelation?.name ?? null,
      };
    }),
    ownerDashboard: ownerDashboardResult.data ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasPermission(actor, "branches:view", "branches:manage", "reports:view")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = await loadWorkspace(actor);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[branches:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasPermission(actor, "branches:view", "branches:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      branch?: BranchMutationPayload;
      branchId?: string;
      userId?: string;
      productId?: string;
      price?: number;
      minPrice?: number | null;
      maxPrice?: number | null;
      notes?: string | null;
      isActive?: boolean;
    };

    switch (body.action) {
      case "create_branch": {
        if (!(isElevated(actor) || hasPermission(actor, "branches:create", "branches:manage"))) {
          return NextResponse.json({ error: "You do not have permission to create branches." }, { status: 403 });
        }

        const subscription = await getSubscriptionAccessSummary();
        if (
          subscription.snapshot.branch_limit !== null &&
          subscription.usage.active_branch_count >= subscription.snapshot.branch_limit
        ) {
          return NextResponse.json({
            error: `Your current subscription only allows ${subscription.snapshot.branch_limit} active branch(es). Upgrade the plan to add another branch.`,
          }, { status: 409 });
        }

        const branch = body.branch ?? {};
        const name = cleanText(branch.name);
        const code = normalizeBranchCode(branch.code);

        if (!name || !code) {
          return NextResponse.json({ error: "Branch name and code are required." }, { status: 400 });
        }

        const insertResult = await supabaseAdmin.from("branches").insert({
          name,
          code,
          address: cleanText(branch.address),
          phone: cleanText(branch.phone),
          email: cleanText(branch.email),
          manager_name: cleanText(branch.managerName),
          timezone: cleanText(branch.timezone) ?? "Asia/Manila",
          receipt_header: cleanText(branch.receiptHeader),
          pricing_mode: branch.pricingMode === "branch_override" ? "branch_override" : "global",
          notes: cleanText(branch.notes),
          is_active: branch.isActive ?? true,
        });

        if (insertResult.error) throw insertResult.error;
        return NextResponse.json({ message: "Branch created successfully." });
      }

      case "update_branch": {
        if (!(isElevated(actor) || hasPermission(actor, "branches:edit", "branches:manage"))) {
          return NextResponse.json({ error: "You do not have permission to update branches." }, { status: 403 });
        }

        const branch = body.branch ?? {};
        const branchId = branch.id?.trim();
        if (!branchId || !canAccessBranch(actor, branchId)) {
          return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
        }

        const updatePayload = {
          name: cleanText(branch.name),
          code: normalizeBranchCode(branch.code) || undefined,
          address: cleanText(branch.address),
          phone: cleanText(branch.phone),
          email: cleanText(branch.email),
          manager_name: cleanText(branch.managerName),
          timezone: cleanText(branch.timezone) ?? "Asia/Manila",
          receipt_header: cleanText(branch.receiptHeader),
          pricing_mode: branch.pricingMode === "branch_override" ? "branch_override" : "global",
          notes: cleanText(branch.notes),
          is_active: typeof branch.isActive === "boolean" ? branch.isActive : undefined,
          updated_at: new Date().toISOString(),
        };

        const updateResult = await supabaseAdmin.from("branches").update(updatePayload).eq("id", branchId);
        if (updateResult.error) throw updateResult.error;
        return NextResponse.json({ message: "Branch updated successfully." });
      }

      case "assign_staff": {
        if (!(isElevated(actor) || hasPermission(actor, "branches:manage", "users:edit", "users:manage"))) {
          return NextResponse.json({ error: "You do not have permission to assign staff." }, { status: 403 });
        }

        const branchId = body.branchId?.trim() || null;
        const userId = body.userId?.trim();

        if (!userId) {
          return NextResponse.json({ error: "User is required." }, { status: 400 });
        }

        if (branchId && !canAccessBranch(actor, branchId)) {
          return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
        }

        const updateResult = await supabaseAdmin
          .from("users")
          .update({ branch_id: branchId, updated_at: new Date().toISOString() })
          .eq("id", userId);

        if (updateResult.error) throw updateResult.error;
        return NextResponse.json({ message: "Staff assignment updated." });
      }

      case "save_branch_price": {
        if (!(isElevated(actor) || hasPermission(actor, "branches:manage", "branches:edit"))) {
          return NextResponse.json({ error: "You do not have permission to manage branch pricing." }, { status: 403 });
        }

        const branchId = body.branchId?.trim();
        const productId = body.productId?.trim();
        const price = Number(body.price ?? 0);
        const minPrice = body.minPrice === null || body.minPrice === undefined ? null : Number(body.minPrice);
        const maxPrice = body.maxPrice === null || body.maxPrice === undefined ? null : Number(body.maxPrice);

        if (!branchId || !productId || !Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: "Branch, product, and a valid price are required." }, { status: 400 });
        }

        if (!canAccessBranch(actor, branchId)) {
          return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
        }

        const upsertResult = await supabaseAdmin.from("branch_product_prices").upsert({
          branch_id: branchId,
          product_id: productId,
          price,
          min_price: Number.isFinite(minPrice as number) ? minPrice : null,
          max_price: Number.isFinite(maxPrice as number) ? maxPrice : null,
          is_active: body.isActive ?? true,
          notes: cleanText(body.notes),
          created_by: actor.profileId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "branch_id,product_id" });

        if (upsertResult.error) throw upsertResult.error;
        return NextResponse.json({ message: "Branch pricing saved." });
      }

      case "delete_branch_price": {
        if (!(isElevated(actor) || hasPermission(actor, "branches:manage", "branches:edit"))) {
          return NextResponse.json({ error: "You do not have permission to manage branch pricing." }, { status: 403 });
        }

        const branchId = body.branchId?.trim();
        const productId = body.productId?.trim();
        if (!branchId || !productId || !canAccessBranch(actor, branchId)) {
          return NextResponse.json({ error: "You do not have access to that branch price." }, { status: 403 });
        }

        const deleteResult = await supabaseAdmin
          .from("branch_product_prices")
          .delete()
          .eq("branch_id", branchId)
          .eq("product_id", productId);

        if (deleteResult.error) throw deleteResult.error;
        return NextResponse.json({ message: "Branch pricing removed." });
      }

      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[branches:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

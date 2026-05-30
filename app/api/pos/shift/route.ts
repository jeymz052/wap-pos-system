import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ActorContext = {
  profileId: string;
  branchId: string | null;
  dataAccessScope: string;
  roleName: string;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function getActorContext(profileId: string): Promise<ActorContext> {
  const result = await supabaseAdmin
    .from("users")
    .select("id, branch_id, data_access_scope, role:roles(name)")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw new Error("Authenticated user profile was not found.");

  const row = result.data as {
    id: string;
    branch_id?: string | null;
    data_access_scope?: string | null;
    role?: { name?: string | null } | null;
  };

  return {
    profileId: row.id,
    branchId: row.branch_id ?? null,
    dataAccessScope: row.data_access_scope ?? "branch_only",
    roleName: String(row.role?.name ?? "").toLowerCase(),
  };
}

function canAccessBranch(actor: ActorContext, branchId?: string | null) {
  if (!branchId) return true;
  if (actor.roleName === "super_admin") return true;
  if (actor.dataAccessScope === "all_data") return true;
  return actor.branchId === branchId;
}

async function getUserPermissions(userId: string) {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, role_id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) return new Set<string>();

  const roleId = (userRow as { role_id?: string | null }).role_id;
  if (!roleId) return new Set<string>();

  const { data: permissionRows, error: permissionError } = await supabaseAdmin
    .from("role_permissions")
    .select("is_allowed, permissions(module, action)")
    .eq("role_id", roleId)
    .eq("is_allowed", true);

  if (permissionError) throw permissionError;

  const permissions = new Set<string>();
  (permissionRows as Array<{ permissions?: { module?: string | null; action?: string | null } | null }> | null ?? []).forEach((row) => {
    const moduleName = row.permissions?.module;
    const action = row.permissions?.action;
    if (moduleName && action) permissions.add(`${moduleName}:${action}`);
  });

  return permissions;
}

function generateShiftNumber(date = new Date()) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = String(date.getTime()).slice(-6);
  return `SHIFT-${datePart}-${timePart}`;
}

async function getShiftPayload(shiftId: string) {
  const [shiftResult, movementResult, paymentResult] = await Promise.all([
    supabaseAdmin
      .from("v_cash_shift_report")
      .select("*")
      .eq("id", shiftId)
      .maybeSingle(),
    supabaseAdmin
      .from("cash_movements")
      .select("id, type, amount, reason, reference_number, created_by, created_at")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("sale_payments")
      .select("payment_method, amount, sales!inner(id, shift_id, status)")
      .eq("sales.shift_id", shiftId)
      .eq("sales.status", "completed"),
  ]);

  if (shiftResult.error) throw shiftResult.error;
  if (movementResult.error) throw movementResult.error;
  if (paymentResult.error) throw paymentResult.error;
  if (!shiftResult.data) return null;

  const paymentBreakdown = new Map<string, number>();
  ((paymentResult.data ?? []) as Array<{ payment_method: string; amount: number | string }>).forEach((row) => {
    paymentBreakdown.set(
      row.payment_method,
      roundMoney((paymentBreakdown.get(row.payment_method) ?? 0) + parseNumber(row.amount))
    );
  });

  const shift = shiftResult.data as Record<string, unknown> & {
    branch_id?: string | null;
    cash_difference?: number | string | null;
    status?: string | null;
  };
  const cashDifference = parseNumber(shift.cash_difference);

  return {
    shift: {
      ...shift,
      requiresApproval: Math.abs(cashDifference) > 0.009 || shift.status === "pending_approval",
    },
    movements: movementResult.data ?? [],
    paymentBreakdown: Array.from(paymentBreakdown.entries()).map(([method, amount]) => ({ method, amount })),
  };
}

async function validateCashierAccess({
  actor,
  authenticatedProfileId,
  cashierId,
}: {
  actor: ActorContext;
  authenticatedProfileId: string;
  cashierId: string;
}) {
  if (authenticatedProfileId === cashierId) return true;
  return actor.roleName === "super_admin";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "pos:view", "pos:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const shiftId = request.nextUrl.searchParams.get("shiftId")?.trim();
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim();
    const cashierId = request.nextUrl.searchParams.get("cashierId")?.trim();

    if (branchId && !canAccessBranch(actor, branchId)) {
      return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
    }

    if (shiftId) {
      const payload = await getShiftPayload(shiftId);
      if (!payload) {
        return NextResponse.json({ error: "Shift not found." }, { status: 404 });
      }

      if (!canAccessBranch(actor, String(payload.shift.branch_id ?? ""))) {
        return NextResponse.json({ error: "You do not have access to that shift." }, { status: 403 });
      }

      return NextResponse.json(payload);
    }

    let query = supabaseAdmin
      .from("v_cash_shift_report")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (branchId) query = query.eq("branch_id", branchId);
    if (cashierId) query = query.eq("cashier_id", cashierId);

    const activeResult = await query.in("status", ["open", "pending_approval"]);
    if (activeResult.error) throw activeResult.error;

    const shift = (activeResult.data?.[0] as Record<string, unknown> | undefined) ?? null;
    if (!shift) {
      return NextResponse.json({ shift: null, movements: [], paymentBreakdown: [] });
    }

    const payload = await getShiftPayload(String(shift.id));
    return NextResponse.json(payload ?? { shift: null, movements: [], paymentBreakdown: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pos:shift:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const body = await request.json() as {
      action?: string;
      branchId?: string;
      cashierId?: string;
      startingCash?: number | string;
      shiftId?: string;
      actualCash?: number | string;
      notes?: string;
      movementType?: "cash_in" | "cash_out";
      amount?: number | string;
      reason?: string;
      referenceNumber?: string;
      approverUserId?: string;
      approvalNotes?: string;
    };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "open_shift") {
      if (!hasAnyPermission(user, "pos:create", "pos:manage")) {
        return NextResponse.json({ error: "You do not have permission to open shifts." }, { status: 403 });
      }

      const branchId = body.branchId?.trim();
      const cashierId = body.cashierId?.trim();
      if (!branchId || !cashierId) {
        return NextResponse.json({ error: "Branch and cashier are required." }, { status: 400 });
      }

      if (!canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      if (!(await validateCashierAccess({ actor, authenticatedProfileId: user.profileId, cashierId }))) {
        return NextResponse.json({ error: "You cannot open a shift for another cashier." }, { status: 403 });
      }

      const { data: existingOpen, error: existingError } = await supabaseAdmin
        .from("cash_shifts")
        .select("id, status")
        .eq("branch_id", branchId)
        .eq("cashier_id", cashierId)
        .in("status", ["open", "pending_approval"])
        .limit(1);

      if (existingError) throw existingError;
      if ((existingOpen ?? []).length) {
        const existingStatus = (existingOpen?.[0] as { status?: string } | undefined)?.status;
        return NextResponse.json({
          error: existingStatus === "pending_approval"
            ? "The previous shift is still pending manager approval."
            : "An open shift already exists for this cashier.",
        }, { status: 409 });
      }

      const startingCash = roundMoney(Math.max(0, parseNumber(body.startingCash)));
      const now = new Date();
      const insertResult = await supabaseAdmin
        .from("cash_shifts")
        .insert({
          branch_id: branchId,
          cashier_id: cashierId,
          shift_number: generateShiftNumber(now),
          status: "open",
          starting_cash: startingCash,
          expected_cash: startingCash,
          total_cash_sales: 0,
          total_noncash: 0,
          notes: body.notes?.trim() || null,
          opened_at: now.toISOString(),
          created_at: now.toISOString(),
          approved_by: null,
          approved_at: null,
          approval_notes: null,
          closing_submitted_at: null,
          actual_cash: null,
          cash_difference: null,
          closed_at: null,
        })
        .select("id")
        .single();

      if (insertResult.error) throw insertResult.error;

      const payload = await getShiftPayload((insertResult.data as { id: string }).id);
      return NextResponse.json({ success: true, ...payload });
    }

    if (action === "add_movement") {
      if (!hasAnyPermission(user, "pos:create", "pos:edit", "pos:manage")) {
        return NextResponse.json({ error: "You do not have permission to record cash movements." }, { status: 403 });
      }

      const shiftId = body.shiftId?.trim();
      const cashierId = body.cashierId?.trim();
      const movementType = body.movementType;
      const amount = roundMoney(parseNumber(body.amount));
      const reason = body.reason?.trim() ?? "";

      if (!shiftId || !cashierId || !movementType) {
        return NextResponse.json({ error: "Shift, cashier, and movement type are required." }, { status: 400 });
      }

      if (!["cash_in", "cash_out"].includes(movementType)) {
        return NextResponse.json({ error: "Movement type must be cash_in or cash_out." }, { status: 400 });
      }

      if (amount <= 0) {
        return NextResponse.json({ error: "Movement amount must be greater than zero." }, { status: 400 });
      }

      if (!reason) {
        return NextResponse.json({ error: "Reason is required for cash in/out." }, { status: 400 });
      }

      const shiftResult = await supabaseAdmin
        .from("cash_shifts")
        .select("id, branch_id, cashier_id, status, expected_cash")
        .eq("id", shiftId)
        .maybeSingle();

      if (shiftResult.error) throw shiftResult.error;
      if (!shiftResult.data) {
        return NextResponse.json({ error: "Shift not found." }, { status: 404 });
      }

      const shift = shiftResult.data as {
        id: string;
        branch_id: string;
        cashier_id: string;
        status: string;
        expected_cash?: number | string | null;
      };

      if (shift.status !== "open") {
        return NextResponse.json({ error: "Cash movements can only be added to an open shift." }, { status: 400 });
      }

      if (!canAccessBranch(actor, shift.branch_id)) {
        return NextResponse.json({ error: "You do not have access to that shift." }, { status: 403 });
      }

      if (shift.cashier_id !== cashierId) {
        return NextResponse.json({ error: "Cashier does not match the active shift." }, { status: 400 });
      }

      if (!(await validateCashierAccess({ actor, authenticatedProfileId: user.profileId, cashierId }))) {
        return NextResponse.json({ error: "You cannot record movements for another cashier." }, { status: 403 });
      }

      const delta = movementType === "cash_in" ? amount : -amount;
      const nextExpectedCash = roundMoney(parseNumber(shift.expected_cash) + delta);
      if (nextExpectedCash < 0) {
        return NextResponse.json({ error: "Cash out would make expected cash negative." }, { status: 400 });
      }

      const { error: movementError } = await supabaseAdmin.from("cash_movements").insert({
        shift_id: shiftId,
        type: movementType,
        amount,
        reason,
        reference_number: body.referenceNumber?.trim() || null,
        created_by: cashierId,
      });

      if (movementError) throw movementError;

      const { error: shiftUpdateError } = await supabaseAdmin
        .from("cash_shifts")
        .update({ expected_cash: nextExpectedCash })
        .eq("id", shiftId);

      if (shiftUpdateError) throw shiftUpdateError;

      const payload = await getShiftPayload(shiftId);
      return NextResponse.json({ success: true, ...payload });
    }

    if (action === "close_shift") {
      if (!hasAnyPermission(user, "pos:create", "pos:edit", "pos:manage")) {
        return NextResponse.json({ error: "You do not have permission to close shifts." }, { status: 403 });
      }

      const shiftId = body.shiftId?.trim();
      const cashierId = body.cashierId?.trim();
      if (!shiftId || !cashierId) {
        return NextResponse.json({ error: "Shift and cashier are required." }, { status: 400 });
      }

      const shiftResult = await supabaseAdmin
        .from("cash_shifts")
        .select("id, branch_id, cashier_id, status, expected_cash")
        .eq("id", shiftId)
        .maybeSingle();

      if (shiftResult.error) throw shiftResult.error;
      if (!shiftResult.data) {
        return NextResponse.json({ error: "Shift not found." }, { status: 404 });
      }

      const shift = shiftResult.data as {
        id: string;
        branch_id: string;
        cashier_id: string;
        status: string;
        expected_cash?: number | string | null;
      };

      if (shift.status !== "open") {
        return NextResponse.json({ error: "Only open shifts can be closed." }, { status: 400 });
      }

      if (!canAccessBranch(actor, shift.branch_id)) {
        return NextResponse.json({ error: "You do not have access to that shift." }, { status: 403 });
      }

      if (shift.cashier_id !== cashierId) {
        return NextResponse.json({ error: "Cashier does not match the active shift." }, { status: 400 });
      }

      if (!(await validateCashierAccess({ actor, authenticatedProfileId: user.profileId, cashierId }))) {
        return NextResponse.json({ error: "You cannot close a shift for another cashier." }, { status: 403 });
      }

      const expectedCash = roundMoney(parseNumber(shift.expected_cash));
      const actualCash = roundMoney(Math.max(0, parseNumber(body.actualCash)));
      const difference = roundMoney(actualCash - expectedCash);
      const requiresApproval = Math.abs(difference) > 0.009;
      const now = new Date().toISOString();

      const updateResult = await supabaseAdmin
        .from("cash_shifts")
        .update({
          status: requiresApproval ? "pending_approval" : "closed",
          actual_cash: actualCash,
          cash_difference: difference,
          notes: body.notes?.trim() || null,
          closing_submitted_at: now,
          closed_at: now,
          approved_by: requiresApproval ? null : user.profileId,
          approved_at: requiresApproval ? null : now,
          approval_notes: requiresApproval ? null : "Balanced shift closed without approval override.",
        })
        .eq("id", shiftId)
        .select("id")
        .single();

      if (updateResult.error) throw updateResult.error;

      const payload = await getShiftPayload(shiftId);
      return NextResponse.json({
        success: true,
        requiresApproval,
        expectedCash,
        actualCash,
        difference,
        ...payload,
      });
    }

    if (action === "approve_shift") {
      const shiftId = body.shiftId?.trim();
      const approverUserId = body.approverUserId?.trim();
      if (!shiftId || !approverUserId) {
        return NextResponse.json({ error: "Shift and approver are required." }, { status: 400 });
      }

      const approverPermissions = await getUserPermissions(approverUserId);
      const canApprove = approverPermissions.has("pos:manage");
      if (!canApprove) {
        return NextResponse.json({ error: "Approver does not have manager approval permission." }, { status: 403 });
      }

      const shiftResult = await supabaseAdmin
        .from("cash_shifts")
        .select("id, branch_id, status")
        .eq("id", shiftId)
        .maybeSingle();

      if (shiftResult.error) throw shiftResult.error;
      if (!shiftResult.data) {
        return NextResponse.json({ error: "Shift not found." }, { status: 404 });
      }

      const shift = shiftResult.data as { id: string; branch_id: string; status: string };
      if (!canAccessBranch(actor, shift.branch_id)) {
        return NextResponse.json({ error: "You do not have access to that shift." }, { status: 403 });
      }

      if (shift.status !== "pending_approval") {
        return NextResponse.json({ error: "Only shifts pending approval can be approved." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const { error: approvalError } = await supabaseAdmin
        .from("cash_shifts")
        .update({
          status: "closed",
          approved_by: approverUserId,
          approved_at: now,
          approval_notes: body.approvalNotes?.trim() || null,
        })
        .eq("id", shiftId);

      if (approvalError) throw approvalError;

      const payload = await getShiftPayload(shiftId);
      return NextResponse.json({ success: true, ...payload });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pos:shift:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  parseNumber,
  roundMoney,
  type ExpensePaymentMethod,
  type ExpenseStatus,
  type ExpenseType,
} from "@/lib/expenses";

type ActorContext = {
  profileId: string;
  branchId: string | null;
  dataAccessScope: string;
  roleName: string;
};

type ExpenseMutationPayload = {
  action: "create_expense" | "update_expense" | "approve_expense" | "reject_expense" | "delete_expense";
  expenseId?: string;
  branchId?: string;
  expenseCategoryId?: string | null;
  supplierId?: string | null;
  staffUserId?: string | null;
  expenseType?: ExpenseType;
  amount?: number | string;
  description?: string;
  expenseDate?: string;
  paymentMethod?: ExpensePaymentMethod;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  referenceNumber?: string | null;
  approvalNotes?: string | null;
  status?: ExpenseStatus;
};

function normalizeExpenseType(value?: string | null): ExpenseType {
  const normalized = String(value ?? "operating").trim().toLowerCase();
  const allowed: ExpenseType[] = ["operating", "supplier_payment", "salary", "rent", "utilities", "delivery", "other"];
  return allowed.includes(normalized as ExpenseType) ? (normalized as ExpenseType) : "operating";
}

function normalizeStatus(value?: string | null): ExpenseStatus {
  const normalized = String(value ?? "pending").trim().toLowerCase();
  const allowed: ExpenseStatus[] = ["pending", "approved", "rejected"];
  return allowed.includes(normalized as ExpenseStatus) ? (normalized as ExpenseStatus) : "pending";
}

function normalizePaymentMethod(value?: string | null): ExpensePaymentMethod {
  const normalized = String(value ?? "cash").trim().toLowerCase();
  const allowed: ExpensePaymentMethod[] = ["cash", "card", "bank_transfer", "gcash", "ewallet", "customer_credit", "split"];
  return allowed.includes(normalized as ExpensePaymentMethod) ? (normalized as ExpensePaymentMethod) : "cash";
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

async function upsertLinkedSupplierPayment({
  supplierPaymentId,
  supplierId,
  amount,
  paymentMethod,
  referenceNumber,
  expenseDate,
  description,
  createdBy,
}: {
  supplierPaymentId?: string | null;
  supplierId?: string | null;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  referenceNumber?: string | null;
  expenseDate: string;
  description: string;
  createdBy: string;
}) {
  if (!supplierId) return null;

  const paymentPayload = {
    supplier_id: supplierId,
    amount,
    payment_method: paymentMethod,
    reference_no: referenceNumber?.trim() || null,
    paid_at: new Date(`${expenseDate}T12:00:00`).toISOString(),
    notes: `Linked expense: ${description}`.trim(),
    created_by: createdBy,
  };

  if (supplierPaymentId) {
    const updateResult = await supabaseAdmin
      .from("supplier_payments")
      .update(paymentPayload)
      .eq("id", supplierPaymentId)
      .select("id")
      .single();

    if (updateResult.error) throw updateResult.error;
    return (updateResult.data as { id: string }).id;
  }

  const insertResult = await supabaseAdmin
    .from("supplier_payments")
    .insert(paymentPayload)
    .select("id")
    .single();

  if (insertResult.error) throw insertResult.error;
  return (insertResult.data as { id: string }).id;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "expenses:view", "expenses:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const branchId = request.nextUrl.searchParams.get("branchId");

    if (branchId && !canAccessBranch(actor, branchId)) {
      return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
    }

    let branchesQuery = supabaseAdmin.from("branches").select("id, name, is_main").eq("is_active", true).order("is_main", { ascending: false }).order("name");
    let suppliersQuery = supabaseAdmin.from("suppliers").select("id, name, branch_id").eq("is_active", true).order("name");
    let staffQuery = supabaseAdmin.from("users").select("id, first_name, last_name, username, branch_id, is_active").eq("is_active", true).order("first_name").order("last_name");
    let expensesQuery = supabaseAdmin.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });

    const activeBranchId = branchId || actor.branchId;
    if (actor.roleName !== "super_admin" && actor.dataAccessScope !== "all_data") {
      branchesQuery = branchesQuery.eq("id", actor.branchId ?? "");
      suppliersQuery = suppliersQuery.eq("branch_id", actor.branchId ?? "");
      staffQuery = staffQuery.eq("branch_id", actor.branchId ?? "");
      expensesQuery = expensesQuery.eq("branch_id", actor.branchId ?? "");
    } else if (activeBranchId) {
      suppliersQuery = suppliersQuery.eq("branch_id", activeBranchId);
      staffQuery = staffQuery.eq("branch_id", activeBranchId);
      expensesQuery = expensesQuery.eq("branch_id", activeBranchId);
    }

    const [branchesResult, categoriesResult, suppliersResult, staffResult, expensesResult] = await Promise.all([
      branchesQuery,
      supabaseAdmin.from("expense_categories").select("id, name, description, is_active").eq("is_active", true).order("name"),
      suppliersQuery,
      staffQuery,
      expensesQuery,
    ]);

    const error =
      branchesResult.error ||
      categoriesResult.error ||
      suppliersResult.error ||
      staffResult.error ||
      expensesResult.error;

    if (error) throw error;

    return NextResponse.json({
      branches: branchesResult.data ?? [],
      categories: categoriesResult.data ?? [],
      suppliers: suppliersResult.data ?? [],
      staff: staffResult.data ?? [],
      expenses: expensesResult.data ?? [],
      actor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[expenses:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = (await request.json()) as ExpenseMutationPayload;
    const actor = await getActorContext(user.profileId);

    if (payload.action === "create_expense") {
      if (!hasAnyPermission(user, "expenses:create", "expenses:manage")) {
        return NextResponse.json({ error: "You do not have permission to record expenses." }, { status: 403 });
      }

      const branchId = payload.branchId?.trim();
      if (!branchId || !canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "Choose a valid branch for this expense." }, { status: 400 });
      }

      const amount = roundMoney(parseNumber(payload.amount));
      if (amount <= 0) {
        return NextResponse.json({ error: "Expense amount must be greater than zero." }, { status: 400 });
      }

      const expenseDate = payload.expenseDate?.trim();
      if (!expenseDate) {
        return NextResponse.json({ error: "Expense date is required." }, { status: 400 });
      }

      const description = payload.description?.trim() ?? "";
      if (!description) {
        return NextResponse.json({ error: "Expense description is required." }, { status: 400 });
      }

      const expenseType = normalizeExpenseType(payload.expenseType);
      const requestedStatus = normalizeStatus(payload.status);
      const canApprove = hasAnyPermission(user, "expenses:approve", "expenses:manage");
      const status = requestedStatus === "pending" || canApprove ? requestedStatus : "pending";
      const now = new Date().toISOString();

      const insertPayload = {
        branch_id: branchId,
        expense_category_id: payload.expenseCategoryId || null,
        supplier_id: payload.supplierId || null,
        staff_user_id: payload.staffUserId || null,
        expense_type: expenseType,
        amount,
        description,
        expense_date: expenseDate,
        payment_method: normalizePaymentMethod(payload.paymentMethod),
        receipt_url: payload.receiptUrl || null,
        receipt_file_name: payload.receiptFileName || null,
        reference_number: payload.referenceNumber?.trim() || null,
        status,
        approval_notes: payload.approvalNotes?.trim() || null,
        approved_by: status === "approved" ? actor.profileId : null,
        approved_at: status === "approved" ? now : null,
        rejected_by: status === "rejected" ? actor.profileId : null,
        rejected_at: status === "rejected" ? now : null,
        created_by: actor.profileId,
      };

      const insertResult = await supabaseAdmin.from("expenses").insert(insertPayload).select("*").single();
      if (insertResult.error) throw insertResult.error;

      const insertedExpense = insertResult.data as { id: string; supplier_payment_id?: string | null };

      if (expenseType === "supplier_payment" && payload.supplierId) {
        try {
          const supplierPaymentId = await upsertLinkedSupplierPayment({
            supplierPaymentId: null,
            supplierId: payload.supplierId,
            amount,
            paymentMethod: normalizePaymentMethod(payload.paymentMethod),
            referenceNumber: payload.referenceNumber,
            expenseDate,
            description,
            createdBy: actor.profileId,
          });

          if (supplierPaymentId) {
            const updateLinkResult = await supabaseAdmin
              .from("expenses")
              .update({ supplier_payment_id: supplierPaymentId })
              .eq("id", insertedExpense.id)
              .select("*")
              .single();

            if (updateLinkResult.error) throw updateLinkResult.error;

            return NextResponse.json({
              success: true,
              expense: updateLinkResult.data,
              message: "Expense and supplier payment recorded.",
            });
          }
        } catch (error) {
          await supabaseAdmin.from("expenses").delete().eq("id", insertedExpense.id);
          throw error;
        }
      }

      return NextResponse.json({
        success: true,
        expense: insertResult.data,
        message: "Expense recorded successfully.",
      });
    }

    if (payload.action === "update_expense") {
      if (!hasAnyPermission(user, "expenses:edit", "expenses:manage", "expenses:approve")) {
        return NextResponse.json({ error: "You do not have permission to edit expenses." }, { status: 403 });
      }

      const expenseId = payload.expenseId?.trim();
      if (!expenseId) {
        return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
      }

      const existingResult = await supabaseAdmin
        .from("expenses")
        .select("id, branch_id, supplier_payment_id, status")
        .eq("id", expenseId)
        .maybeSingle();

      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) {
        return NextResponse.json({ error: "Expense not found." }, { status: 404 });
      }

      const existing = existingResult.data as {
        id: string;
        branch_id: string;
        supplier_payment_id?: string | null;
        status: ExpenseStatus;
      };

      const branchId = payload.branchId?.trim() || existing.branch_id;
      if (!canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const amount = roundMoney(parseNumber(payload.amount));
      if (amount <= 0) {
        return NextResponse.json({ error: "Expense amount must be greater than zero." }, { status: 400 });
      }

      const expenseDate = payload.expenseDate?.trim();
      if (!expenseDate) {
        return NextResponse.json({ error: "Expense date is required." }, { status: 400 });
      }

      const description = payload.description?.trim() ?? "";
      if (!description) {
        return NextResponse.json({ error: "Expense description is required." }, { status: 400 });
      }

      const expenseType = normalizeExpenseType(payload.expenseType);
      const nextStatus = normalizeStatus(payload.status ?? existing.status);
      const canApprove = hasAnyPermission(user, "expenses:approve", "expenses:manage");

      if (nextStatus !== existing.status && !canApprove) {
        return NextResponse.json({ error: "Only approvers can change expense status." }, { status: 403 });
      }

      const now = new Date().toISOString();
      const updatePayload = {
        branch_id: branchId,
        expense_category_id: payload.expenseCategoryId || null,
        supplier_id: payload.supplierId || null,
        staff_user_id: payload.staffUserId || null,
        expense_type: expenseType,
        amount,
        description,
        expense_date: expenseDate,
        payment_method: normalizePaymentMethod(payload.paymentMethod),
        receipt_url: payload.receiptUrl || null,
        receipt_file_name: payload.receiptFileName || null,
        reference_number: payload.referenceNumber?.trim() || null,
        status: nextStatus,
        approval_notes: payload.approvalNotes?.trim() || null,
        approved_by: nextStatus === "approved" ? actor.profileId : null,
        approved_at: nextStatus === "approved" ? now : null,
        rejected_by: nextStatus === "rejected" ? actor.profileId : null,
        rejected_at: nextStatus === "rejected" ? now : null,
      };

      const updateResult = await supabaseAdmin.from("expenses").update(updatePayload).eq("id", expenseId).select("*").single();
      if (updateResult.error) throw updateResult.error;

      if (expenseType === "supplier_payment" && payload.supplierId) {
        const supplierPaymentId = await upsertLinkedSupplierPayment({
          supplierPaymentId: existing.supplier_payment_id ?? null,
          supplierId: payload.supplierId,
          amount,
          paymentMethod: normalizePaymentMethod(payload.paymentMethod),
          referenceNumber: payload.referenceNumber,
          expenseDate,
          description,
          createdBy: actor.profileId,
        });

        if (supplierPaymentId && supplierPaymentId !== existing.supplier_payment_id) {
          await supabaseAdmin.from("expenses").update({ supplier_payment_id: supplierPaymentId }).eq("id", expenseId);
        }
      } else if (existing.supplier_payment_id) {
        await supabaseAdmin.from("supplier_payments").delete().eq("id", existing.supplier_payment_id);
        await supabaseAdmin.from("expenses").update({ supplier_payment_id: null, supplier_id: payload.supplierId || null }).eq("id", expenseId);
      }

      return NextResponse.json({
        success: true,
        expense: updateResult.data,
        message: "Expense updated successfully.",
      });
    }

    if (payload.action === "approve_expense" || payload.action === "reject_expense") {
      if (!hasAnyPermission(user, "expenses:approve", "expenses:manage")) {
        return NextResponse.json({ error: "You do not have permission to approve expenses." }, { status: 403 });
      }

      const expenseId = payload.expenseId?.trim();
      if (!expenseId) {
        return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
      }

      const existingResult = await supabaseAdmin.from("expenses").select("id, branch_id").eq("id", expenseId).maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) {
        return NextResponse.json({ error: "Expense not found." }, { status: 404 });
      }

      if (!canAccessBranch(actor, (existingResult.data as { branch_id: string }).branch_id)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const now = new Date().toISOString();
      const approved = payload.action === "approve_expense";
      const updateResult = await supabaseAdmin
        .from("expenses")
        .update({
          status: approved ? "approved" : "rejected",
          approval_notes: payload.approvalNotes?.trim() || null,
          approved_by: approved ? actor.profileId : null,
          approved_at: approved ? now : null,
          rejected_by: approved ? null : actor.profileId,
          rejected_at: approved ? null : now,
        })
        .eq("id", expenseId)
        .select("*")
        .single();

      if (updateResult.error) throw updateResult.error;

      return NextResponse.json({
        success: true,
        expense: updateResult.data,
        message: approved ? "Expense approved." : "Expense rejected.",
      });
    }

    if (payload.action === "delete_expense") {
      if (!hasAnyPermission(user, "expenses:manage")) {
        return NextResponse.json({ error: "Only managers can delete expenses." }, { status: 403 });
      }

      const expenseId = payload.expenseId?.trim();
      if (!expenseId) {
        return NextResponse.json({ error: "Expense ID is required." }, { status: 400 });
      }

      const existingResult = await supabaseAdmin
        .from("expenses")
        .select("id, branch_id, supplier_payment_id")
        .eq("id", expenseId)
        .maybeSingle();

      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) {
        return NextResponse.json({ error: "Expense not found." }, { status: 404 });
      }

      const existing = existingResult.data as { id: string; branch_id: string; supplier_payment_id?: string | null };
      if (!canAccessBranch(actor, existing.branch_id)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      if (existing.supplier_payment_id) {
        await supabaseAdmin.from("supplier_payments").delete().eq("id", existing.supplier_payment_id);
      }

      const deleteResult = await supabaseAdmin.from("expenses").delete().eq("id", expenseId);
      if (deleteResult.error) throw deleteResult.error;

      return NextResponse.json({
        success: true,
        message: "Expense deleted successfully.",
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[expenses:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

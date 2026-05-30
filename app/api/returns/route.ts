import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { refundMethodOptions, parseNumber } from "@/lib/returns";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByProfileId } from "@/lib/user-access";

type ReturnItemInput = {
  productId: string;
  saleItemId?: string | null;
  quantity: number;
  unitPrice: number;
  condition?: string;
  stockAction?: string;
  exchangeProductId?: string | null;
  exchangeQuantity?: number;
  warrantyRecordId?: string | null;
  notes?: string | null;
};

type ApprovalInput = {
  returnItemId: string;
  approvedQuantity: number;
  stockAction?: string;
};

type ExchangeItemInput = {
  productId: string;
  quantity: number;
  notes?: string;
};

async function getUserPermissions(userId: string) {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, username, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) return null;
  const accessProfile = await getAccessProfileByProfileId((userRow as { id: string }).id);

  return {
    id: (userRow as { id: string }).id,
    permissions: accessProfile?.permissions ?? new Set<string>(),
    restrictions: accessProfile?.salesRestrictions ?? null,
  };
}

async function verifyApprover(username: string, pin: string, requiredPermissions: string[]) {
  const { data, error } = await supabaseAdmin.rpc("verify_cashier_pin", {
    p_username: username.trim(),
    p_pin: pin.trim(),
  });

  if (error) {
    throw new Error("Approval PIN verification failed.");
  }

  const result = data as { success: boolean; user_id?: string };
  if (!result.success || !result.user_id) {
    throw new Error("Invalid approver username or PIN.");
  }

      const approver = await getUserPermissions(result.user_id);
  if (!approver) {
    throw new Error("Approver account was not found.");
  }

  const allowed = requiredPermissions.every((permission) =>
    approver.permissions.has(permission) ||
    approver.permissions.has("returns:manage") ||
    approver.permissions.has("pos:manage")
  );

  if (!allowed) {
    throw new Error("Approver does not have the required permission.");
  }

  return approver.id;
}

function buildReturnNumber() {
  const now = new Date();
  return `RET-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-6)}`;
}

function buildClaimNumber() {
  const now = new Date();
  return `WCL-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-6)}`;
}

async function getReturnWithItems(returnId: string) {
  const returnResult = await supabaseAdmin
    .from("returns")
    .select("*")
    .eq("id", returnId)
    .maybeSingle();

  if (returnResult.error) throw returnResult.error;
  if (!returnResult.data) throw new Error("Return request was not found.");

  const itemsResult = await supabaseAdmin
    .from("return_items")
    .select("*")
    .eq("return_id", returnId)
    .order("id", { ascending: true });

  if (itemsResult.error) throw itemsResult.error;

  return {
    header: returnResult.data as Record<string, unknown>,
    items: (itemsResult.data ?? []) as Array<Record<string, unknown>>,
  };
}

async function validateRequestedQuantities(items: ReturnItemInput[]) {
  const saleItemIds = items.map((item) => item.saleItemId).filter(Boolean) as string[];
  if (!saleItemIds.length) return;

  const { data, error } = await supabaseAdmin
    .from("sale_items")
    .select("id, quantity, returned_quantity")
    .in("id", saleItemIds);

  if (error) throw error;

  const saleItemMap = new Map(
    ((data ?? []) as Array<{ id: string; quantity: number; returned_quantity?: number | null }>).map((row) => [
      row.id,
      { quantity: row.quantity, returnedQuantity: row.returned_quantity ?? 0 },
    ])
  );

  for (const item of items) {
    if (!item.saleItemId) continue;
    const saleItem = saleItemMap.get(item.saleItemId);
    if (!saleItem) throw new Error("One of the selected sale items no longer exists.");

    const availableQuantity = Math.max(0, saleItem.quantity - saleItem.returnedQuantity);
    if (item.quantity > availableQuantity) {
      throw new Error(`Requested quantity exceeds the remaining returnable quantity for sale item ${item.saleItemId}.`);
    }
  }
}

async function finalizeSaleItemReturns(items: Array<Record<string, unknown>>) {
  for (const item of items) {
    const saleItemId = item.sale_item_id as string | null;
    if (!saleItemId) continue;

    const approvedQuantity = Math.max(
      0,
      Number(item.approved_quantity ?? item.quantity ?? 0)
    );

    if (!approvedQuantity) continue;

    const saleItemResult = await supabaseAdmin
      .from("sale_items")
      .select("quantity, returned_quantity")
      .eq("id", saleItemId)
      .maybeSingle();

    if (saleItemResult.error) throw saleItemResult.error;
    if (!saleItemResult.data) throw new Error("Sale item was not found while finalizing the return.");

    const saleItem = saleItemResult.data as { quantity: number; returned_quantity?: number | null };
    const nextReturnedQuantity = Number(saleItem.returned_quantity ?? 0) + approvedQuantity;
    if (nextReturnedQuantity > saleItem.quantity) {
      throw new Error("Return quantity exceeds the original sold quantity.");
    }

    const updateResult = await supabaseAdmin
      .from("sale_items")
      .update({ returned_quantity: nextReturnedQuantity })
      .eq("id", saleItemId);

    if (updateResult.error) throw updateResult.error;
  }
}

async function applyReturnInventory(
  returnHeader: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  actorId: string
) {
  const branchId = String(returnHeader.branch_id ?? "");
  const reason = String(returnHeader.reason ?? "Return");

  for (const item of items) {
    const approvedQuantity = Math.max(0, Number(item.approved_quantity ?? item.quantity ?? 0));
    const stockAction = String(item.stock_action ?? returnHeader.stock_handling ?? "restock");
    const condition = String(item.condition ?? "good");

    if (!approvedQuantity || stockAction !== "restock" || condition !== "good") {
      continue;
    }

    await applyInventoryMovement({
      productId: String(item.product_id),
      branchId,
      movementType: "return_in",
      quantityDelta: approvedQuantity,
      referenceType: "return",
      referenceId: String(returnHeader.id),
      createdBy: actorId,
      notes: `Return restock: ${reason}`,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      branchId,
      cashierId,
      saleId,
      customerId,
      searchMode,
      requestType,
      reason,
      notes,
      refundMethod,
      refundAmount,
      storeCredit,
      approvalRequired,
      stockHandling,
      items,
    } = body as {
      branchId?: string;
      cashierId?: string;
      saleId?: string | null;
      customerId?: string | null;
      searchMode?: string;
      requestType?: string;
      reason?: string;
      notes?: string;
      refundMethod?: string;
      refundAmount?: number;
      storeCredit?: number;
      approvalRequired?: boolean;
      stockHandling?: string;
      items?: ReturnItemInput[];
    };

    if (!branchId || !cashierId || !items?.length || !reason?.trim()) {
      return NextResponse.json({ error: "Missing required return request details." }, { status: 400 });
    }

    await validateRequestedQuantities(items);

    let saleInvoiceNumber: string | null = null;
    let customerName: string | null = null;
    let resolvedCustomerId = customerId ?? null;

    if (saleId) {
      const saleResult = await supabaseAdmin
        .from("sales")
        .select("id, invoice_number, customer_id, customer:customers(name)")
        .eq("id", saleId)
        .maybeSingle();

      if (saleResult.error) throw saleResult.error;
      if (!saleResult.data) {
        return NextResponse.json({ error: "Sale record not found." }, { status: 404 });
      }

      const sale = saleResult.data as {
        invoice_number: string;
        customer_id?: string | null;
        customer?: { name?: string | null } | null;
      };

      saleInvoiceNumber = sale.invoice_number;
      resolvedCustomerId = sale.customer_id ?? resolvedCustomerId;
      customerName = sale.customer?.name?.trim() || null;
    }

    if (resolvedCustomerId && !customerName) {
      const customerResult = await supabaseAdmin
        .from("customers")
        .select("name")
        .eq("id", resolvedCustomerId)
        .maybeSingle();

      if (customerResult.error) throw customerResult.error;
      customerName = (customerResult.data as { name?: string | null } | null)?.name?.trim() || null;
    }

    const normalizedRefundMethod = refundMethodOptions.includes((refundMethod ?? "cash") as never)
      ? refundMethod
      : "cash";

    const requestedReturn = await supabaseAdmin
      .from("returns")
      .insert({
        return_number: buildReturnNumber(),
        sale_id: saleId ?? null,
        sale_invoice_number: saleInvoiceNumber,
        customer_id: resolvedCustomerId,
        customer_name: customerName,
        branch_id: branchId,
        status: "requested",
        request_type: requestType ?? "refund",
        search_mode: searchMode ?? "receipt",
        reason: reason.trim(),
        refund_method: normalizedRefundMethod,
        refund_amount: parseNumber(refundAmount),
        store_credit: parseNumber(storeCredit),
        stock_handling: stockHandling ?? "restock",
        approval_required: approvalRequired ?? true,
        notes: notes?.trim() || null,
        requested_by: cashierId,
        requested_at: new Date().toISOString(),
      })
      .select("id, return_number")
      .single();

    if (requestedReturn.error) throw requestedReturn.error;

    const returnItemsPayload = items.map((item) => ({
      return_id: requestedReturn.data.id,
      product_id: item.productId,
      sale_item_id: item.saleItemId ?? null,
      quantity: item.quantity,
      unit_price: parseNumber(item.unitPrice),
      condition: item.condition ?? "good",
      stock_action: item.stockAction ?? stockHandling ?? "restock",
      exchange_product_id: item.exchangeProductId ?? null,
      exchange_quantity: Math.max(0, Number(item.exchangeQuantity ?? 0)),
      warranty_record_id: item.warrantyRecordId ?? null,
      notes: item.notes?.trim() || null,
    }));

    const itemsResult = await supabaseAdmin.from("return_items").insert(returnItemsPayload);
    if (itemsResult.error) throw itemsResult.error;

    return NextResponse.json({
      success: true,
      returnId: requestedReturn.data.id,
      returnNumber: requestedReturn.data.return_number,
      message: "Return request created and is awaiting review.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[returns:create]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      returnId,
      action,
      actorId,
      notes,
      rejectionReason,
      refundMethod,
      refundAmount,
      storeCredit,
      refundReferenceNo,
      exchangeReferenceNo,
      exchangeSaleId,
      exchangeItems,
      itemApprovals,
      approverUsername,
      approverPin,
    } = body as {
      returnId?: string;
      action?: string;
      actorId?: string;
      notes?: string;
      rejectionReason?: string;
      refundMethod?: string;
      refundAmount?: number;
      storeCredit?: number;
      refundReferenceNo?: string;
      exchangeReferenceNo?: string;
      exchangeSaleId?: string | null;
      exchangeItems?: ExchangeItemInput[];
      itemApprovals?: ApprovalInput[];
      approverUsername?: string;
      approverPin?: string;
    };

    if (!returnId || !action) {
      return NextResponse.json({ error: "Return action payload is incomplete." }, { status: 400 });
    }

    const { header, items } = await getReturnWithItems(returnId);
    const now = new Date().toISOString();

    if (action === "approve" || action === "reject") {
      if (!approverUsername?.trim() || !approverPin?.trim()) {
        return NextResponse.json({ error: "Approver username and PIN are required." }, { status: 400 });
      }

      const approverId = await verifyApprover(approverUsername, approverPin, ["returns:approve"]);

      if (action === "approve") {
        for (const approval of itemApprovals ?? []) {
          const updateResult = await supabaseAdmin
            .from("return_items")
            .update({
              approved_quantity: Math.max(0, Number(approval.approvedQuantity ?? 0)),
              stock_action: approval.stockAction ?? undefined,
            })
            .eq("id", approval.returnItemId);

          if (updateResult.error) throw updateResult.error;
        }

        const updateReturn = await supabaseAdmin
          .from("returns")
          .update({
            status: "approved",
            approved_by: approverId,
            approved_at: now,
            processed_at: now,
            approval_notes: notes?.trim() || null,
          })
          .eq("id", returnId);

        if (updateReturn.error) throw updateReturn.error;

        return NextResponse.json({ success: true, message: "Return request approved." });
      }

      const rejectResult = await supabaseAdmin
        .from("returns")
        .update({
          status: "rejected",
          approved_by: approverId,
          rejected_at: now,
          processed_at: now,
          rejection_reason: rejectionReason?.trim() || notes?.trim() || "Return was rejected.",
        })
        .eq("id", returnId);

      if (rejectResult.error) throw rejectResult.error;

      return NextResponse.json({ success: true, message: "Return request rejected." });
    }

    if (!actorId) {
      return NextResponse.json({ error: "Actor ID is required for this action." }, { status: 400 });
    }

    if (String(header.status) !== "approved") {
      return NextResponse.json({ error: "Only approved returns can be finalized." }, { status: 400 });
    }

    if (action === "finalize_refund") {
      const actor = await getUserPermissions(actorId);
      if (!actor) {
        return NextResponse.json({ error: "Actor account was not found." }, { status: 404 });
      }

      const canRefund = actor.permissions.has("returns:refund") || actor.permissions.has("returns:manage");
      if (!canRefund) {
        return NextResponse.json({ error: "This user is not allowed to finalize refunds." }, { status: 403 });
      }

      if (actor.restrictions?.require_supervisor_for_refund) {
        return NextResponse.json({ error: "This account requires supervisor approval before finalizing refunds." }, { status: 403 });
      }

      if (actor.restrictions?.max_refund_amount !== null && actor.restrictions?.max_refund_amount !== undefined) {
        if (parseNumber(refundAmount) > actor.restrictions.max_refund_amount) {
          return NextResponse.json({ error: "Refund amount exceeds the user's limit." }, { status: 403 });
        }
      }

      await finalizeSaleItemReturns(items);
      await applyReturnInventory(header, items, actorId);

      const normalizedRefundMethod = refundMethodOptions.includes((refundMethod ?? "cash") as never)
        ? refundMethod
        : "cash";

      if (String(header.customer_id ?? "") && (normalizedRefundMethod === "customer_credit" || parseNumber(storeCredit) > 0)) {
        const nextCredit = normalizedRefundMethod === "customer_credit"
          ? Math.max(parseNumber(refundAmount), parseNumber(storeCredit))
          : parseNumber(storeCredit);

        const customerResult = await supabaseAdmin
          .from("customers")
          .select("store_credit_balance")
          .eq("id", String(header.customer_id))
          .maybeSingle();

        if (customerResult.error) throw customerResult.error;

        const currentCredit = parseNumber((customerResult.data as { store_credit_balance?: number | string | null } | null)?.store_credit_balance);
        const customerUpdate = await supabaseAdmin
          .from("customers")
          .update({ store_credit_balance: currentCredit + nextCredit })
          .eq("id", String(header.customer_id));

        if (customerUpdate.error) throw customerUpdate.error;
      }

      const updateReturn = await supabaseAdmin
        .from("returns")
        .update({
          status: "refunded",
          refund_method: normalizedRefundMethod,
          refund_amount: parseNumber(refundAmount),
          store_credit: normalizedRefundMethod === "customer_credit"
            ? Math.max(parseNumber(refundAmount), parseNumber(storeCredit))
            : parseNumber(storeCredit),
          refund_reference_no: refundReferenceNo?.trim() || null,
          approval_notes: notes?.trim() || (header.approval_notes as string | null),
          refunded_at: now,
          processed_at: now,
        })
        .eq("id", returnId);

      if (updateReturn.error) throw updateReturn.error;

      return NextResponse.json({ success: true, message: "Refund has been finalized." });
    }

    if (action === "finalize_exchange") {
      await finalizeSaleItemReturns(items);
      await applyReturnInventory(header, items, actorId);

      for (const exchangeItem of exchangeItems ?? []) {
        if (!exchangeItem.productId || Number(exchangeItem.quantity) <= 0) continue;

        await applyInventoryMovement({
          productId: exchangeItem.productId,
          branchId: String(header.branch_id),
          movementType: "return_out",
          quantityDelta: -Math.abs(Number(exchangeItem.quantity)),
          referenceType: "return_exchange",
          referenceId: returnId,
          createdBy: actorId,
          notes: exchangeItem.notes?.trim() || `Exchange issued for ${header.return_number}`,
        });
      }

      const updateReturn = await supabaseAdmin
        .from("returns")
        .update({
          status: "exchanged",
          exchange_reference_no: exchangeReferenceNo?.trim() || null,
          exchange_sale_id: exchangeSaleId ?? null,
          exchange_items: exchangeItems ?? [],
          approval_notes: notes?.trim() || (header.approval_notes as string | null),
          exchanged_at: now,
          processed_at: now,
        })
        .eq("id", returnId);

      if (updateReturn.error) throw updateReturn.error;

      return NextResponse.json({ success: true, message: "Exchange has been finalized." });
    }

    if (action === "finalize_warranty") {
      const createdClaimIds: string[] = [];

      for (const item of items) {
        const claimResult = await supabaseAdmin
          .from("warranty_claims")
          .insert({
            claim_number: buildClaimNumber(),
            return_id: returnId,
            branch_id: header.branch_id,
            sale_id: header.sale_id,
            sale_item_id: item.sale_item_id,
            return_item_id: item.id,
            warranty_record_id: item.warranty_record_id,
            product_id: item.product_id,
            customer_id: header.customer_id,
            claim_date: new Date().toISOString().slice(0, 10),
            expiry_date: null,
            status: "pending",
            description: notes?.trim() || header.reason || "Warranty claim created from return workflow.",
            received_condition: item.condition,
            created_by: actorId,
            updated_by: actorId,
            processed_at: now,
          })
          .select("id")
          .single();

        if (claimResult.error) throw claimResult.error;
        createdClaimIds.push(claimResult.data.id);

        const returnItemUpdate = await supabaseAdmin
          .from("return_items")
          .update({ warranty_claim_id: claimResult.data.id })
          .eq("id", String(item.id));

        if (returnItemUpdate.error) throw returnItemUpdate.error;
      }

      const updateReturn = await supabaseAdmin
        .from("returns")
        .update({
          status: "warranty_processing",
          approval_notes: notes?.trim() || (header.approval_notes as string | null),
          warranty_started_at: now,
          processed_at: now,
        })
        .eq("id", returnId);

      if (updateReturn.error) throw updateReturn.error;

      return NextResponse.json({
        success: true,
        claimIds: createdClaimIds,
        message: "Warranty claim tracking has started.",
      });
    }

    return NextResponse.json({ error: "Unsupported return action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[returns:update]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

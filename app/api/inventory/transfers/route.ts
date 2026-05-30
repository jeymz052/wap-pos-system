import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSubscriptionFeature } from "@/lib/subscriptions";

type TransferBody = {
  productId?: string;
  fromBranchId?: string;
  toBranchId?: string;
  quantity?: number;
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:transfer_stock", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to transfer stock." }, { status: 403 });
    }

    if (!(await requireSubscriptionFeature("multi_branch_transfers"))) {
      return NextResponse.json({ error: "Multi-branch transfers are not enabled on the current subscription plan." }, { status: 403 });
    }

    const body = (await request.json()) as TransferBody;
    const productId = body.productId?.trim() ?? "";
    const fromBranchId = body.fromBranchId?.trim() ?? "";
    const toBranchId = body.toBranchId?.trim() ?? "";
    const quantity = Math.max(0, Number(body.quantity ?? 0));

    if (!productId || !fromBranchId || !toBranchId) {
      return NextResponse.json({ error: "Product and both branches are required." }, { status: 400 });
    }

    if (fromBranchId === toBranchId) {
      return NextResponse.json({ error: "Choose a different destination branch." }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Transfer quantity must be greater than zero." }, { status: 400 });
    }

    const transferResult = await supabaseAdmin
      .from("stock_transfers")
      .insert({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        status: "received",
        notes: body.notes?.trim() || null,
        created_by: user.profileId,
        approved_by: user.profileId,
        received_by: user.profileId,
      })
      .select("id")
      .single();

    if (transferResult.error || !transferResult.data?.id) {
      throw transferResult.error ?? new Error("Unable to create stock transfer.");
    }

    const transferId = transferResult.data.id as string;

    const itemResult = await supabaseAdmin.from("stock_transfer_items").insert({
      stock_transfer_id: transferId,
      product_id: productId,
      quantity,
      notes: body.notes?.trim() || null,
    });

    if (itemResult.error) {
      throw itemResult.error;
    }

    await applyInventoryMovement({
      productId,
      branchId: fromBranchId,
      movementType: "transfer_out",
      quantityDelta: -quantity,
      referenceType: "stock_transfer",
      referenceId: transferId,
      createdBy: user.profileId,
      notes: body.notes?.trim() || null,
    });

    await applyInventoryMovement({
      productId,
      branchId: toBranchId,
      movementType: "transfer_in",
      quantityDelta: quantity,
      referenceType: "stock_transfer",
      referenceId: transferId,
      createdBy: user.profileId,
      notes: body.notes?.trim() || null,
    });

    return NextResponse.json({ success: true, transferId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[inventory-transfers]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

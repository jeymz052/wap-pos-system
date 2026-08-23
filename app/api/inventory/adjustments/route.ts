import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement, getInventoryStock } from "@/lib/inventory-admin";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AdjustmentBody = {
  productId?: string;
  branchId?: string;
  quantity?: number;
  mode?: "delta" | "set";
  reasonType?: "adjustment" | "damage" | "return_in" | "return_out";
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:adjust_stock", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to adjust stock." }, { status: 403 });
    }

    const body = (await request.json()) as AdjustmentBody;
    const productId = body.productId?.trim() ?? "";
    const branchId = body.branchId?.trim() ?? "";
    const mode = body.mode ?? "delta";
    const reasonType = body.reasonType ?? "adjustment";
    const quantity = Number(body.quantity ?? 0);

    if (!productId || !branchId) {
      return NextResponse.json({ error: "Product and branch are required." }, { status: 400 });
    }

    if (!Number.isFinite(quantity)) {
      return NextResponse.json({ error: "Quantity must be a valid number." }, { status: 400 });
    }

    const stockRow = await getInventoryStock(productId, branchId);
    const quantityBefore = stockRow?.quantity ?? 0;
    const quantityAfter = mode === "set" ? Math.max(0, quantity) : Math.max(0, quantityBefore + quantity);

    const adjustmentResult = await supabaseAdmin
      .from("stock_adjustments")
      .insert({
        branch_id: branchId,
        reason: reasonType,
        notes: body.notes?.trim() || null,
        status: "approved",
        approved_by: user.profileId,
        created_by: user.profileId,
      })
      .select("id")
      .single();

    if (adjustmentResult.error || !adjustmentResult.data?.id) {
      throw adjustmentResult.error ?? new Error("Unable to create stock adjustment.");
    }

    const adjustmentId = adjustmentResult.data.id as string;

    const itemResult = await supabaseAdmin.from("stock_adjustment_items").insert({
      stock_adjustment_id: adjustmentId,
      product_id: productId,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      notes: body.notes?.trim() || null,
    });

    if (itemResult.error) {
      throw itemResult.error;
    }

    await applyInventoryMovement({
      productId,
      branchId,
      movementType:
        reasonType === "damage"
          ? "damage"
          : reasonType === "return_in"
            ? "return_in"
            : reasonType === "return_out"
              ? "return_out"
              : "adjustment",
      quantityAfter,
      referenceType: "stock_adjustment",
      referenceId: adjustmentId,
      createdBy: user.profileId,
      notes: body.notes?.trim() || null,
    });

    return NextResponse.json({
      success: true,
      adjustmentId,
      quantityBefore,
      quantityAfter,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[inventory-adjustments]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

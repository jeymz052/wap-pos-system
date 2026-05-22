import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement, getInventoryStock } from "@/lib/inventory-admin";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type StockCountBody = {
  productId?: string;
  branchId?: string;
  countedQuantity?: number;
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:adjust_stock", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to run stock audits." }, { status: 403 });
    }

    const body = (await request.json()) as StockCountBody;
    const productId = body.productId?.trim() ?? "";
    const branchId = body.branchId?.trim() ?? "";
    const countedQuantity = Math.max(0, Number(body.countedQuantity ?? 0));

    if (!productId || !branchId) {
      return NextResponse.json({ error: "Product and branch are required." }, { status: 400 });
    }

    if (!Number.isFinite(countedQuantity)) {
      return NextResponse.json({ error: "Counted quantity must be a valid number." }, { status: 400 });
    }

    const stockRow = await getInventoryStock(productId, branchId);
    const systemQuantity = stockRow?.quantity ?? 0;

    const countResult = await supabaseAdmin
      .from("stock_counts")
      .insert({
        branch_id: branchId,
        status: "posted",
        notes: body.notes?.trim() || null,
        counted_by: user.profileId,
        approved_by: user.profileId,
        counted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (countResult.error || !countResult.data?.id) {
      throw countResult.error ?? new Error("Unable to create stock count.");
    }

    const stockCountId = countResult.data.id as string;

    const itemResult = await supabaseAdmin.from("stock_count_items").insert({
      stock_count_id: stockCountId,
      product_id: productId,
      system_quantity: systemQuantity,
      counted_quantity: countedQuantity,
      notes: body.notes?.trim() || null,
    });

    if (itemResult.error) {
      throw itemResult.error;
    }

    await applyInventoryMovement({
      productId,
      branchId,
      movementType: "adjustment",
      quantityAfter: countedQuantity,
      referenceType: "stock_count",
      referenceId: stockCountId,
      createdBy: user.profileId,
      notes: body.notes?.trim() || "Stock count audit posted.",
    });

    return NextResponse.json({
      success: true,
      stockCountId,
      systemQuantity,
      countedQuantity,
      variance: countedQuantity - systemQuantity,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[inventory-stock-counts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

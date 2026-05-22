import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { saleId, branchId, cashierId, customerId, items, refundMethod, refundAmount, reason, notes } = body;

    if (!branchId || !cashierId || !items?.length || !reason) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const now = new Date();
    const returnNumber = `RET-${now.getTime()}`;

    // 1. Create return header
    const { data: ret, error: retErr } = await supabaseAdmin
      .from("returns")
      .insert({
        return_number: returnNumber,
        sale_id: saleId || null,
        customer_id: customerId || null,
        branch_id: branchId,
        status: "approved",
        reason,
        refund_method: refundMethod || "cash",
        refund_amount: refundAmount ?? 0,
        store_credit: 0,
        notes: notes || null,
        requested_by: cashierId,
        approved_by: cashierId,
        processed_at: now.toISOString(),
      })
      .select("id")
      .single();

    if (retErr) throw retErr;

    // 2. Create return items + restock
    for (const item of items as {
      productId: string;
      saleItemId?: string;
      quantity: number;
      unitPrice: number;
      condition: string;
      restock: boolean;
    }[]) {
      await supabaseAdmin.from("return_items").insert({
        return_id: ret.id,
        product_id: item.productId,
        sale_item_id: item.saleItemId || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        condition: item.condition || "good",
        restock: item.restock !== false,
      });

      // Restock if applicable
      if (item.restock !== false) {
        await applyInventoryMovement({
          productId: item.productId,
          branchId,
          movementType: "return_in",
          quantityDelta: item.quantity,
          referenceType: "return",
          referenceId: ret.id,
          createdBy: cashierId,
          notes: `Return: ${reason}`,
        });
      }
    }

    return NextResponse.json({ success: true, returnId: ret.id, returnNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[return-sale]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

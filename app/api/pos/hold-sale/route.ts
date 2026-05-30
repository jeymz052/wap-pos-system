import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "pos:create", "pos:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { branchId, cashierId, customerId, items, subtotal, discountAmount, taxAmount, totalAmount, notes } = body;

    if (!branchId || !cashierId || !items?.length) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (user.profileId !== cashierId && !hasAnyPermission(user, "pos:manage")) {
      return NextResponse.json({ error: "You cannot hold orders for another cashier." }, { status: 403 });
    }

    const now = new Date();
    const invoiceNumber = `HLD-${now.getTime()}`;

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        invoice_number: invoiceNumber,
        branch_id: branchId,
        cashier_id: cashierId,
        customer_id: customerId || null,
        status: "held",
        subtotal: subtotal ?? 0,
        discount_amount: discountAmount ?? 0,
        tax_amount: taxAmount ?? 0,
        total_amount: totalAmount ?? 0,
        amount_paid: 0,
        change_amount: 0,
        notes: notes || null,
      })
      .select("id, invoice_number")
      .single();

    if (saleError) throw saleError;

    const saleItemsPayload = items.map((item: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discountType?: string;
      discountValue?: number;
      discountAmount?: number;
      totalPrice: number;
    }) => ({
      sale_id: sale.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_type: item.discountType || null,
      discount_value: item.discountValue ?? 0,
      discount_amount: item.discountAmount ?? 0,
      total_price: item.totalPrice,
    }));

    const { error: itemsError } = await supabaseAdmin.from("sale_items").insert(saleItemsPayload);
    if (itemsError) throw itemsError;

    return NextResponse.json({ success: true, saleId: sale.id, invoiceNumber: sale.invoice_number });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[hold-sale]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

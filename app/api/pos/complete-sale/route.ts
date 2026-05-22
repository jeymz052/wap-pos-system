import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SaleItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  approvedByUserId?: string;
  totalPrice: number;
  costPrice?: number;
};

async function getCashierPermissions(cashierId: string) {
  const { data: cashier, error: cashierError } = await supabaseAdmin
    .from("users")
    .select("role_id")
    .eq("id", cashierId)
    .maybeSingle();

  if (cashierError) throw cashierError;
  const roleId = (cashier as { role_id?: string | null } | null)?.role_id;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      branchId,
      cashierId,
      shiftId,
      customerId,
      items,
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      taxRate,
      taxAmount,
      totalAmount,
      payments,
      amountPaid,
      changeAmount,
      notes,
    } = body;

    if (!branchId || !cashierId || !items?.length || !payments?.length) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const itemInputs = items as SaleItemInput[];
    const permissions = await getCashierPermissions(cashierId);
    const canApplyDiscount = permissions.has("pos:apply_discount") || permissions.has("pos:manage");
    const canOverridePrice = permissions.has("pos:edit") || permissions.has("pos:manage");

    const hasOrderDiscount = Number(discountAmount ?? 0) > 0;
    const itemDiscountApproverIds = Array.from(new Set(itemInputs
      .filter((item) => Number(item.discountAmount ?? 0) > 0)
      .map((item) => item.approvedByUserId)
      .filter(Boolean))) as string[];
    const hasItemDiscount = itemInputs.some((item) => Number(item.discountAmount ?? 0) > 0);

    if ((hasOrderDiscount || hasItemDiscount) && !canApplyDiscount) {
      const approverHasDiscountPermission = await Promise.all(itemDiscountApproverIds.map((userId) => getCashierPermissions(userId)))
        .then((sets) => sets.some((set) => set.has("pos:apply_discount") || set.has("pos:manage")));
      if (hasOrderDiscount || !approverHasDiscountPermission) {
        return NextResponse.json({ error: "Cashier is not allowed to apply POS discounts." }, { status: 403 });
      }
    }

    const { data: productRows, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, selling_price")
      .in("id", itemInputs.map((item) => item.productId));

    if (productError) throw productError;

    const priceMap = new Map(
      ((productRows ?? []) as Array<{ id: string; selling_price: number | string | null }>).map((product) => [
        product.id,
        Number(product.selling_price ?? 0),
      ])
    );

    const priceOverrideApproverIds = Array.from(new Set(itemInputs
      .filter((item) => {
        const currentPrice = priceMap.get(item.productId) ?? 0;
        return Math.abs(Number(item.unitPrice) - currentPrice) > 0.009;
      })
      .map((item) => item.approvedByUserId)
      .filter(Boolean))) as string[];

    const hasPriceOverride = itemInputs.some((item) => {
      const currentPrice = priceMap.get(item.productId) ?? 0;
      return Math.abs(Number(item.unitPrice) - currentPrice) > 0.009;
    });

    if (hasPriceOverride && !canOverridePrice) {
      const approverHasEditPermission = await Promise.all(priceOverrideApproverIds.map((userId) => getCashierPermissions(userId)))
        .then((sets) => sets.some((set) => set.has("pos:edit") || set.has("pos:manage")));
      if (!approverHasEditPermission) {
        return NextResponse.json({ error: "Cashier is not allowed to override item prices." }, { status: 403 });
      }
    }

    // Generate unique invoice number
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.getTime().toString().slice(-6);
    const invoiceNumber = `INV-${datePart}-${timePart}`;

    // 1. Create the sale record
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        invoice_number: invoiceNumber,
        branch_id: branchId,
        cashier_id: cashierId,
        shift_id: shiftId || null,
        customer_id: customerId || null,
        status: "completed",
        subtotal: subtotal ?? 0,
        discount_type: discountType || null,
        discount_value: discountValue ?? 0,
        discount_amount: discountAmount ?? 0,
        tax_rate: taxRate ?? 12,
        tax_amount: taxAmount ?? 0,
        total_amount: totalAmount ?? 0,
        amount_paid: amountPaid ?? 0,
        change_amount: changeAmount ?? 0,
        notes: notes || null,
      })
      .select("id, invoice_number")
      .single();

    if (saleError) throw saleError;

    // 2. Create sale items
    const saleItemsPayload = itemInputs.map((item) => ({
      sale_id: sale.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_type: item.discountType || null,
      discount_value: item.discountValue ?? 0,
      discount_amount: item.discountAmount ?? 0,
      total_price: item.totalPrice,
      cost_price: item.costPrice ?? null,
    }));

    const { error: itemsError } = await supabaseAdmin.from("sale_items").insert(saleItemsPayload);
    if (itemsError) throw itemsError;

    // 3. Create payment records
    const salePaymentsPayload = payments.map((p: { method: string; amount: number; referenceNo?: string }) => ({
      sale_id: sale.id,
      payment_method: p.method,
      amount: p.amount,
      reference_no: p.referenceNo || null,
    }));

    const { error: paymentsError } = await supabaseAdmin.from("sale_payments").insert(salePaymentsPayload);
    if (paymentsError) throw paymentsError;

    // 4. Update inventory stocks + create stock movements
    for (const item of items as { productId: string; quantity: number }[]) {
      await applyInventoryMovement({
        productId: item.productId,
        branchId,
        movementType: "sale",
        quantityDelta: -item.quantity,
        referenceType: "sale",
        referenceId: sale.id,
        createdBy: cashierId,
        notes: `POS sale ${sale.invoice_number}`,
      });
    }

    // 5. Update shift totals
    if (shiftId) {
      const cashAmount = (payments as { method: string; amount: number }[])
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + p.amount, 0);
      const nonCashAmount = (payments as { method: string; amount: number }[])
        .filter((p) => p.method !== "cash")
        .reduce((sum, p) => sum + p.amount, 0);

      const { data: shiftRow } = await supabaseAdmin
        .from("cash_shifts")
        .select("total_cash_sales, total_noncash, expected_cash")
        .eq("id", shiftId)
        .single();

      if (shiftRow) {
        const s = shiftRow as { total_cash_sales: number; total_noncash: number; expected_cash: number };
        await supabaseAdmin.from("cash_shifts").update({
          total_cash_sales: (s.total_cash_sales || 0) + cashAmount,
          total_noncash: (s.total_noncash || 0) + nonCashAmount,
          expected_cash: (s.expected_cash || 0) + cashAmount,
        }).eq("id", shiftId);
      }
    }

    // 6. If customer_credit payment and customer present, create a receivable
    const creditPayment = (payments as { method: string; amount: number }[]).find(
      (p) => p.method === "customer_credit"
    );
    if (creditPayment && customerId) {
      const recNow = new Date();
      const recInvoice = `REC-${recNow.getTime()}`;
      const dueDate = new Date(recNow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await supabaseAdmin.from("receivables").insert({
        invoice_number: recInvoice,
        customer_id: customerId,
        sale_id: sale.id,
        branch_id: branchId,
        total_amount: creditPayment.amount,
        paid_amount: 0,
        due_date: dueDate,
        status: "unpaid",
      });
    }

    return NextResponse.json({ success: true, saleId: sale.id, invoiceNumber: sale.invoice_number });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[complete-sale]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

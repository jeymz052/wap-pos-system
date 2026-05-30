import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { notifyUnusualDiscount } from "@/lib/notifications";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByProfileId } from "@/lib/user-access";

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

type PaymentInput = {
  method: string;
  amount: number;
  referenceNo?: string;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getCashierPermissions(cashierId: string) {
  const accessProfile = await getAccessProfileByProfileId(cashierId);
  return accessProfile?.permissions ?? new Set<string>();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "pos:create", "pos:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

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

    if (user.profileId !== cashierId && !hasAnyPermission(user, "pos:manage")) {
      return NextResponse.json({ error: "You cannot complete sales for another cashier." }, { status: 403 });
    }

    if (!shiftId) {
      return NextResponse.json({ error: "An open shift is required before processing sales." }, { status: 400 });
    }

    const shiftCheckResult = await supabaseAdmin
      .from("cash_shifts")
      .select("id, branch_id, cashier_id, status")
      .eq("id", shiftId)
      .maybeSingle();

    if (shiftCheckResult.error) throw shiftCheckResult.error;
    if (!shiftCheckResult.data) {
      return NextResponse.json({ error: "The selected shift was not found." }, { status: 404 });
    }

    const shift = shiftCheckResult.data as { id: string; branch_id: string; cashier_id: string; status: string };
    if (shift.status !== "open") {
      return NextResponse.json({ error: "Sales can only be processed on an open shift." }, { status: 400 });
    }

    if (shift.branch_id !== branchId || shift.cashier_id !== cashierId) {
      return NextResponse.json({ error: "The active shift does not belong to this branch or cashier." }, { status: 400 });
    }

    const itemInputs = items as SaleItemInput[];
    const paymentInputs = payments as PaymentInput[];
    const cashierAccess = await getAccessProfileByProfileId(cashierId);
    const permissions = cashierAccess?.permissions ?? new Set<string>();
    const restrictions = cashierAccess?.salesRestrictions ?? null;
    const canApplyDiscount = permissions.has("pos:apply_discount") || permissions.has("pos:manage");
    const canOverridePrice =
      permissions.has("pos:edit") ||
      permissions.has("pos:manage") ||
      restrictions?.allow_price_override === true;

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

    if ((hasOrderDiscount || hasItemDiscount) && restrictions?.require_supervisor_for_discount) {
      if (!itemDiscountApproverIds.length) {
        return NextResponse.json({ error: "Supervisor approval is required for discounts on this cashier account." }, { status: 403 });
      }
    }

    if (hasOrderDiscount && restrictions?.discount_limit_amount !== null && restrictions?.discount_limit_amount !== undefined) {
      if (parseNumber(discountAmount) > restrictions.discount_limit_amount) {
        return NextResponse.json({ error: "Discount amount exceeds the cashier limit." }, { status: 403 });
      }
    }

    if (hasOrderDiscount && restrictions?.discount_limit_percent !== null && restrictions?.discount_limit_percent !== undefined) {
      const requestedPercent = subtotal > 0 ? (parseNumber(discountAmount) / subtotal) * 100 : 0;
      if (requestedPercent > restrictions.discount_limit_percent) {
        return NextResponse.json({ error: "Discount percentage exceeds the cashier limit." }, { status: 403 });
      }
    }

    const { data: productRows, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, selling_price")
      .in("id", itemInputs.map((item) => item.productId));

    if (productError) throw productError;

    const { data: branchPriceRows, error: branchPriceError } = await supabaseAdmin
      .from("branch_product_prices")
      .select("product_id, price")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .in("product_id", itemInputs.map((item) => item.productId));

    if (branchPriceError) throw branchPriceError;

    const branchPriceMap = new Map(
      ((branchPriceRows ?? []) as Array<{ product_id: string; price: number | string | null }>).map((row) => [
        row.product_id,
        Number(row.price ?? 0),
      ]),
    );

    const priceMap = new Map(
      ((productRows ?? []) as Array<{ id: string; selling_price: number | string | null }>).map((product) => [
        product.id,
        branchPriceMap.get(product.id) ?? Number(product.selling_price ?? 0),
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

    const creditAmount = paymentInputs
      .filter((payment) => payment.method === "customer_credit")
      .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);

    let customerCreditTermsDays = 30;

    if (creditAmount > 0) {
      if (!customerId) {
        return NextResponse.json({ error: "Customer credit requires a registered customer." }, { status: 400 });
      }

      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .select("id, name, allow_credit, credit_limit, current_balance, default_credit_terms_days")
        .eq("id", customerId)
        .maybeSingle();

      if (customerError) throw customerError;
      if (!customer) {
        return NextResponse.json({ error: "Selected customer was not found." }, { status: 404 });
      }

      const allowCredit = (customer as { allow_credit?: boolean | null }).allow_credit ?? true;
      if (!allowCredit) {
        return NextResponse.json({ error: "This customer is not allowed to purchase on credit." }, { status: 400 });
      }

      const creditLimit = parseNumber((customer as { credit_limit?: number | string | null }).credit_limit);
      const currentBalance = parseNumber((customer as { current_balance?: number | string | null }).current_balance);
      const availableCredit = Math.max(0, creditLimit - currentBalance);

      if (creditAmount > availableCredit) {
        return NextResponse.json({
          error: `Credit limit exceeded. Available credit is ${availableCredit.toFixed(2)}.`,
        }, { status: 400 });
      }

      customerCreditTermsDays = Math.max(
        1,
        Number((customer as { default_credit_terms_days?: number | null }).default_credit_terms_days ?? 30)
      );
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
    const salePaymentsPayload = paymentInputs.map((p) => ({
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
      const cashAmount = paymentInputs
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + p.amount, 0);
      const nonCashAmount = paymentInputs
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
    if (creditAmount > 0 && customerId) {
      const recNow = new Date();
      const dueDate = new Date(
        recNow.getTime() + customerCreditTermsDays * 24 * 60 * 60 * 1000
      ).toISOString().slice(0, 10);
      await supabaseAdmin.from("receivables").insert({
        invoice_number: `${sale.invoice_number}-CR`,
        customer_id: customerId,
        sale_id: sale.id,
        branch_id: branchId,
        total_amount: creditAmount,
        paid_amount: 0,
        due_date: dueDate,
        status: "unpaid",
        notes: notes || `Credit balance from POS sale ${sale.invoice_number}`,
      });
    }

    const itemDiscountAmount = itemInputs.reduce(
      (sum, item) => sum + parseNumber(item.discountAmount),
      0,
    );

    await notifyUnusualDiscount({
      saleId: sale.id,
      branchId,
      cashierId,
      invoiceNumber: sale.invoice_number,
      subtotal: parseNumber(subtotal),
      orderDiscountAmount: parseNumber(discountAmount),
      itemDiscountAmount,
    });

    return NextResponse.json({ success: true, saleId: sale.id, invoiceNumber: sale.invoice_number });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[complete-sale]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

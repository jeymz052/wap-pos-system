import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "pos:view", "pos:create", "pos:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const saleId = new URL(request.url).searchParams.get("saleId");
    if (!saleId) {
      return NextResponse.json({ error: "saleId is required." }, { status: 400 });
    }

    const [saleResult, itemResult, paymentResult] = await Promise.all([
      supabaseAdmin
        .from("sales")
        .select(`
          id,
          invoice_number,
          branch_id,
          cashier_id,
          customer_id,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          amount_paid,
          change_amount,
          created_at,
          branch:branches(name),
          customer:customers(name, email, phone),
          cashier:users(first_name, last_name, username, email)
        `)
        .eq("id", saleId)
        .eq("status", "completed")
        .maybeSingle(),
      supabaseAdmin
        .from("sale_items")
        .select(`
          sale_id,
          quantity,
          unit_price,
          discount_amount,
          total_price,
          product:products(name, sku)
        `)
        .eq("sale_id", saleId),
      supabaseAdmin
        .from("sale_payments")
        .select("sale_id, payment_method, amount, reference_no")
        .eq("sale_id", saleId),
    ]);

    if (saleResult.error) throw saleResult.error;
    if (itemResult.error) throw itemResult.error;
    if (paymentResult.error) throw paymentResult.error;
    if (!saleResult.data) {
      return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    }

    const sale = saleResult.data as {
      id: string;
      invoice_number: string;
      created_at?: string | null;
      subtotal?: number | string | null;
      discount_amount?: number | string | null;
      tax_amount?: number | string | null;
      total_amount?: number | string | null;
      amount_paid?: number | string | null;
      change_amount?: number | string | null;
      branch?: { name?: string | null } | null;
      customer?: { name?: string | null; email?: string | null; phone?: string | null } | null;
      cashier?: { first_name?: string | null; last_name?: string | null; username?: string | null; email?: string | null } | null;
    };

    const cashierFullName = [sale.cashier?.first_name, sale.cashier?.last_name].filter(Boolean).join(" ").trim()
      || sale.cashier?.username
      || sale.cashier?.email
      || "Cashier";

    return NextResponse.json({
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      issuedAt: sale.created_at ?? new Date().toISOString(),
      branchName: sale.branch?.name ?? "Branch",
      cashierName: cashierFullName,
      customerName: sale.customer?.name ?? "Walk-in Customer",
      customerEmail: sale.customer?.email ?? null,
      customerPhone: sale.customer?.phone ?? null,
      items: ((itemResult.data ?? []) as Array<{
        quantity?: number | string | null;
        unit_price?: number | string | null;
        discount_amount?: number | string | null;
        total_price?: number | string | null;
        product?: { name?: string | null; sku?: string | null } | null;
      }>).map((item) => ({
        name: item.product?.name ?? "Unknown Item",
        sku: item.product?.sku ?? "",
        quantity: parseNumber(item.quantity),
        unitPrice: parseNumber(item.unit_price),
        discountAmount: parseNumber(item.discount_amount),
        totalPrice: parseNumber(item.total_price),
      })),
      subtotal: parseNumber(sale.subtotal),
      discountAmount: parseNumber(sale.discount_amount),
      taxAmount: parseNumber(sale.tax_amount),
      total: parseNumber(sale.total_amount),
      amountPaid: parseNumber(sale.amount_paid),
      changeAmount: parseNumber(sale.change_amount),
      payments: ((paymentResult.data ?? []) as Array<{
        payment_method: string;
        amount?: number | string | null;
        reference_no?: string | null;
      }>).map((payment) => ({
        method: payment.payment_method,
        amount: parseNumber(payment.amount),
        referenceNo: payment.reference_no ?? "",
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pos.receipt]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

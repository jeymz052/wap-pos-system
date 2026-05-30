import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || !hasAnyPermission(user, "receivables:edit", "receivables:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const {
      receivableId,
      amount,
      paymentMethod,
      referenceNo,
      notes,
    } = body as {
      receivableId?: string;
      amount?: number | string;
      paymentMethod?: string;
      referenceNo?: string;
      notes?: string;
    };

    if (!receivableId || !paymentMethod) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const numericAmount = parseNumber(amount);
    if (numericAmount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
    }

    const { data: receivable, error: receivableError } = await supabaseAdmin
      .from("receivables")
      .select("id, invoice_number, total_amount, paid_amount, balance")
      .eq("id", receivableId)
      .maybeSingle();

    if (receivableError) throw receivableError;
    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found." }, { status: 404 });
    }

    const remainingBalance = parseNumber((receivable as { balance?: number | string | null }).balance);
    if (numericAmount > remainingBalance) {
      return NextResponse.json({ error: "Payment amount cannot exceed the remaining balance." }, { status: 400 });
    }

    const { error: paymentError } = await supabaseAdmin.from("receivable_payments").insert({
      receivable_id: receivableId,
      amount: numericAmount,
      payment_method: paymentMethod,
      reference_no: referenceNo?.trim() || null,
      received_by: user.profileId,
      notes: notes?.trim() || null,
    });

    if (paymentError) throw paymentError;

    const { data: updatedReceivable, error: updatedReceivableError } = await supabaseAdmin
      .from("receivables")
      .select("id, invoice_number, total_amount, paid_amount, balance, status, due_date, customer_id, updated_at")
      .eq("id", receivableId)
      .single();

    if (updatedReceivableError) throw updatedReceivableError;

    return NextResponse.json({
      success: true,
      receivable: updatedReceivable,
      message: `Payment recorded for ${(updatedReceivable as { invoice_number: string }).invoice_number}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[receivables/receive-payment]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

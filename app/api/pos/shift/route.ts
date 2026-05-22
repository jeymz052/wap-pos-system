import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/pos/shift  — open or close a shift
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, branchId, cashierId, startingCash, shiftId, actualCash, notes } = body;

    if (action === "open") {
      if (!branchId || !cashierId) {
        return NextResponse.json({ error: "Missing branchId or cashierId." }, { status: 400 });
      }

      // Check for existing open shift
      const { data: existing } = await supabaseAdmin
        .from("cash_shifts")
        .select("id")
        .eq("branch_id", branchId)
        .eq("cashier_id", cashierId)
        .eq("status", "open")
        .limit(1);

      if ((existing as { id: string }[] | null)?.length) {
        return NextResponse.json({ error: "An open shift already exists for this cashier." }, { status: 409 });
      }

      const { data: shift, error: shiftErr } = await supabaseAdmin
        .from("cash_shifts")
        .insert({
          branch_id: branchId,
          cashier_id: cashierId,
          status: "open",
          starting_cash: startingCash ?? 0,
          expected_cash: startingCash ?? 0,
          total_cash_sales: 0,
          total_noncash: 0,
          opened_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (shiftErr) throw shiftErr;

      return NextResponse.json({ success: true, shiftId: (shift as { id: string }).id });
    }

    if (action === "close") {
      if (!shiftId || !cashierId) {
        return NextResponse.json({ error: "Missing shiftId or cashierId." }, { status: 400 });
      }

      const { data: shiftRow } = await supabaseAdmin
        .from("cash_shifts")
        .select("expected_cash")
        .eq("id", shiftId)
        .single();

      const expectedCash = (shiftRow as { expected_cash: number } | null)?.expected_cash ?? 0;
      const actual = actualCash ?? 0;
      const difference = actual - expectedCash;

      const { error: closeErr } = await supabaseAdmin
        .from("cash_shifts")
        .update({
          status: "closed",
          actual_cash: actual,
          cash_difference: difference,
          notes: notes || null,
          closed_at: new Date().toISOString(),
        })
        .eq("id", shiftId);

      if (closeErr) throw closeErr;

      return NextResponse.json({ success: true, expectedCash, actualCash: actual, difference });
    }

    return NextResponse.json({ error: "Invalid action. Use open or close." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[shift]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement } from "@/lib/inventory-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByProfileId } from "@/lib/user-access";

async function getUserPermissions(userId: string) {
  const accessProfile = await getAccessProfileByProfileId(userId);
  return {
    permissions: accessProfile?.permissions ?? new Set<string>(),
    restrictions: accessProfile?.salesRestrictions ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { saleId, cashierId, voidReason, approverUserId } = body;

    if (!saleId || !cashierId || !voidReason) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const cashierAccess = await getUserPermissions(cashierId);
    const cashierCanVoid = cashierAccess.permissions.has("pos:void") || cashierAccess.permissions.has("pos:manage");
    if (!cashierCanVoid) {
      if (!approverUserId) {
        return NextResponse.json({ error: "Supervisor approval is required to void this sale." }, { status: 403 });
      }
      const approverPermissions = await getUserPermissions(approverUserId);
      const approverCanVoid = approverPermissions.permissions.has("pos:void") || approverPermissions.permissions.has("pos:manage");
      if (!approverCanVoid) {
        return NextResponse.json({ error: "Approver is not allowed to void POS transactions." }, { status: 403 });
      }
    }

    if (cashierAccess.restrictions?.require_supervisor_for_void && !approverUserId) {
      return NextResponse.json({ error: "This cashier requires supervisor approval before voiding a sale." }, { status: 403 });
    }

    // Fetch existing sale to confirm it is completable
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("id, status, branch_id")
      .eq("id", saleId)
      .single();

    if (saleErr || !sale) {
      return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    }

    const s = sale as { id: string; status: string; branch_id: string };

    if (s.status === "voided") {
      return NextResponse.json({ error: "Sale is already voided." }, { status: 400 });
    }

    // Fetch sale items to reverse inventory
    const { data: saleItems, error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", saleId);

    if (itemsErr) throw itemsErr;

    // Void the sale
    const { error: voidErr } = await supabaseAdmin
      .from("sales")
      .update({
        status: "voided",
        voided_by: cashierId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId);

    if (voidErr) throw voidErr;

    // Reverse inventory only if sale was completed (not held)
    if (s.status === "completed" && saleItems?.length) {
      for (const item of saleItems as { product_id: string; quantity: number }[]) {
        await applyInventoryMovement({
          productId: item.product_id,
          branchId: s.branch_id,
          movementType: "return_in",
          quantityDelta: item.quantity,
          referenceType: "void",
          referenceId: saleId,
          createdBy: cashierId,
          notes: `Void: ${voidReason}`,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[void-sale]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

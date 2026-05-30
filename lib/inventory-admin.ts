import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncStockAlertForLevel } from "@/lib/notifications";

type MovementType =
  | "sale"
  | "purchase"
  | "adjustment"
  | "transfer_in"
  | "transfer_out"
  | "return_in"
  | "return_out"
  | "damage"
  | "initial";

type ApplyMovementInput = {
  productId: string;
  branchId: string;
  movementType: MovementType;
  quantityDelta?: number;
  quantityAfter?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  allowNegative?: boolean;
};

type StockRow = {
  id: string;
  quantity: number;
};

export async function getInventoryStock(productId: string, branchId: string) {
  const result = await supabaseAdmin
    .from("inventory_stocks")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data as StockRow | null) ?? null;
}

export async function applyInventoryMovement(input: ApplyMovementInput) {
  const currentStock = await getInventoryStock(input.productId, input.branchId);
  const quantityBefore = currentStock?.quantity ?? 0;
  const computedAfter =
    typeof input.quantityAfter === "number"
      ? input.quantityAfter
      : quantityBefore + (input.quantityDelta ?? 0);

  if (!input.allowNegative && computedAfter < 0) {
    throw new Error("Stock movement would result in negative inventory.");
  }

  const quantityAfter = input.allowNegative ? computedAfter : Math.max(0, computedAfter);

  if (currentStock) {
    const updateResult = await supabaseAdmin
      .from("inventory_stocks")
      .update({
        quantity: quantityAfter,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentStock.id);

    if (updateResult.error) {
      throw updateResult.error;
    }
  } else {
    const insertResult = await supabaseAdmin.from("inventory_stocks").insert({
      product_id: input.productId,
      branch_id: input.branchId,
      quantity: quantityAfter,
      updated_at: new Date().toISOString(),
    });

    if (insertResult.error) {
      throw insertResult.error;
    }
  }

  const movementQuantity =
    typeof input.quantityAfter === "number"
      ? quantityAfter - quantityBefore
      : input.quantityDelta ?? 0;

  const movementResult = await supabaseAdmin.from("stock_movements").insert({
    product_id: input.productId,
    branch_id: input.branchId,
    movement_type: input.movementType,
    quantity: movementQuantity,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });

  if (movementResult.error) {
    throw movementResult.error;
  }

  await syncStockAlertForLevel({
    productId: input.productId,
    branchId: input.branchId,
    quantityAfter,
    referenceId: input.referenceId,
  });

  return {
    quantityBefore,
    quantityAfter,
    quantityDelta: movementQuantity,
  };
}

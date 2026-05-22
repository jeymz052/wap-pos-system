import { supabaseAdmin } from "@/lib/supabase-admin";

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

async function syncLowStockNotifications(productId: string, branchId: string, quantityAfter: number, referenceId?: string | null) {
  const productResult = await supabaseAdmin
    .from("products")
    .select("name, reorder_level, critical_stock_level, status")
    .eq("id", productId)
    .maybeSingle();

  if (productResult.error) {
    throw productResult.error;
  }

  const product = productResult.data as {
    name?: string | null;
    reorder_level?: number | null;
    critical_stock_level?: number | null;
    status?: string | null;
  } | null;

  if (!product || product.status !== "active") {
    return;
  }

  const criticalLevel = Number(product.critical_stock_level ?? 0);
  const reorderLevel = Number(product.reorder_level ?? 0);
  let notificationType: "low_stock" | "out_of_stock" | null = null;
  let title = "";
  let message = "";

  if (quantityAfter <= 0) {
    notificationType = "out_of_stock";
    title = "Product out of stock";
    message = `${product.name ?? "Product"} is now out of stock.`;
  } else if (quantityAfter <= Math.max(criticalLevel, reorderLevel)) {
    notificationType = "low_stock";
    title = "Low stock alert";
    message = `${product.name ?? "Product"} is below its reorder level.`;
  }

  if (!notificationType) {
    return;
  }

  const branchUsersResult = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (branchUsersResult.error) {
    throw branchUsersResult.error;
  }

  const userRows = (branchUsersResult.data ?? []) as Array<{ id: string }>;
  if (!userRows.length) {
    return;
  }

  const notificationRows = userRows.map((user) => ({
    user_id: user.id,
    branch_id: branchId,
    notification_type: notificationType,
    title,
    message,
    reference_type: "product",
    reference_id: referenceId ?? productId,
    is_read: false,
  }));

  const notificationResult = await supabaseAdmin.from("notifications").insert(notificationRows);
  if (notificationResult.error) {
    throw notificationResult.error;
  }
}

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

  await syncLowStockNotifications(input.productId, input.branchId, quantityAfter, input.referenceId);

  return {
    quantityBefore,
    quantityAfter,
    quantityDelta: movementQuantity,
  };
}

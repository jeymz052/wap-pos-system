import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement, getInventoryStock } from "@/lib/inventory-admin";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ReceiveEntry = {
  poItemId: string;
  productId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[];
  damagedQuantity?: number;
  returnedQuantity?: number;
  notes?: string;
};

type ReceiveBody = {
  purchaseOrderId?: string;
  branchId?: string;
  supplierInvoice?: string;
  invoiceImageUrl?: string | null;
  notes?: string;
  entries?: ReceiveEntry[];
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:receive_stock", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to receive stock." }, { status: 403 });
    }

    const body = (await request.json()) as ReceiveBody;
    const purchaseOrderId = body.purchaseOrderId?.trim() ?? "";
    const branchId = body.branchId?.trim() ?? "";
    const entries = body.entries ?? [];

    if (!purchaseOrderId || !branchId || !entries.length) {
      return NextResponse.json({ error: "Purchase order, branch, and receiving entries are required." }, { status: 400 });
    }

    const orderItemsResult = await supabaseAdmin
      .from("purchase_order_items")
      .select("id, product_id, quantity, received_qty")
      .eq("po_id", purchaseOrderId)
      .in("id", entries.map((entry) => entry.poItemId));

    if (orderItemsResult.error) {
      throw orderItemsResult.error;
    }

    const orderItems = new Map(
      ((orderItemsResult.data ?? []) as Array<{
        id: string;
        product_id: string;
        quantity: number;
        received_qty: number | null;
      }>).map((item) => [item.id, item])
    );

    for (const entry of entries) {
      const orderItem = orderItems.get(entry.poItemId);
      if (!orderItem) {
        return NextResponse.json({ error: "One or more PO items were not found." }, { status: 404 });
      }

      const quantity = Math.max(0, Number(entry.quantity ?? 0));
      const damagedQuantity = Math.max(0, Number(entry.damagedQuantity ?? 0));
      const returnedQuantity = Math.max(0, Number(entry.returnedQuantity ?? 0));

      if (quantity <= 0) {
        return NextResponse.json({ error: "Received quantity must be greater than zero." }, { status: 400 });
      }

      if (damagedQuantity + returnedQuantity > quantity) {
        return NextResponse.json({ error: "Damaged and returned quantity cannot exceed received quantity." }, { status: 400 });
      }

      const currentReceived = Number(orderItem.received_qty ?? 0);
      if (currentReceived + quantity > orderItem.quantity) {
        return NextResponse.json({ error: "Received quantity cannot exceed ordered quantity." }, { status: 400 });
      }
    }

    for (const entry of entries) {
      const quantity = Math.max(0, Number(entry.quantity ?? 0));
      const damagedQuantity = Math.max(0, Number(entry.damagedQuantity ?? 0));
      const returnedQuantity = Math.max(0, Number(entry.returnedQuantity ?? 0));
      const availableQuantity = quantity - damagedQuantity - returnedQuantity;

      const orderItem = orderItems.get(entry.poItemId)!;
      const updatedReceivedQty = Number(orderItem.received_qty ?? 0) + quantity;

      const itemUpdateResult = await supabaseAdmin
        .from("purchase_order_items")
        .update({ received_qty: updatedReceivedQty })
        .eq("id", entry.poItemId);

      if (itemUpdateResult.error) {
        throw itemUpdateResult.error;
      }

      if (availableQuantity > 0) {
        await applyInventoryMovement({
          productId: entry.productId,
          branchId,
          movementType: "purchase",
          quantityDelta: availableQuantity,
          referenceType: "purchase_order",
          referenceId: purchaseOrderId,
          createdBy: user.profileId,
          notes: entry.notes?.trim() || "Stock received from purchase order.",
        });
      }

      if (damagedQuantity > 0) {
        const currentStock = await getInventoryStock(entry.productId, branchId);
        const quantityBefore = currentStock?.quantity ?? 0;
        await applyInventoryMovement({
          productId: entry.productId,
          branchId,
          movementType: "damage",
          quantityAfter: Math.max(0, quantityBefore - damagedQuantity),
          referenceType: "purchase_damage",
          referenceId: purchaseOrderId,
          createdBy: user.profileId,
          notes: entry.notes?.trim() || "Damaged quantity recorded during receiving.",
        });
      }

      if (returnedQuantity > 0) {
        const currentStock = await getInventoryStock(entry.productId, branchId);
        const quantityBefore = currentStock?.quantity ?? 0;
        await applyInventoryMovement({
          productId: entry.productId,
          branchId,
          movementType: "return_out",
          quantityAfter: Math.max(0, quantityBefore - returnedQuantity),
          referenceType: "supplier_return",
          referenceId: purchaseOrderId,
          createdBy: user.profileId,
          notes: entry.notes?.trim() || "Returned-to-supplier quantity recorded during receiving.",
        });
      }

      if (entry.batchNumber?.trim()) {
        const batchNumber = entry.batchNumber.trim();
        const existingBatchResult = await supabaseAdmin
          .from("inventory_batches")
          .select("id, quantity_received, quantity_on_hand")
          .eq("product_id", entry.productId)
          .eq("branch_id", branchId)
          .eq("batch_number", batchNumber)
          .maybeSingle();

        if (existingBatchResult.error) {
          throw existingBatchResult.error;
        }

        const batch = existingBatchResult.data as {
          id: string;
          quantity_received: number;
          quantity_on_hand: number;
        } | null;

        if (batch) {
          const updateBatchResult = await supabaseAdmin
            .from("inventory_batches")
            .update({
              quantity_received: Number(batch.quantity_received ?? 0) + quantity,
              quantity_on_hand: Number(batch.quantity_on_hand ?? 0) + availableQuantity,
              cost_price: null,
              expiry_date: entry.expiryDate || null,
              reference_type: "purchase_order",
              reference_id: purchaseOrderId,
              notes: entry.notes?.trim() || null,
              created_by: user.profileId,
            })
            .eq("id", batch.id);

          if (updateBatchResult.error) {
            throw updateBatchResult.error;
          }
        } else {
          const insertBatchResult = await supabaseAdmin.from("inventory_batches").insert({
            product_id: entry.productId,
            branch_id: branchId,
            batch_number: batchNumber,
            quantity_received: quantity,
            quantity_on_hand: availableQuantity,
            expiry_date: entry.expiryDate || null,
            reference_type: "purchase_order",
            reference_id: purchaseOrderId,
            notes: entry.notes?.trim() || null,
            created_by: user.profileId,
          });

          if (insertBatchResult.error) {
            throw insertBatchResult.error;
          }
        }
      }

      const serialNumbers = (entry.serialNumbers ?? []).map((serial) => serial.trim()).filter(Boolean);
      if (serialNumbers.length) {
        const serialRows = serialNumbers.map((serial) => ({
          product_id: entry.productId,
          branch_id: branchId,
          serial_number: serial,
          status: "available",
          reference_type: "purchase_order",
          reference_id: purchaseOrderId,
          notes: entry.notes?.trim() || null,
          created_by: user.profileId,
        }));

        const serialResult = await supabaseAdmin
          .from("inventory_serial_numbers")
          .upsert(serialRows, { onConflict: "serial_number" });

        if (serialResult.error) {
          throw serialResult.error;
        }
      }
    }

    const refreshedItemsResult = await supabaseAdmin
      .from("purchase_order_items")
      .select("quantity, received_qty")
      .eq("po_id", purchaseOrderId);

    if (refreshedItemsResult.error) {
      throw refreshedItemsResult.error;
    }

    const refreshedItems = (refreshedItemsResult.data ?? []) as Array<{ quantity: number; received_qty: number | null }>;
    const isFullyReceived = refreshedItems.every((item) => Number(item.received_qty ?? 0) >= item.quantity);
    const nextStatus = isFullyReceived ? "fully_received" : "partially_received";

    const orderUpdateResult = await supabaseAdmin
      .from("purchase_orders")
      .update({
        status: nextStatus,
        received_date: new Date().toISOString().slice(0, 10),
        supplier_invoice: body.supplierInvoice?.trim() || null,
        invoice_image_url: body.invoiceImageUrl ?? null,
        notes: body.notes?.trim() || null,
      })
      .eq("id", purchaseOrderId);

    if (orderUpdateResult.error) {
      throw orderUpdateResult.error;
    }

    return NextResponse.json({ success: true, status: nextStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[inventory-receive-stock]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

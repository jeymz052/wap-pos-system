import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { canAccessBranch } from "@/lib/user-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type InventorySourceRow = {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  updated_at: string;
  branch?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
    part_number?: string | null;
    sku: string;
    barcode?: string | null;
    supplier_code?: string | null;
    unit_type?: string | null;
    cost_price?: string | number | null;
    selling_price?: string | number | null;
    wholesale_price?: string | number | null;
    minimum_price?: string | number | null;
    reorder_level?: number | null;
    critical_stock_level?: number | null;
    shelf_location?: string | null;
    warranty_period_days?: number | null;
    status?: string | null;
    has_serial_tracking?: boolean | null;
    has_batch_tracking?: boolean | null;
    has_expiry_tracking?: boolean | null;
    category?: {
      id: string;
      name: string;
    } | null;
    brand?: {
      id: string;
      name: string;
    } | null;
    supplier?: {
      id: string;
      name: string;
    } | null;
    product_variants?: Array<{
      id?: string;
      variant_name?: string | null;
      variant_value?: string | null;
      sku?: string | null;
      barcode?: string | null;
      additional_cost?: string | number | null;
      additional_price?: string | number | null;
      additional_wholesale_price?: string | number | null;
      minimum_price?: string | number | null;
      product_variant_stocks?: Array<{
        quantity?: number | null;
        branch_id?: string | null;
      }> | null;
    }> | null;
    product_images?: Array<{
      url: string;
      is_primary?: boolean | null;
      sort_order?: number | null;
    }> | null;
    product_compatibility?: Array<{
      notes?: string | null;
      motorcycle_model?: {
        id: string;
        brand: string;
        model_name: string;
        engine_type?: string | null;
        year_from?: number | null;
        year_to?: number | null;
      } | null;
    }> | null;
  } | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:view", "inventory:create", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to view inventory." }, { status: 403 });
    }

    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
    if (!branchId || !isUuid(branchId)) {
      return NextResponse.json({ error: "Choose a valid branch first." }, { status: 400 });
    }

    if (!canAccessBranch(user, branchId)) {
      return NextResponse.json({ error: "You do not have access to this branch." }, { status: 403 });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [inventoryResult, movementResult] = await Promise.all([
      supabaseAdmin
        .from("inventory_stocks")
        .select(`
          id,
          product_id,
          branch_id,
          quantity,
          updated_at,
          branch:branches (
            id,
            name
          ),
          product:products (
            id,
            name,
            part_number,
            sku,
            barcode,
            supplier_code,
            unit_type,
            cost_price,
            selling_price,
            wholesale_price,
            minimum_price,
            reorder_level,
            critical_stock_level,
            shelf_location,
            warranty_period_days,
            status,
            has_serial_tracking,
            has_batch_tracking,
            has_expiry_tracking,
            category:categories (
              id,
              name
            ),
            brand:brands (
              id,
              name
            ),
            supplier:suppliers (
              id,
              name
            ),
            product_variants (
              id,
              variant_name,
              variant_value,
              sku,
              barcode,
              additional_cost,
              additional_price,
              additional_wholesale_price,
              minimum_price,
              product_variant_stocks (
                quantity,
                branch_id
              )
            ),
            product_images (
              url,
              is_primary,
              sort_order
            ),
            product_compatibility (
              notes,
              motorcycle_model:motorcycle_models (
                id,
                brand,
                model_name,
                engine_type,
                year_from,
                year_to
              )
            )
          )
        `)
        .eq("branch_id", branchId)
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("stock_movements")
        .select("product_id, quantity")
        .eq("branch_id", branchId)
        .gte("created_at", monthStart.toISOString()),
    ]);

    if (inventoryResult.error) {
      throw inventoryResult.error;
    }
    if (movementResult.error) {
      throw movementResult.error;
    }

    return NextResponse.json({
      inventoryRows: (inventoryResult.data ?? []) as unknown as InventorySourceRow[],
      movementRows: (movementResult.data ?? []) as Array<{ product_id: string; quantity: number }>,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load inventory snapshot.";
    console.error("[inventory-snapshot]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

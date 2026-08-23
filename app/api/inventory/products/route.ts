import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { canAccessBranch } from "@/lib/user-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ProductVariantInput = {
  id?: string;
  variantName?: string;
  variantValue?: string;
  sku?: string;
  barcode?: string;
  additionalCost?: number | string;
  additionalPrice?: number | string;
  additionalWholesalePrice?: number | string;
  minimumPrice?: number | string;
  quantity?: number | string;
};

type ProductPayload = {
  name?: string;
  part_number?: string | null;
  sku?: string;
  barcode?: string | null;
  supplier_code?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  supplier_id?: string | null;
  unit_type?: string | null;
  cost_price?: number | string | null;
  selling_price?: number | string | null;
  wholesale_price?: number | string | null;
  minimum_price?: number | string | null;
  reorder_level?: number | string | null;
  critical_stock_level?: number | string | null;
  shelf_location?: string | null;
  warranty_period_days?: number | string | null;
  has_serial_tracking?: boolean;
  has_batch_tracking?: boolean;
  has_expiry_tracking?: boolean;
  status?: "active" | "inactive";
  quantity?: number | string | null;
};

type SaveProductBody = {
  productId?: string;
  branchId?: string;
  product?: ProductPayload;
  imageUrl?: string;
  compatibleModelIds?: string[];
  variants?: ProductVariantInput[];
};

type DeleteProductBody = {
  productId?: string;
  branchId?: string;
};

type ProductCatalogRow = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  part_number?: string | null;
  supplier_code?: string | null;
  shelf_location?: string | null;
  selling_price?: string | number | null;
  status?: string | null;
  is_active?: boolean | null;
  category?: Array<{
    id: string;
    name: string;
  }> | null;
  brand?: Array<{
    id: string;
    name: string;
  }> | null;
  product_images?: Array<{
    url: string;
    is_primary?: boolean | null;
    sort_order?: number | null;
  }> | null;
  product_compatibility?: Array<{
    motorcycle_model?: Array<{
      id: string;
      brand: string;
      model_name: string;
      engine_type?: string | null;
      year_from?: number | null;
      year_to?: number | null;
    }> | {
      id: string;
      brand: string;
      model_name: string;
      engine_type?: string | null;
      year_from?: number | null;
      year_to?: number | null;
    } | null;
  }> | null;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveActor(request: NextRequest) {
  return getAuthenticatedUser(request);
}

function buildProductPayload(product: ProductPayload) {
  return {
    name: cleanText(product.name),
    part_number: cleanText(product.part_number),
    sku: cleanText(product.sku),
    barcode: cleanText(product.barcode),
    supplier_code: cleanText(product.supplier_code),
    category_id: cleanText(product.category_id),
    brand_id: cleanText(product.brand_id),
    supplier_id: cleanText(product.supplier_id),
    unit_type: cleanText(product.unit_type) ?? "pcs",
    cost_price: parseNumber(product.cost_price),
    selling_price: parseNumber(product.selling_price),
    wholesale_price: parseNumber(product.wholesale_price),
    minimum_price: parseNumber(product.minimum_price),
    reorder_level: Math.max(0, parseNumber(product.reorder_level)),
    critical_stock_level: Math.max(0, parseNumber(product.critical_stock_level)),
    shelf_location: cleanText(product.shelf_location),
    warranty_period_days: Math.max(0, parseNumber(product.warranty_period_days)),
    has_serial_tracking: Boolean(product.has_serial_tracking),
    has_batch_tracking: Boolean(product.has_batch_tracking),
    has_expiry_tracking: Boolean(product.has_expiry_tracking),
    status: product.status === "inactive" ? "inactive" : "active",
  };
}

async function saveProduct(request: NextRequest) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.info("[inventory-products:post] start", {
    actor: actor.profileId,
    role: actor.roleName,
  });

  const body = (await request.json()) as SaveProductBody;
  const branchId = body.branchId?.trim() ?? "";
  const productId = body.productId?.trim() ?? "";
  const product = body.product ?? {};

  if (!branchId || !isUuid(branchId)) {
    return NextResponse.json({ error: "Choose a valid branch first." }, { status: 400 });
  }

  if (!canAccessBranch(actor, branchId)) {
    return NextResponse.json({ error: "You do not have access to this branch." }, { status: 403 });
  }

  const isEdit = Boolean(productId);
  if (isEdit) {
    if (!(actor.roleName === "super_admin" || actor.permissions.has("inventory:edit") || actor.permissions.has("inventory:manage"))) {
      return NextResponse.json({ error: "You do not have permission to update products." }, { status: 403 });
    }
  } else if (!(actor.roleName === "super_admin" || actor.permissions.has("inventory:create") || actor.permissions.has("inventory:manage"))) {
    return NextResponse.json({ error: "You do not have permission to add products." }, { status: 403 });
  }

  const productName = cleanText(product.name);
  const sku = cleanText(product.sku);
  if (!productName) {
    return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  }
  if (!sku) {
    return NextResponse.json({ error: "SKU is required." }, { status: 400 });
  }

  const productPayload = buildProductPayload(product);
  const now = new Date().toISOString();
  const nextQuantity = Math.max(0, Number.parseInt(String(body.product?.quantity ?? 0), 10) || 0);

  if (isEdit) {
    console.info("[inventory-products:post] updating product", { productId });
    const updateResult = await supabaseAdmin
      .from("products")
      .update({
        ...productPayload,
        updated_at: now,
      })
      .eq("id", productId)
      .select("id")
      .single();

    if (updateResult.error || !updateResult.data?.id) {
      throw updateResult.error ?? new Error("Unable to update product.");
    }
  } else {
    console.info("[inventory-products:post] creating product", { sku: productPayload.sku });
    const insertResult = await supabaseAdmin
      .from("products")
      .insert({
        ...productPayload,
        created_by: actor.profileId,
      })
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data?.id) {
      throw insertResult.error ?? new Error("Unable to create product.");
    }

    body.productId = insertResult.data.id as string;
  }

  const savedProductId = body.productId as string;
  console.info("[inventory-products:post] syncing stock", {
    savedProductId,
    branchId,
    nextQuantity,
  });
  const existingStockResult = await supabaseAdmin
    .from("inventory_stocks")
    .select("id, quantity")
    .eq("product_id", savedProductId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (existingStockResult.error) {
    throw existingStockResult.error;
  }

  const previousQuantity = Number((existingStockResult.data as { quantity?: number | string | null } | null)?.quantity ?? 0);

  const stockResult = await supabaseAdmin.from("inventory_stocks").upsert(
    {
      product_id: savedProductId,
      branch_id: branchId,
      quantity: nextQuantity,
      updated_at: now,
    },
    { onConflict: "product_id,branch_id" }
  );

  if (stockResult.error) {
    throw stockResult.error;
  }

  const movementDelta = nextQuantity - previousQuantity;
  if (!isEdit || movementDelta !== 0) {
    console.info("[inventory-products:post] writing movement", { movementDelta });
    const movementResult = await supabaseAdmin.from("stock_movements").insert({
      product_id: savedProductId,
      branch_id: branchId,
      movement_type: isEdit ? "adjustment" : "initial",
      quantity: isEdit ? movementDelta : nextQuantity,
      quantity_before: previousQuantity,
      quantity_after: nextQuantity,
      reference_type: "inventory_form",
      reference_id: savedProductId,
      notes: isEdit ? "Stock updated from inventory product form." : "Initial stock set from inventory product form.",
      created_by: actor.profileId,
    });

    if (movementResult.error) {
      throw movementResult.error;
    }
  }

  const deleteImagesResult = await supabaseAdmin.from("product_images").delete().eq("product_id", savedProductId);
  if (deleteImagesResult.error) {
    throw deleteImagesResult.error;
  }

  const imageUrl = cleanText(body.imageUrl);
  if (imageUrl) {
    console.info("[inventory-products:post] writing image");
    const imageResult = await supabaseAdmin.from("product_images").insert({
      product_id: savedProductId,
      url: imageUrl,
      is_primary: true,
      sort_order: 0,
    });
    if (imageResult.error) {
      throw imageResult.error;
    }
  }

  const deleteCompatibilityResult = await supabaseAdmin
    .from("product_compatibility")
    .delete()
    .eq("product_id", savedProductId);
  if (deleteCompatibilityResult.error) {
    throw deleteCompatibilityResult.error;
  }

  const compatibleModelIds = (body.compatibleModelIds ?? []).map((id) => id.trim()).filter(isUuid);
  if (compatibleModelIds.length) {
    console.info("[inventory-products:post] writing compatibility", { count: compatibleModelIds.length });
    const compatibilityResult = await supabaseAdmin.from("product_compatibility").insert(
      compatibleModelIds.map((modelId) => ({
        product_id: savedProductId,
        motorcycle_model_id: modelId,
      }))
    );
    if (compatibilityResult.error) {
      throw compatibilityResult.error;
    }
  }

  const deleteVariantsResult = await supabaseAdmin.from("product_variants").delete().eq("product_id", savedProductId);
  if (deleteVariantsResult.error) {
    throw deleteVariantsResult.error;
  }

  const variantRows = (body.variants ?? []).filter(
    (variant) => cleanText(variant.variantName) && cleanText(variant.variantValue)
  );

  if (variantRows.length) {
    console.info("[inventory-products:post] writing variants", { count: variantRows.length });
    const variantInsertResult = await supabaseAdmin
      .from("product_variants")
      .insert(
        variantRows.map((variant) => ({
          product_id: savedProductId,
          variant_name: cleanText(variant.variantName),
          variant_value: cleanText(variant.variantValue),
          sku: cleanText(variant.sku),
          barcode: cleanText(variant.barcode),
          additional_cost: parseNumber(variant.additionalCost),
          additional_price: parseNumber(variant.additionalPrice),
          additional_wholesale_price: parseNumber(variant.additionalWholesalePrice),
          minimum_price: parseNumber(variant.minimumPrice),
        }))
      )
      .select("id, variant_name, variant_value");

    if (variantInsertResult.error || !variantInsertResult.data) {
      throw variantInsertResult.error ?? new Error("Unable to save product variants.");
    }

    const insertedVariants = variantInsertResult.data as Array<{ id: string; variant_name: string; variant_value: string }>;
    const stockRows = insertedVariants
      .map((insertedVariant) => {
        const matched = variantRows.find(
          (variant) =>
            cleanText(variant.variantName) === insertedVariant.variant_name &&
            cleanText(variant.variantValue) === insertedVariant.variant_value
        );

        if (!matched) return null;
        return {
          variant_id: insertedVariant.id,
          branch_id: branchId,
          quantity: Math.max(0, parseNumber(matched.quantity)),
          updated_at: now,
        };
      })
      .filter((row): row is { variant_id: string; branch_id: string; quantity: number; updated_at: string } => Boolean(row));

    if (stockRows.length) {
      console.info("[inventory-products:post] writing variant stock", { count: stockRows.length });
      const stockVariantResult = await supabaseAdmin.from("product_variant_stocks").upsert(stockRows, {
        onConflict: "variant_id,branch_id",
      });

      if (stockVariantResult.error) {
        throw stockVariantResult.error;
      }
    }
  }

  console.info("[inventory-products:post] success", { savedProductId });
  return NextResponse.json({ success: true, productId: savedProductId });
}

async function loadProducts(request: NextRequest) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAnyPermission(actor, "inventory:view", "inventory:create", "inventory:manage")) {
    return NextResponse.json({ error: "You do not have permission to view inventory." }, { status: 403 });
  }

  const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
  if (!branchId || !isUuid(branchId)) {
    return NextResponse.json({ error: "Choose a valid branch first." }, { status: 400 });
  }

  if (!canAccessBranch(actor, branchId)) {
    return NextResponse.json({ error: "You do not have access to this branch." }, { status: 403 });
  }

  const [stockResult, productResult] = await Promise.all([
    supabaseAdmin.from("inventory_stocks").select("product_id, quantity").eq("branch_id", branchId),
    supabaseAdmin
      .from("products")
      .select(`
        id,
        name,
        sku,
        barcode,
        part_number,
        supplier_code,
        shelf_location,
        selling_price,
        status,
        category:categories (
          id,
          name
        ),
        brand:brands (
          id,
          name
        ),
        product_images (
          url,
          is_primary,
          sort_order
        ),
        product_compatibility (
          motorcycle_model:motorcycle_models (
            id,
            brand,
            model_name,
            engine_type,
            year_from,
            year_to
          )
        )
      `)
      .order("name", { ascending: true }),
  ]);

  if (stockResult.error) {
    throw stockResult.error;
  }
  if (productResult.error) {
    throw productResult.error;
  }

  return NextResponse.json({
    stockRows: (stockResult.data ?? []) as Array<{ product_id: string; quantity: number }>,
    productRows: (productResult.data ?? []) as unknown as ProductCatalogRow[],
  });
}

async function deleteProduct(request: NextRequest) {
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as DeleteProductBody;
  const branchId = body.branchId?.trim() ?? "";
  const productId = body.productId?.trim() ?? "";

  if (!branchId || !isUuid(branchId) || !productId || !isUuid(productId)) {
    return NextResponse.json({ error: "Choose a valid product and branch." }, { status: 400 });
  }

  if (!canAccessBranch(actor, branchId)) {
    return NextResponse.json({ error: "You do not have access to this branch." }, { status: 403 });
  }

  if (!(actor.roleName === "super_admin" || actor.permissions.has("inventory:delete") || actor.permissions.has("inventory:manage"))) {
    return NextResponse.json({ error: "You do not have permission to delete products." }, { status: 403 });
  }

  const result = await supabaseAdmin.from("products").delete().eq("id", productId);
  if (result.error) {
    throw result.error;
  }

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  try {
    return await saveProduct(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save product.";
    console.error("[inventory-products:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    return await loadProducts(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load products.";
    console.error("[inventory-products:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    return await deleteProduct(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete product.";
    console.error("[inventory-products:delete]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

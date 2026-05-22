import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeBarcodeValue,
  sanitizeBarcodeValue,
  type BarcodeKind,
  type BarcodeSourceType,
} from "@/lib/barcode-utils";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EditableBarcodeMapping = {
  id?: string;
  barcodeValue: string;
  barcodeType: BarcodeKind;
  sourceType: BarcodeSourceType;
  isPrimary?: boolean;
  supplierName?: string;
  notes?: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  supplier_code?: string | null;
  part_number?: string | null;
  shelf_location?: string | null;
  selling_price?: number | string | null;
  brand?: { name?: string | null } | null;
};

type ProductBarcodeRow = {
  id: string;
  product_id: string;
  barcode_value: string;
  normalized_value: string;
  barcode_type: BarcodeKind;
  source_type: BarcodeSourceType;
  is_primary: boolean;
  supplier_name?: string | null;
  notes?: string | null;
};

async function findDuplicateDirectProductCode(productId: string, normalizedValue: string) {
  const rawValue = sanitizeBarcodeValue(normalizedValue);
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, barcode, supplier_code, part_number")
    .neq("id", productId)
    .or([
      `sku.ilike.${rawValue}`,
      `barcode.ilike.${rawValue}`,
      `supplier_code.ilike.${rawValue}`,
      `part_number.ilike.${rawValue}`,
    ].join(","));

  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

async function findDuplicateMappedCode(productId: string, normalizedValue: string) {
  const { data, error } = await supabaseAdmin
    .from("product_barcodes")
    .select("id, product_id, products(id, name)")
    .neq("product_id", productId)
    .eq("normalized_value", normalizedValue)
    .limit(5);

  if (error) throw error;
  return (data ?? []) as Array<{ id: string; product_id: string; products?: { id?: string; name?: string } | null }>;
}

function buildSystemMappings(product: ProductRow, mappedRows: ProductBarcodeRow[]) {
  const primaryRow = mappedRows.find((row) => row.is_primary);
  const remainingRows = mappedRows.filter((row) => !row.is_primary);
  const systemRows = [];

  if (product.sku) {
    systemRows.push({
      id: `system-sku-${product.id}`,
      productId: product.id,
      barcodeValue: product.sku,
      normalizedValue: normalizeBarcodeValue(product.sku),
      barcodeType: "barcode" as const,
      sourceType: "sku" as const,
      isPrimary: false,
      supplierName: "",
      notes: "Mapped automatically from SKU.",
      managedBy: "system" as const,
    });
  }

  if (product.supplier_code) {
    systemRows.push({
      id: `system-supplier-${product.id}`,
      productId: product.id,
      barcodeValue: product.supplier_code,
      normalizedValue: normalizeBarcodeValue(product.supplier_code),
      barcodeType: "barcode" as const,
      sourceType: "supplier" as const,
      isPrimary: false,
      supplierName: "",
      notes: "Mapped automatically from supplier code.",
      managedBy: "system" as const,
    });
  }

  const primaryValue = sanitizeBarcodeValue(primaryRow?.barcode_value ?? product.barcode ?? "");
  if (primaryValue) {
    systemRows.unshift({
      id: primaryRow?.id ?? `system-primary-${product.id}`,
      productId: product.id,
      barcodeValue: primaryValue,
      normalizedValue: normalizeBarcodeValue(primaryValue),
      barcodeType: primaryRow?.barcode_type ?? "barcode",
      sourceType: "primary" as const,
      isPrimary: true,
      supplierName: primaryRow?.supplier_name ?? "",
      notes: primaryRow?.notes ?? "Primary barcode for product lookup and label printing.",
      managedBy: primaryRow ? ("user" as const) : ("system" as const),
    });
  }

  const customRows = remainingRows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    barcodeValue: row.barcode_value,
    normalizedValue: row.normalized_value,
    barcodeType: row.barcode_type,
    sourceType: row.source_type,
    isPrimary: row.is_primary,
    supplierName: row.supplier_name ?? "",
    notes: row.notes ?? "",
    managedBy: "user" as const,
  }));

  return [...systemRows, ...customRows];
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!hasAnyPermission(authenticatedUser, "inventory:view", "inventory:manage", "inventory:print_barcode")) {
      return NextResponse.json({ error: "You do not have permission to view barcode mappings." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const productIdsParam = searchParams.get("productIds");

    const productIds = productId
      ? [productId]
      : (productIdsParam ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

    if (!productIds.length) {
      return NextResponse.json({ error: "Missing productId or productIds query parameter." }, { status: 400 });
    }

    const [{ data: productRows, error: productError }, { data: mappingRows, error: mappingError }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(`
          id,
          name,
          sku,
          barcode,
          supplier_code,
          part_number,
          shelf_location,
          selling_price,
          brand:brands (
            name
          )
        `)
        .in("id", productIds),
      supabaseAdmin
        .from("product_barcodes")
        .select("id, product_id, barcode_value, normalized_value, barcode_type, source_type, is_primary, supplier_name, notes")
        .in("product_id", productIds)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (productError) throw productError;
    if (mappingError) throw mappingError;

    const products = ((productRows ?? []) as ProductRow[]).map((product) => ({
      productId: product.id,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? "",
        supplierCode: product.supplier_code ?? "",
        partNumber: product.part_number ?? "",
        shelfLocation: product.shelf_location ?? "",
        brandName: product.brand?.name ?? "",
        sellingPrice: Number(product.selling_price ?? 0),
      },
      mappings: buildSystemMappings(
        product,
        ((mappingRows ?? []) as ProductBarcodeRow[]).filter((row) => row.product_id === product.id)
      ),
    }));

    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load barcode mappings.";
    console.error("[barcodes.get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!hasAnyPermission(authenticatedUser, "inventory:edit", "inventory:manage", "inventory:print_barcode")) {
      return NextResponse.json({ error: "You do not have permission to update barcode mappings." }, { status: 403 });
    }

    const body = await request.json();
    const productId = String(body.productId ?? "");
    const createdByUserId = authenticatedUser.profileId;
    const primaryBarcodeValue = sanitizeBarcodeValue(String(body.primaryBarcodeValue ?? ""));
    const primaryBarcodeType = (body.primaryBarcodeType ?? "barcode") as BarcodeKind;
    const mappings = (body.mappings ?? []) as EditableBarcodeMapping[];

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required." }, { status: 400 });
    }

    const { data: productRow, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, sku, supplier_code")
      .eq("id", productId)
      .maybeSingle();

    if (productError) throw productError;
    if (!productRow) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const candidates = [
      ...(primaryBarcodeValue ? [{ value: primaryBarcodeValue, sourceType: "primary" as const, barcodeType: primaryBarcodeType }] : []),
      ...mappings
        .map((mapping) => ({
          value: sanitizeBarcodeValue(mapping.barcodeValue),
          sourceType: mapping.sourceType,
          barcodeType: mapping.barcodeType,
          supplierName: mapping.supplierName?.trim() ?? "",
          notes: mapping.notes?.trim() ?? "",
        }))
        .filter((mapping) => mapping.value),
    ];

    const seen = new Set<string>();
    for (const candidate of candidates) {
      const normalized = normalizeBarcodeValue(candidate.value);
      if (!normalized) continue;

      if (seen.has(normalized)) {
        return NextResponse.json({ error: `Duplicate barcode in this form: ${candidate.value}` }, { status: 400 });
      }

      seen.add(normalized);

      if (normalized === normalizeBarcodeValue((productRow as { sku?: string | null }).sku ?? "")) continue;
      if (normalized === normalizeBarcodeValue((productRow as { supplier_code?: string | null }).supplier_code ?? "")) continue;

      const directDuplicates = await findDuplicateDirectProductCode(productId, normalized);
      if (directDuplicates.length) {
        return NextResponse.json(
          { error: `Barcode ${candidate.value} is already mapped to another product.` },
          { status: 409 }
        );
      }

      const mappedDuplicates = await findDuplicateMappedCode(productId, normalized);
      if (mappedDuplicates.length) {
        return NextResponse.json(
          { error: `Barcode ${candidate.value} is already used by another mapped barcode.` },
          { status: 409 }
        );
      }
    }

    const { error: updateProductError } = await supabaseAdmin
      .from("products")
      .update({
        barcode: primaryBarcodeValue || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (updateProductError) throw updateProductError;

    const { error: deleteError } = await supabaseAdmin
      .from("product_barcodes")
      .delete()
      .eq("product_id", productId);

    if (deleteError) throw deleteError;

    const payload: Array<Record<string, unknown>> = [];

    if (primaryBarcodeValue) {
      payload.push({
        product_id: productId,
        barcode_value: primaryBarcodeValue,
        normalized_value: normalizeBarcodeValue(primaryBarcodeValue),
        barcode_type: primaryBarcodeType,
        source_type: "primary",
        is_primary: true,
        supplier_name: null,
        notes: "Primary barcode for product labels and scanning.",
        created_by: createdByUserId,
      });
    }

    mappings.forEach((mapping) => {
      const barcodeValue = sanitizeBarcodeValue(mapping.barcodeValue);
      if (!barcodeValue) return;

      payload.push({
        product_id: productId,
        barcode_value: barcodeValue,
        normalized_value: normalizeBarcodeValue(barcodeValue),
        barcode_type: mapping.barcodeType,
        source_type: mapping.sourceType,
        is_primary: false,
        supplier_name: mapping.supplierName?.trim() || null,
        notes: mapping.notes?.trim() || null,
        created_by: createdByUserId,
      });
    });

    if (payload.length) {
      const { error: insertError } = await supabaseAdmin.from("product_barcodes").insert(payload);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save barcode mappings.";
    console.error("[barcodes.post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

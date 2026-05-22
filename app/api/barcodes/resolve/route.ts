import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeBarcodeValue, sanitizeBarcodeValue } from "@/lib/barcode-utils";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type DirectMatchRow = {
  id: string;
  name: string;
};

type MappedMatchRow = {
  product_id: string;
  products?: {
    id?: string;
    name?: string;
  } | null;
};

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!hasAnyPermission(authenticatedUser, "pos:view", "pos:manage", "inventory:view", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to resolve barcodes." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawValue = searchParams.get("value") ?? "";
    const normalizedValue = normalizeBarcodeValue(rawValue);
    const sanitizedValue = sanitizeBarcodeValue(rawValue);

    if (!normalizedValue) {
      return NextResponse.json({ error: "Scan value is required." }, { status: 400 });
    }

    const [{ data: directRows, error: directError }, { data: mappedRows, error: mappedError }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name")
        .or([
          `sku.ilike.${sanitizedValue}`,
          `barcode.ilike.${sanitizedValue}`,
          `supplier_code.ilike.${sanitizedValue}`,
          `part_number.ilike.${sanitizedValue}`,
        ].join(",")),
      supabaseAdmin
        .from("product_barcodes")
        .select("product_id, products(id, name)")
        .eq("normalized_value", normalizedValue),
    ]);

    if (directError) throw directError;
    if (mappedError) throw mappedError;

    const resolvedMap = new Map<string, { productId: string; productName: string }>();

    ((directRows ?? []) as DirectMatchRow[]).forEach((row) => {
      resolvedMap.set(row.id, { productId: row.id, productName: row.name });
    });

    ((mappedRows ?? []) as MappedMatchRow[]).forEach((row) => {
      const productId = row.product_id || row.products?.id;
      if (!productId) return;
      resolvedMap.set(productId, {
        productId,
        productName: row.products?.name ?? "",
      });
    });

    const matches = Array.from(resolvedMap.values());

    if (!matches.length) {
      return NextResponse.json({ found: false });
    }

    if (matches.length > 1) {
      return NextResponse.json(
        {
          found: false,
          ambiguous: true,
          matches,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      found: true,
      productId: matches[0].productId,
      productName: matches[0].productName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve barcode.";
    console.error("[barcodes.resolve]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

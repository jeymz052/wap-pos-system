import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { type BarcodeKind } from "@/lib/barcode-utils";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { requireSubscriptionFeature } from "@/lib/subscriptions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type BarcodeLabelPayload = {
  productId: string;
  barcodeValue: string;
  barcodeType: BarcodeKind;
  labelSize: string;
  includePrice: boolean;
  includeBrand: boolean;
  includeSku: boolean;
  printQuantity: number;
  widthMm: number;
  heightMm: number;
  includeProductName: boolean;
  includeShelfLocation: boolean;
  createdByUserId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!hasAnyPermission(authenticatedUser, "inventory:print_barcode", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to record barcode label prints." }, { status: 403 });
    }

    if (!(await requireSubscriptionFeature("barcode_printing"))) {
      return NextResponse.json({ error: "Barcode printing is not enabled on the current subscription plan." }, { status: 403 });
    }

    const body = await request.json();
    const labels = (body.labels ?? []) as BarcodeLabelPayload[];

    if (!labels.length) {
      return NextResponse.json({ error: "No labels supplied." }, { status: 400 });
    }

    const payload = labels.map((label) => ({
      product_id: label.productId,
      barcode_value: label.barcodeValue,
      barcode_type: label.barcodeType,
      label_size: label.labelSize,
      include_price: label.includePrice,
      include_brand: label.includeBrand,
      include_sku: label.includeSku,
      print_quantity: Math.max(1, Number(label.printQuantity ?? 1)),
      width_mm: Number(label.widthMm ?? 58),
      height_mm: Number(label.heightMm ?? 30),
      include_product_name: Boolean(label.includeProductName),
      include_shelf_location: Boolean(label.includeShelfLocation),
      created_by: authenticatedUser.profileId,
    }));

    const { error } = await supabaseAdmin.from("barcode_labels").insert(payload);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store barcode label records.";
    console.error("[barcodes.labels]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

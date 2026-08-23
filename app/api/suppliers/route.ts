import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const supplierSelectFields =
  "id, code, name, supplier_type, contact_person, phone, email, address, tax_number, payment_terms, credit_limit, current_balance, is_active, created_at";

type SupplierPayload = {
  id?: string;
  code?: string;
  name?: string;
  supplier_type?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  payment_terms?: number | string | null;
  credit_limit?: number | string | null;
  is_active?: boolean;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeSupplierType(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const allowed = new Set(["retailer", "distributor", "wholesaler", "manufacturer", "service_provider"]);
  return allowed.has(normalized) ? normalized : "distributor";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const typedError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof typedError.message === "string" && typedError.message.trim() ? typedError.message.trim() : "";
    const details = typeof typedError.details === "string" && typedError.details.trim() ? typedError.details.trim() : "";
    const hint = typeof typedError.hint === "string" && typedError.hint.trim() ? typedError.hint.trim() : "";
    const code = typeof typedError.code === "string" && typedError.code.trim() ? typedError.code.trim() : "";
    return [message || "Unknown error", details ? `Details: ${details}` : "", hint ? `Hint: ${hint}` : "", code ? `Code: ${code}` : ""]
      .filter(Boolean)
      .join(" ");
  }
  return typeof error === "string" && error.trim() ? error.trim() : "Unknown error";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!hasAnyPermission(user, "suppliers:view", "purchasing:view", "payables:view", "expenses:view")) {
      return NextResponse.json({ error: "You do not have permission to view suppliers." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.from("suppliers").select(supplierSelectFields).order("name", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ suppliers: data ?? [] });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("[suppliers:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!hasAnyPermission(user, "suppliers:create", "suppliers:manage", "suppliers:edit")) {
      return NextResponse.json({ error: "You do not have permission to save suppliers." }, { status: 403 });
    }

    const payload = (await request.json()) as SupplierPayload;
    const mode = payload.id?.trim() ? "edit" : "create";
    const name = cleanText(payload.name);
    if (!name) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }

    const code = (cleanText(payload.code) || name).toUpperCase().replace(/\s+/g, "-");
    const normalized = {
      code,
      name,
      supplier_type: normalizeSupplierType(payload.supplier_type),
      contact_person: cleanText(payload.contact_person),
      phone: cleanText(payload.phone),
      email: cleanText(payload.email),
      address: cleanText(payload.address),
      tax_number: cleanText(payload.tax_number),
      payment_terms: Math.max(0, parseNumber(payload.payment_terms)),
      credit_limit: Math.max(0, parseNumber(payload.credit_limit)),
      is_active: payload.is_active ?? true,
    };

    const saveResult =
      mode === "edit"
        ? await supabaseAdmin
            .from("suppliers")
            .update({ ...normalized, updated_at: new Date().toISOString() })
            .eq("id", payload.id?.trim() ?? "")
            .select(supplierSelectFields)
            .single()
        : await supabaseAdmin
            .from("suppliers")
            .insert({ ...normalized, current_balance: 0 })
            .select(supplierSelectFields)
            .single();

    if (saveResult.error || !saveResult.data) {
      throw saveResult.error ?? new Error("Unable to save supplier.");
    }

    return NextResponse.json({ supplier: saveResult.data }, { status: mode === "edit" ? 200 : 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("[suppliers:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

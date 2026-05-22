import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── GET: Fetch current 2FA status for the authenticated user ──────────────────
export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("id, two_factor_enabled")
    .eq("auth_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Check MFA factors from TOTP secrets table
  const { data: totpSecret } = await supabaseAdmin
    .from("totp_secrets")
    .select("id, is_verified, enrolled_at")
    .eq("user_id", profile.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: profile.two_factor_enabled ?? false,
    factor: totpSecret?.is_verified ? { enrolled_at: totpSecret.enrolled_at } : null,
  });
}

// ─── POST: Enable or Disable 2FA ───────────────────────────────────────────────
// Body: { action: "enroll" | "disable" }
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("id, two_factor_enabled")
    .eq("auth_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json() as { action?: "disable" };

  if (body.action === "disable") {
    // Update profile flag to disable 2FA
    await supabaseAdmin
      .from("users")
      .update({ two_factor_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    // Update totp_secrets table
    await supabaseAdmin
      .from("totp_secrets")
      .update({ is_verified: false })
      .eq("user_id", profile.id);

    return NextResponse.json({ ok: true, message: "2FA has been disabled." });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ─── PUT: Confirm 2FA enrollment after user verifies the code ─────────────────
// Body: { factor_id: string, code: string }
export async function PUT(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Mark profile as having 2FA enabled
  await supabaseAdmin
    .from("users")
    .update({ two_factor_enabled: true, updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  // Upsert totp_secrets record
  await supabaseAdmin
    .from("totp_secrets")
    .upsert(
      { user_id: profile.id, secret: "managed_by_supabase_auth", is_verified: true, enrolled_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  return NextResponse.json({ ok: true, message: "2FA successfully enabled." });
}

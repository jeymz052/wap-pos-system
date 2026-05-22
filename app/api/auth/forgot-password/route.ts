import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { identifier?: string };
    const identifier = (body.identifier ?? "").trim().toLowerCase();

    if (!identifier) {
      return NextResponse.json({ error: "Identifier is required." }, { status: 400 });
    }

    // Resolve to email (works for both email and username)
    const { data: resolvedEmail, error: resolveError } = await supabaseAdmin
      .rpc("resolve_auth_user_email", { identifier });

    if (resolveError || !resolvedEmail) {
      // Return success to avoid user enumeration
      return NextResponse.json({ ok: true });
    }

    // Use Supabase admin to send password reset email
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: resolvedEmail as string,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
      },
    });

    if (resetError) {
      console.error("[forgot-password] generateLink error:", resetError.message);
      // Still return OK to avoid enumeration
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

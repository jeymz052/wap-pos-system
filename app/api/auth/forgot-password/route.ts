import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const supabasePublic = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

    // Let Supabase Auth send the recovery email through the project's configured SMTP provider.
    const { error: resetError } = await supabasePublic.auth.resetPasswordForEmail(resolvedEmail as string, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
    });

    if (resetError) {
      console.error("[forgot-password] resetPasswordForEmail error:", resetError.message);
      // Still return OK to avoid enumeration
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

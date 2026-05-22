import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
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

  const { data: sessions, error: sessError } = await supabaseAdmin
    .from("device_sessions")
    .select("id, device_name, browser, os, ip_address, last_active_at, created_at, is_current")
    .eq("user_id", profile.id)
    .order("last_active_at", { ascending: false });

  if (sessError) return NextResponse.json({ error: sessError.message }, { status: 500 });

  return NextResponse.json({ data: sessions });
}

export async function DELETE(req: NextRequest) {
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

  const body = await req.json() as { session_id?: string; all?: boolean };

  if (body.all) {
    // Revoke all sessions except current
    await supabaseAdmin
      .from("device_sessions")
      .delete()
      .eq("user_id", profile.id)
      .eq("is_current", false);

    return NextResponse.json({ ok: true });
  }

  if (body.session_id) {
    const { error: delError } = await supabaseAdmin
      .from("device_sessions")
      .delete()
      .eq("id", body.session_id)
      .eq("user_id", profile.id); // ensures ownership

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide session_id or all=true" }, { status: 400 });
}

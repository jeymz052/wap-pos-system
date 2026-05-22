import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    device_name?: string;
    login_method?: string;
  };

  const ip        = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const deviceName = body.device_name ?? "Unknown Device";
  const loginMethod = body.login_method ?? "password";

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const sessionToken = token.slice(0, 32);

  // Record login
  await supabaseAdmin.rpc("record_successful_login", {
    p_user_id:      profile.id,
    p_ip_address:   ip,
    p_user_agent:   userAgent,
    p_login_method: loginMethod,
    p_session_id:   sessionToken,
    p_device_name:  deviceName,
  });

  // Upsert device session
  const { data: existing } = await supabaseAdmin
    .from("device_sessions")
    .select("id")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("device_sessions")
      .update({ last_active_at: new Date().toISOString(), is_current: true })
      .eq("id", existing.id);
  } else {
    // Mark all previous sessions as not current
    await supabaseAdmin
      .from("device_sessions")
      .update({ is_current: false })
      .eq("user_id", profile.id);

    await supabaseAdmin.from("device_sessions").insert({
      user_id:       profile.id,
      session_token: sessionToken,
      device_name:   deviceName,
      ip_address:    ip,
      last_active_at: new Date().toISOString(),
      is_current:    true,
    });
  }

  return NextResponse.json({ ok: true });
}

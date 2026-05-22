import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify caller
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit    = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
  const userId   = searchParams.get("user_id"); // admin can pass a specific user id
  const offset   = (page - 1) * limit;

  // Get caller's profile
  const { data: callerProfile } = await supabaseAdmin
    .from("users")
    .select("id, role_id, roles(name)")
    .eq("auth_id", user.id)
    .single();

  const callerRole = (callerProfile?.roles as { name?: string } | null)?.name ?? "";
  const isAdmin = ["super_admin", "admin"].includes(callerRole);

  // Determine which user's history to fetch
  const targetUserId = isAdmin && userId ? userId : (callerProfile?.id ?? user.id);

  const { data: history, error: histError, count } = await supabaseAdmin
    .from("login_history")
    .select(
      `id, status, login_method, ip_address, user_agent, device_name, logged_in_at,
       users(id, username, first_name, last_name)`,
      { count: "exact" }
    )
    .eq("user_id", targetUserId)
    .order("logged_in_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (histError) {
    return NextResponse.json({ error: histError.message }, { status: 500 });
  }

  return NextResponse.json({ data: history, total: count ?? 0, page, limit });
}

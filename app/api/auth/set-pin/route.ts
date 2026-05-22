import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify caller is authenticated
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify caller is admin / super_admin
    const { data: callerProfile } = await supabaseAdmin
      .from("users")
      .select("id, roles(name)")
      .eq("auth_id", user.id)
      .single();

    const callerRole = (callerProfile?.roles as { name?: string } | null)?.name ?? "";
    if (!["super_admin", "admin"].includes(callerRole)) {
      return NextResponse.json({ error: "Only admins can set PINs." }, { status: 403 });
    }

    const body = await req.json() as {
      user_id?: string;
      pin?: string;
      action?: "set" | "clear";
    };

    const { user_id, pin, action = "set" } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required." }, { status: 400 });
    }

    if (action === "clear") {
      const { error } = await supabaseAdmin.rpc("clear_cashier_pin", { p_user_id: user_id });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "PIN cleared." });
    }

    // action === "set"
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4–8 digits." }, { status: 400 });
    }

    // Verify target user exists and is a cashier role (or allow admin override)
    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("id, username, roles(name)")
      .eq("id", user_id)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found." }, { status: 404 });
    }

    // Use the DB function — bcrypt hashing happens inside PostgreSQL via pgcrypto
    const { error: setError } = await supabaseAdmin.rpc("set_cashier_pin", {
      p_user_id: user_id,
      p_pin:     pin,
    });

    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `PIN set for user "${(targetUser as { username?: string }).username ?? user_id}".`,
    });
  } catch (err) {
    console.error("[set-pin]", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

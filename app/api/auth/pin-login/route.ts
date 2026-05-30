import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { username?: string; pin?: string };
    const username = (body.username ?? "").trim();
    const pin      = (body.pin ?? "").trim();

    if (!username || !pin) {
      return NextResponse.json({ error: "Username and PIN are required." }, { status: 400 });
    }

    const policyResult = await supabaseAdmin.rpc("get_password_policy");
    if (policyResult.error) {
      return NextResponse.json({ error: policyResult.error.message }, { status: 500 });
    }

    const pinLength = Number((policyResult.data as Record<string, unknown> | null)?.pin_length ?? 4);
    if (!new RegExp(`^\\d{${pinLength}}$`).test(pin)) {
      return NextResponse.json({ error: `PIN must be exactly ${pinLength} digits.` }, { status: 400 });
    }

    const ip        = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    // Call the DB function to verify PIN
    const { data, error } = await supabaseAdmin.rpc("verify_cashier_pin", {
      p_username: username,
      p_pin:      pin,
    });

    if (error) {
      return NextResponse.json({ error: "PIN verification failed." }, { status: 500 });
    }

    const result = data as { success: boolean; reason?: string; user_id?: string; locked_until?: string };

    if (!result.success) {
      if (result.user_id) {
        await supabaseAdmin.rpc("record_failed_login", {
          p_user_id:   result.user_id,
          p_ip_address: ip,
          p_user_agent: userAgent,
        });
      }
      return NextResponse.json({
        error: result.reason === "account_locked"
          ? `Account locked until ${result.locked_until}`
          : result.reason === "pin_not_set"
          ? "PIN login is not set up for this account."
          : "Invalid PIN.",
      }, { status: 401 });
    }

    // Get auth_id for the profile user
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("auth_id, email")
      .eq("id", result.user_id!)
      .single();

    if (!userRow?.auth_id || !userRow?.email) {
      return NextResponse.json({ error: "User account not fully set up." }, { status: 403 });
    }

    // Generate a magic link / sign-in token via admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userRow.email as string,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      return NextResponse.json({ error: "Could not create session." }, { status: 500 });
    }

    // Record success
    await supabaseAdmin.rpc("record_successful_login", {
      p_user_id:     result.user_id!,
      p_ip_address:  ip,
      p_user_agent:  userAgent,
      p_login_method: "pin",
    });

    // Return the action link so the client can redirect to it
    return NextResponse.json({
      ok: true,
      action_link: linkData.properties.action_link,
    });
  } catch (err) {
    console.error("[pin-login] error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

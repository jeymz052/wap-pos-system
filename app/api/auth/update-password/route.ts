import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBearerToken } from "@/lib/server-auth";
import {
  getPasswordExpiryIso,
  normalizeSecurityPolicy,
  validatePasswordAgainstPolicy,
} from "@/lib/security-policy";

async function loadSecurityPolicy() {
  const { data, error } = await supabaseAdmin.rpc("get_password_policy");
  if (error) throw error;
  return normalizeSecurityPolicy((data as Record<string, unknown> | null) ?? null);
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as { password?: string };
    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const policy = await loadSecurityPolicy();
    const issues = validatePasswordAgainstPolicy(password, policy);
    if (issues.length > 0) {
      return NextResponse.json({ error: `Password requirements: ${issues.join(", ")}.` }, { status: 400 });
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
    });

    if (updateAuthError) {
      return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
    }

    const passwordExpiresAt = getPasswordExpiryIso(policy);
    const { error: updateProfileError } = await supabaseAdmin
      .from("users")
      .update({
        require_password_change: false,
        password_expires_at: passwordExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_id", authUser.id);

    if (updateProfileError) {
      return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      password_expires_at: passwordExpiresAt,
      message: "Password updated successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[auth:update-password]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

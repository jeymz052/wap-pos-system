import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getUserPermissions(userId: string) {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, username, first_name, last_name, role_id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) return null;

  const roleId = (userRow as { role_id?: string | null }).role_id;
  const permissions = new Set<string>();

  if (roleId) {
    const { data: permissionRows, error: permissionError } = await supabaseAdmin
      .from("role_permissions")
      .select("is_allowed, permissions(module, action)")
      .eq("role_id", roleId)
      .eq("is_allowed", true);

    if (permissionError) throw permissionError;

    (permissionRows as Array<{ permissions?: { module?: string | null; action?: string | null } | null }> | null ?? []).forEach((row) => {
      const moduleName = row.permissions?.module;
      const action = row.permissions?.action;
      if (moduleName && action) permissions.add(`${moduleName}:${action}`);
    });
  }

  return {
    id: (userRow as { id: string }).id,
    username: (userRow as { username?: string | null }).username ?? "",
    displayName: [
      (userRow as { first_name?: string | null }).first_name?.trim(),
      (userRow as { last_name?: string | null }).last_name?.trim(),
    ].filter(Boolean).join(" "),
    permissions,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { username?: string; pin?: string; permissions?: string[] };
    const username = (body.username ?? "").trim();
    const pin = (body.pin ?? "").trim();
    const requiredPermissions = Array.isArray(body.permissions) ? body.permissions.filter(Boolean) : [];

    if (!username || !pin || !requiredPermissions.length) {
      return NextResponse.json({ error: "Username, PIN, and required permissions are needed." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("verify_cashier_pin", {
      p_username: username,
      p_pin: pin,
    });

    if (error) {
      return NextResponse.json({ error: "Approval PIN verification failed." }, { status: 500 });
    }

    const result = data as { success: boolean; user_id?: string; reason?: string };
    if (!result.success || !result.user_id) {
      return NextResponse.json({ error: "Invalid supervisor username or PIN." }, { status: 401 });
    }

    const approver = await getUserPermissions(result.user_id);
    if (!approver) {
      return NextResponse.json({ error: "Approver account was not found." }, { status: 404 });
    }

    const allowed = requiredPermissions.every((permission) =>
      approver.permissions.has(permission) || approver.permissions.has("pos:manage")
    );

    if (!allowed) {
      return NextResponse.json({ error: "Approver does not have the required POS permission." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      approver: {
        userId: approver.id,
        username: approver.username,
        displayName: approver.displayName || approver.username,
      },
    });
  } catch (err) {
    console.error("[verify-pos-approval]", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

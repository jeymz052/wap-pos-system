import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByProfileId } from "@/lib/user-access";

async function getUserPermissions(userId: string) {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, username, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) return null;
  const accessProfile = await getAccessProfileByProfileId(userId);

  return {
    id: (userRow as { id: string }).id,
    username: (userRow as { username?: string | null }).username ?? "",
    displayName: [
      (userRow as { first_name?: string | null }).first_name?.trim(),
      (userRow as { last_name?: string | null }).last_name?.trim(),
    ].filter(Boolean).join(" "),
    permissions: accessProfile?.permissions ?? new Set<string>(),
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

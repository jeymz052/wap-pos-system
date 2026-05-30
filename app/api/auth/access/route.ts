import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByAuthUserId } from "@/lib/user-access";

function isSchemaMismatchError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  const code = String(error?.code ?? "");
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  return (
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessProfile = await getAccessProfileByAuthUserId(user.id);
    if (!accessProfile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const { data: roleRow, error: roleError } = accessProfile.roleId
      ? await supabaseAdmin.from("roles").select("id, name, description").eq("id", accessProfile.roleId).maybeSingle()
      : { data: null, error: null };

    if (roleError) throw roleError;

    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, username, email, role_id, branch_id, is_active, two_factor_enabled, require_password_change, password_expires_at")
      .eq("id", accessProfile.profileId)
      .maybeSingle();

    if (profileError && !isSchemaMismatchError(profileError)) throw profileError;

    const resolvedProfileRow =
      profileError && isSchemaMismatchError(profileError)
        ? await (async () => {
            const fallbackResult = await supabaseAdmin
              .from("users")
              .select("id, first_name, last_name, username, email, role_id, branch_id, is_active, require_password_change, password_expires_at")
              .eq("id", accessProfile.profileId)
              .maybeSingle();

            if (fallbackResult.error) throw fallbackResult.error;
            return fallbackResult.data
              ? { ...fallbackResult.data, two_factor_enabled: false }
              : null;
          })()
        : (profileRow ?? null);

    return NextResponse.json({
      user: resolvedProfileRow,
      role: roleRow ?? null,
      permissions: Array.from(accessProfile.permissions),
      salesRestrictions: accessProfile.salesRestrictions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[auth:access]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type AuthenticatedUser = {
  authUserId: string;
  profileId: string;
  roleId: string | null;
  permissions: Set<string>;
};

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return "";
  return token.trim();
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id, role_id")
    .eq("auth_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profileRow) return null;

  const roleId = (profileRow as { role_id?: string | null }).role_id ?? null;
  const permissions = new Set<string>();

  if (roleId) {
    const { data: permissionRows, error: permissionError } = await supabaseAdmin
      .from("role_permissions")
      .select("is_allowed, permissions(module, action)")
      .eq("role_id", roleId)
      .eq("is_allowed", true);

    if (permissionError) {
      throw permissionError;
    }

    (permissionRows as Array<{ permissions?: { module?: string | null; action?: string | null } | null }> | null ?? []).forEach((row) => {
      const moduleName = row.permissions?.module;
      const action = row.permissions?.action;
      if (moduleName && action) {
        permissions.add(`${moduleName}:${action}`);
      }
    });
  }

  return {
    authUserId: authData.user.id,
    profileId: (profileRow as { id: string }).id,
    roleId,
    permissions,
  };
}

export function hasAnyPermission(user: AuthenticatedUser, ...required: string[]) {
  return required.some((permission) => user.permissions.has(permission));
}

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAccessProfileByAuthUserId } from "@/lib/user-access";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type AuthenticatedUser = {
  authUserId: string;
  profileId: string;
  roleId: string | null;
  roleName: string | null;
  branchId: string | null;
  dataAccessScope: string;
  isActive: boolean;
  allowLogin: boolean;
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
  const accessProfile = await getAccessProfileByAuthUserId(authData.user.id);
  if (!accessProfile) return null;

  return {
    authUserId: authData.user.id,
    profileId: accessProfile.profileId,
    roleId: accessProfile.roleId,
    roleName: accessProfile.roleName,
    branchId: accessProfile.branchId,
    dataAccessScope: accessProfile.dataAccessScope,
    isActive: accessProfile.isActive,
    allowLogin: accessProfile.allowLogin,
    permissions: new Set(accessProfile.permissions),
  };
}

export function hasAnyPermission(user: AuthenticatedUser, ...required: string[]) {
  return required.some((permission) => user.permissions.has(permission));
}

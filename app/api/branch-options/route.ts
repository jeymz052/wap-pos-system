import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessProfileByAuthUserId } from "@/lib/user-access";

type BranchRow = {
  id: string;
  name: string;
  is_main?: boolean | null;
  is_active?: boolean | null;
};

function isElevated(roleName: string | null, dataAccessScope: string) {
  return roleName === "super_admin" || roleName === "admin" || dataAccessScope === "all_data";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessProfile = await getAccessProfileByAuthUserId(user.authUserId);
    if (!accessProfile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    if (!isElevated(accessProfile.roleName, accessProfile.dataAccessScope) && !accessProfile.branchId) {
      return NextResponse.json({ branches: [] });
    }

    let query = supabaseAdmin
      .from("branches")
      .select("id, name, is_main, is_active")
      .eq("is_active", true)
      .order("is_main", { ascending: false })
      .order("name", { ascending: true });

    if (!isElevated(accessProfile.roleName, accessProfile.dataAccessScope) && accessProfile.branchId) {
      query = query.eq("id", accessProfile.branchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ branches: (data ?? []) as BranchRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[branch-options:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

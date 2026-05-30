import { NextRequest, NextResponse } from "next/server";
import { syncNotificationAlerts } from "@/lib/notifications";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 20)));
    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";

    let query = supabaseAdmin
      .from("notifications")
      .select("id, branch_id, notification_type, title, message, reference_type, reference_id, is_read, read_at, created_at, severity, metadata, action_url, branches(name)")
      .eq("user_id", user.profileId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const result = await query;
    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({ notifications: result.data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[notifications:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as {
      action?: "mark_read" | "mark_all_read";
      ids?: string[];
    };

    const now = new Date().toISOString();
    const action = body.action ?? "mark_read";

    if (action === "mark_all_read") {
      const updateResult = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("user_id", user.profileId)
        .eq("is_read", false);

      if (updateResult.error) {
        throw updateResult.error;
      }

      return NextResponse.json({ success: true });
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Notification ids are required." }, { status: 400 });
    }

    const updateResult = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("user_id", user.profileId)
      .in("id", ids);

    if (updateResult.error) {
      throw updateResult.error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[notifications:patch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "notifications:manage", "reports:manage", "settings:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { branchId?: string | null };
    const branchId = typeof body.branchId === "string" && body.branchId.trim() ? body.branchId.trim() : null;
    const result = await syncNotificationAlerts(branchId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[notifications:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

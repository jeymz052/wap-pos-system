import { NextRequest, NextResponse } from "next/server";
import { getBearerToken } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canAccessBranch,
  getAccessProfileByAuthUserId,
  getEffectivePermissionsForUser,
  hasAnyPermission,
  logAuditEvent,
  type SalesRestrictions,
} from "@/lib/user-access";
import { getSubscriptionAccessSummary } from "@/lib/subscriptions";
import {
  getPasswordExpiryIso,
  normalizeSecurityPolicy,
  validatePasswordAgainstPolicy,
} from "@/lib/security-policy";

type PermissionRow = {
  id: string;
  module: string;
  action: string;
  description: string | null;
};

type CreateUserPayload = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  phone?: string | null;
  employeeId?: string | null;
  password?: string;
  roleId?: string | null;
  branchId?: string | null;
  dataAccessScope?: string | null;
};

type UpdateUserPayload = {
  userId?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  phone?: string | null;
  employeeId?: string | null;
  roleId?: string | null;
  branchId?: string | null;
  dataAccessScope?: string | null;
  isActive?: boolean;
  allowLogin?: boolean;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeScope(value: unknown) {
  return value === "all_data" ? "all_data" : "branch_only";
}

function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
}

async function resolveActor(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return null;
  return getAccessProfileByAuthUserId(user.id);
}

async function loadWorkspace() {
  const securityPolicyResult = await supabaseAdmin.rpc("get_password_policy");
  if (securityPolicyResult.error) throw securityPolicyResult.error;

  const [
    usersResult,
    rolesResult,
    branchesResult,
    permissionsResult,
    overridesResult,
    activityResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("v_user_management_overview")
      .select("*")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("roles").select("id, name, description").order("name"),
    supabaseAdmin.from("branches").select("id, name, code, is_active").eq("is_active", true).order("name"),
    supabaseAdmin.from("permissions").select("id, module, action, description").order("module").order("action"),
    supabaseAdmin
      .from("user_permission_overrides")
      .select("id, user_id, permission_id, is_allowed, notes")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("v_user_activity_feed")
      .select("user_id, branch_id, event_source, event_id, event_action, event_type, reference_type, reference_id, event_payload, event_at")
      .order("event_at", { ascending: false })
      .limit(200),
  ]);

  const fatalError =
    usersResult.error ||
    rolesResult.error ||
    branchesResult.error ||
    permissionsResult.error ||
    overridesResult.error ||
    activityResult.error;

  if (fatalError) throw fatalError;

  const permissions = (permissionsResult.data ?? []) as PermissionRow[];
  const users = (usersResult.data ?? []) as Array<Record<string, unknown>>;
  const overrides = (overridesResult.data ?? []) as Array<Record<string, unknown>>;
  const activities = (activityResult.data ?? []) as Array<Record<string, unknown>>;

  const overridesByUser = new Map<string, Record<string, { id: string; isAllowed: boolean; notes: string | null }>>();
  overrides.forEach((row) => {
    const userId = String(row.user_id ?? "");
    const permissionId = String(row.permission_id ?? "");
    if (!userId || !permissionId) return;
    const bucket = overridesByUser.get(userId) ?? {};
    bucket[permissionId] = {
      id: String(row.id),
      isAllowed: Boolean(row.is_allowed),
      notes: cleanText(row.notes),
    };
    overridesByUser.set(userId, bucket);
  });

  const permissionsByUser = await Promise.all(
    users.map(async (user) => {
      const id = String(user.id ?? "");
      return [id, Array.from(await getEffectivePermissionsForUser(id))] as const;
    }),
  );

  return {
    securityPolicy: normalizeSecurityPolicy((securityPolicyResult.data as Record<string, unknown> | null) ?? null),
    roles: rolesResult.data ?? [],
    branches: branchesResult.data ?? [],
    permissions,
    users: users.map((user) => ({
      ...user,
      effective_permissions: permissionsByUser.find(([id]) => id === String(user.id))?.[1] ?? [],
      permission_overrides: overridesByUser.get(String(user.id)) ?? {},
    })),
    activities,
  };
}

async function createUser(actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>, request: NextRequest, payload: CreateUserPayload) {
  if (!hasAnyPermission(actor, "users:create", "users:manage")) {
    return NextResponse.json({ error: "You do not have permission to create staff accounts." }, { status: 403 });
  }

  const subscription = await getSubscriptionAccessSummary();
  if (
    subscription.snapshot.user_limit !== null &&
    subscription.usage.active_user_count >= subscription.snapshot.user_limit
  ) {
    return NextResponse.json({
      error: `Your current subscription only allows ${subscription.snapshot.user_limit} active user(s). Upgrade the plan to create another account.`,
    }, { status: 409 });
  }

  const firstName = cleanText(payload.firstName);
  const lastName = cleanText(payload.lastName);
  const username = cleanText(payload.username);
  const email = cleanText(payload.email);
  const password = cleanText(payload.password);
  const branchId = cleanText(payload.branchId);

  if (!firstName || !lastName || !username || !email || !password) {
    return NextResponse.json({ error: "First name, last name, username, email, and password are required." }, { status: 400 });
  }

  const policyResult = await supabaseAdmin.rpc("get_password_policy");
  if (policyResult.error) {
    return NextResponse.json({ error: policyResult.error.message }, { status: 500 });
  }

  const securityPolicy = normalizeSecurityPolicy((policyResult.data as Record<string, unknown> | null) ?? null);
  const passwordIssues = validatePasswordAgainstPolicy(password, securityPolicy);
  if (passwordIssues.length > 0) {
    return NextResponse.json({ error: `Temporary password requirements: ${passwordIssues.join(", ")}.` }, { status: 400 });
  }

  if (branchId && !canAccessBranch(actor, branchId)) {
    return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
  }

  const { data: createdAuthUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (authCreateError || !createdAuthUser.user) {
    return NextResponse.json({ error: authCreateError?.message ?? "Unable to create the login account." }, { status: 500 });
  }

  const insertPayload = {
    auth_id: createdAuthUser.user.id,
    first_name: firstName,
    last_name: lastName,
    username,
    email,
    phone: cleanText(payload.phone),
    employee_id: cleanText(payload.employeeId),
    role_id: cleanText(payload.roleId),
    branch_id: branchId,
    data_access_scope: normalizeScope(payload.dataAccessScope),
    is_active: true,
    allow_login: true,
    require_password_change: true,
    password_expires_at: getPasswordExpiryIso(securityPolicy),
  };

  const { data: createdProfile, error: insertError } = await supabaseAdmin
    .from("users")
    .insert(insertPayload)
    .select("id, branch_id, username, email")
    .single();

  if (insertError || !createdProfile) {
    await supabaseAdmin.auth.admin.deleteUser(createdAuthUser.user.id);
    return NextResponse.json({ error: insertError?.message ?? "Unable to create the staff profile." }, { status: 500 });
  }

  await logAuditEvent({
    userId: actor.profileId,
    branchId: createdProfile.branch_id ?? branchId,
    module: "users",
    action: "create",
    referenceType: "user",
    referenceId: createdProfile.id,
    newValues: insertPayload,
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: `Created ${createdProfile.username}.` });
}

async function updateUser(actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>, request: NextRequest, payload: UpdateUserPayload) {
  if (!hasAnyPermission(actor, "users:edit", "users:manage")) {
    return NextResponse.json({ error: "You do not have permission to update staff accounts." }, { status: 403 });
  }

  const userId = cleanText(payload.userId);
  if (!userId) {
    return NextResponse.json({ error: "User is required." }, { status: 400 });
  }

  const { data: existingUser, error: existingError } = await supabaseAdmin
    .from("users")
    .select("id, auth_id, branch_id, first_name, last_name, username, email, phone, employee_id, role_id, data_access_scope, is_active, allow_login")
    .eq("id", userId)
    .maybeSingle();

  if (existingError || !existingUser) {
    return NextResponse.json({ error: existingError?.message ?? "User not found." }, { status: 404 });
  }

  const branchId = cleanText(payload.branchId);
  if (branchId && !canAccessBranch(actor, branchId)) {
    return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
  }

  const updatePayload = {
    first_name: cleanText(payload.firstName) ?? existingUser.first_name,
    last_name: cleanText(payload.lastName) ?? existingUser.last_name,
    username: cleanText(payload.username) ?? existingUser.username,
    email: cleanText(payload.email) ?? existingUser.email,
    phone: cleanText(payload.phone),
    employee_id: cleanText(payload.employeeId),
    role_id: cleanText(payload.roleId),
    branch_id: branchId,
    data_access_scope: normalizeScope(payload.dataAccessScope ?? existingUser.data_access_scope),
    is_active: typeof payload.isActive === "boolean" ? payload.isActive : existingUser.is_active,
    allow_login: typeof payload.allowLogin === "boolean" ? payload.allowLogin : existingUser.allow_login,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin.from("users").update(updatePayload).eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (existingUser.auth_id) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.auth_id, {
      email: updatePayload.email,
      user_metadata: {
        username: updatePayload.username,
        first_name: updatePayload.first_name,
        last_name: updatePayload.last_name,
      },
      ban_duration: updatePayload.allow_login && updatePayload.is_active ? "none" : "876000h",
    });

    if (authUpdateError) {
      console.error("[users-management:update-auth]", authUpdateError.message);
    }
  }

  await logAuditEvent({
    userId: actor.profileId,
    branchId: updatePayload.branch_id ?? existingUser.branch_id,
    module: "users",
    action: "update",
    referenceType: "user",
    referenceId: userId,
    oldValues: existingUser,
    newValues: updatePayload,
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "User updated." });
}

async function setPermissionOverride(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>,
  request: NextRequest,
  body: { userId?: string; permissionId?: string; isAllowed?: boolean; clear?: boolean; notes?: string | null },
) {
  if (!hasAnyPermission(actor, "users:manage")) {
    return NextResponse.json({ error: "You do not have permission to edit the permission matrix." }, { status: 403 });
  }

  const userId = cleanText(body.userId);
  const permissionId = cleanText(body.permissionId);
  if (!userId || !permissionId) {
    return NextResponse.json({ error: "User and permission are required." }, { status: 400 });
  }

  if (body.clear) {
    const { error } = await supabaseAdmin
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("permission_id", permissionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      userId: actor.profileId,
      module: "users",
      action: "clear_permission_override",
      referenceType: "user",
      referenceId: userId,
      newValues: { permission_id: permissionId },
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ message: "Permission override removed." });
  }

  if (typeof body.isAllowed !== "boolean") {
    return NextResponse.json({ error: "Override state is required." }, { status: 400 });
  }

  const upsertResult = await supabaseAdmin.from("user_permission_overrides").upsert({
    user_id: userId,
    permission_id: permissionId,
    is_allowed: body.isAllowed,
    notes: cleanText(body.notes),
    created_by: actor.profileId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,permission_id" });

  if (upsertResult.error) {
    return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
  }

  await logAuditEvent({
    userId: actor.profileId,
    module: "users",
    action: "set_permission_override",
    referenceType: "user",
    referenceId: userId,
    newValues: { permission_id: permissionId, is_allowed: body.isAllowed, notes: cleanText(body.notes) },
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Permission override saved." });
}

async function updateSalesRestrictions(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>,
  request: NextRequest,
  body: { userId?: string; restrictions?: Partial<SalesRestrictions> },
) {
  if (!hasAnyPermission(actor, "users:manage", "users:edit")) {
    return NextResponse.json({ error: "You do not have permission to update sales restrictions." }, { status: 403 });
  }

  const userId = cleanText(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "User is required." }, { status: 400 });
  }

  const restrictions = body.restrictions ?? {};
  const payload = {
    user_id: userId,
    can_view_cost_price: typeof restrictions.can_view_cost_price === "boolean" ? restrictions.can_view_cost_price : null,
    can_apply_discount: typeof restrictions.can_apply_discount === "boolean" ? restrictions.can_apply_discount : null,
    can_void_sale: typeof restrictions.can_void_sale === "boolean" ? restrictions.can_void_sale : null,
    can_refund: typeof restrictions.can_refund === "boolean" ? restrictions.can_refund : null,
    can_edit_inventory: typeof restrictions.can_edit_inventory === "boolean" ? restrictions.can_edit_inventory : null,
    can_delete_product: typeof restrictions.can_delete_product === "boolean" ? restrictions.can_delete_product : null,
    can_approve_purchase_order: typeof restrictions.can_approve_purchase_order === "boolean" ? restrictions.can_approve_purchase_order : null,
    can_view_reports: typeof restrictions.can_view_reports === "boolean" ? restrictions.can_view_reports : null,
    allow_price_override: typeof restrictions.allow_price_override === "boolean" ? restrictions.allow_price_override : null,
    allow_negative_inventory: typeof restrictions.allow_negative_inventory === "boolean" ? restrictions.allow_negative_inventory : null,
    require_supervisor_for_discount: restrictions.require_supervisor_for_discount ?? false,
    require_supervisor_for_void: restrictions.require_supervisor_for_void ?? false,
    require_supervisor_for_refund: restrictions.require_supervisor_for_refund ?? false,
    discount_limit_percent: parseOptionalNumber(restrictions.discount_limit_percent),
    discount_limit_amount: parseOptionalNumber(restrictions.discount_limit_amount),
    max_refund_amount: parseOptionalNumber(restrictions.max_refund_amount),
    notes: cleanText(restrictions.notes),
    updated_by: actor.profileId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("user_sales_restrictions").upsert(payload, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAuditEvent({
    userId: actor.profileId,
    module: "users",
    action: "update_sales_restrictions",
    referenceType: "user",
    referenceId: userId,
    newValues: payload,
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Sales restrictions saved." });
}

async function setPin(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>,
  request: NextRequest,
  body: { userId?: string; pin?: string; clear?: boolean },
) {
  if (!hasAnyPermission(actor, "users:edit", "users:manage")) {
    return NextResponse.json({ error: "You do not have permission to manage cashier PINs." }, { status: 403 });
  }

  const userId = cleanText(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "User is required." }, { status: 400 });
  }

  if (!body.clear) {
    const policyResult = await supabaseAdmin.rpc("get_password_policy");
    if (policyResult.error) {
      return NextResponse.json({ error: policyResult.error.message }, { status: 500 });
    }

    const securityPolicy = normalizeSecurityPolicy((policyResult.data as Record<string, unknown> | null) ?? null);
    const pin = cleanText(body.pin) ?? "";
    if (!new RegExp(`^\\d{${securityPolicy.pin_length},8}$`).test(pin)) {
      return NextResponse.json({
        error: `PIN must be ${securityPolicy.pin_length} to 8 digits.`,
      }, { status: 400 });
    }
  }

  const rpcResult = body.clear
    ? await supabaseAdmin.rpc("clear_cashier_pin", { p_user_id: userId })
    : await supabaseAdmin.rpc("set_cashier_pin", { p_user_id: userId, p_pin: cleanText(body.pin) });

  if (rpcResult.error) {
    return NextResponse.json({ error: rpcResult.error.message }, { status: 500 });
  }

  await logAuditEvent({
    userId: actor.profileId,
    module: "users",
    action: body.clear ? "clear_pin" : "set_pin",
    referenceType: "user",
    referenceId: userId,
    ipAddress: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: body.clear ? "PIN cleared." : "PIN saved." });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasAnyPermission(actor, "users:view", "users:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const workspace = await loadWorkspace();
    return NextResponse.json({
      actor: {
        profileId: actor.profileId,
        roleName: actor.roleName,
        branchId: actor.branchId,
        permissions: Array.from(actor.permissions),
      },
      ...workspace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[users-management:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasAnyPermission(actor, "users:view", "users:manage", "users:edit", "users:create")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      createUser?: CreateUserPayload;
      updateUser?: UpdateUserPayload;
      userId?: string;
      permissionId?: string;
      isAllowed?: boolean;
      clear?: boolean;
      notes?: string | null;
      restrictions?: Partial<SalesRestrictions>;
      pin?: string;
    };

    switch (body.action) {
      case "create_user":
        return createUser(actor, request, body.createUser ?? {});
      case "update_user":
        return updateUser(actor, request, body.updateUser ?? {});
      case "set_permission_override":
        return setPermissionOverride(actor, request, body);
      case "update_sales_restrictions":
        return updateSalesRestrictions(actor, request, body);
      case "set_pin":
        return setPin(actor, request, body);
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[users-management:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

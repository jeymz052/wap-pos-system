import { supabaseAdmin } from "@/lib/supabase-admin";

export type PermissionKey = `${string}:${string}`;

export type SalesRestrictions = {
  can_view_cost_price: boolean | null;
  can_apply_discount: boolean | null;
  can_void_sale: boolean | null;
  can_refund: boolean | null;
  can_edit_inventory: boolean | null;
  can_delete_product: boolean | null;
  can_approve_purchase_order: boolean | null;
  can_view_reports: boolean | null;
  allow_price_override: boolean | null;
  allow_negative_inventory: boolean | null;
  require_supervisor_for_discount: boolean;
  require_supervisor_for_void: boolean;
  require_supervisor_for_refund: boolean;
  discount_limit_percent: number | null;
  discount_limit_amount: number | null;
  max_refund_amount: number | null;
  notes: string | null;
};

export type AccessProfile = {
  profileId: string;
  authUserId: string | null;
  roleId: string | null;
  roleName: string | null;
  branchId: string | null;
  dataAccessScope: string;
  isActive: boolean;
  allowLogin: boolean;
  permissions: Set<PermissionKey>;
  salesRestrictions: SalesRestrictions | null;
};

const restrictionPermissionMap = [
  { field: "can_view_cost_price", permission: "inventory:view_cost_price" },
  { field: "can_apply_discount", permission: "pos:apply_discount" },
  { field: "can_void_sale", permission: "pos:void" },
  { field: "can_refund", permission: "returns:refund" },
  { field: "can_edit_inventory", permission: "inventory:edit" },
  { field: "can_delete_product", permission: "inventory:delete" },
  { field: "can_approve_purchase_order", permission: "purchasing:approve" },
  { field: "can_view_reports", permission: "reports:view" },
] as const;

function isSchemaMismatchError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  const code = String(error?.code ?? "");
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  return (
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "42P01" ||
    code === "42703" ||
    message.includes("could not find a relationship") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function toPermissionKey(moduleName: string | null | undefined, action: string | null | undefined) {
  if (!moduleName || !action) return null;
  return `${moduleName}:${action}` as PermissionKey;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRestrictions(
  row:
    | {
        can_view_cost_price?: boolean | null;
        can_apply_discount?: boolean | null;
        can_void_sale?: boolean | null;
        can_refund?: boolean | null;
        can_edit_inventory?: boolean | null;
        can_delete_product?: boolean | null;
        can_approve_purchase_order?: boolean | null;
        can_view_reports?: boolean | null;
        allow_price_override?: boolean | null;
        allow_negative_inventory?: boolean | null;
        require_supervisor_for_discount?: boolean | null;
        require_supervisor_for_void?: boolean | null;
        require_supervisor_for_refund?: boolean | null;
        discount_limit_percent?: number | string | null;
        discount_limit_amount?: number | string | null;
        max_refund_amount?: number | string | null;
        notes?: string | null;
      }
    | null
    | undefined,
) {
  if (!row) return null;

  return {
    can_view_cost_price: row.can_view_cost_price ?? null,
    can_apply_discount: row.can_apply_discount ?? null,
    can_void_sale: row.can_void_sale ?? null,
    can_refund: row.can_refund ?? null,
    can_edit_inventory: row.can_edit_inventory ?? null,
    can_delete_product: row.can_delete_product ?? null,
    can_approve_purchase_order: row.can_approve_purchase_order ?? null,
    can_view_reports: row.can_view_reports ?? null,
    allow_price_override: row.allow_price_override ?? null,
    allow_negative_inventory: row.allow_negative_inventory ?? null,
    require_supervisor_for_discount: row.require_supervisor_for_discount ?? false,
    require_supervisor_for_void: row.require_supervisor_for_void ?? false,
    require_supervisor_for_refund: row.require_supervisor_for_refund ?? false,
    discount_limit_percent: parseNumber(row.discount_limit_percent),
    discount_limit_amount: parseNumber(row.discount_limit_amount),
    max_refund_amount: parseNumber(row.max_refund_amount),
    notes: row.notes?.trim() || null,
  } satisfies SalesRestrictions;
}

function applyRestrictionPermissions(permissions: Set<PermissionKey>, restrictions: SalesRestrictions | null) {
  if (!restrictions) return permissions;

  for (const mapping of restrictionPermissionMap) {
    const value = restrictions[mapping.field];
    if (value === true) {
      permissions.add(mapping.permission as PermissionKey);
    } else if (value === false) {
      permissions.delete(mapping.permission as PermissionKey);
    }
  }

  return permissions;
}

export async function getEffectivePermissionsForUser(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from("v_user_effective_permissions")
    .select("module, action")
    .eq("user_id", profileId);

  if (error && !isSchemaMismatchError(error)) throw error;

  if (error && isSchemaMismatchError(error)) {
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("role_id")
      .eq("id", profileId)
      .maybeSingle();

    if (userError) throw userError;

    const roleId = userRow?.role_id ?? null;
    const { data: roleRow, error: roleError } = roleId
      ? await supabaseAdmin.from("roles").select("name").eq("id", roleId).maybeSingle()
      : { data: null, error: null };

    if (roleError) throw roleError;

    const roleName = String(roleRow?.name ?? "").toLowerCase();

    if (roleName === "super_admin") {
      const { data: permissionsRows, error: permissionsError } = await supabaseAdmin
        .from("permissions")
        .select("module, action");

      if (permissionsError) throw permissionsError;

      const allPermissions = new Set<PermissionKey>();
      ((permissionsRows ?? []) as Array<{ module?: string | null; action?: string | null }>).forEach((row) => {
        const key = toPermissionKey(row.module, row.action);
        if (key) allPermissions.add(key);
      });

      return allPermissions;
    }

    if (!userRow?.role_id) {
      return new Set<PermissionKey>();
    }

    const { data: rolePermissionRows, error: rolePermissionsError } = await supabaseAdmin
      .from("role_permissions")
      .select("permission_id, is_allowed")
      .eq("role_id", userRow.role_id)
      .eq("is_allowed", true);

    if (rolePermissionsError) throw rolePermissionsError;

    const permissionIds = ((rolePermissionRows ?? []) as Array<{ permission_id?: string | null }>)
      .map((row) => row.permission_id)
      .filter((value): value is string => Boolean(value));

    if (!permissionIds.length) {
      return new Set<PermissionKey>();
    }

    const { data: permissionRows, error: permissionsError } = await supabaseAdmin
      .from("permissions")
      .select("id, module, action")
      .in("id", permissionIds);

    if (permissionsError) throw permissionsError;

    const fallbackPermissions = new Set<PermissionKey>();
    ((permissionRows ?? []) as Array<{ module?: string | null; action?: string | null }>).forEach((row) => {
      const key = toPermissionKey(row.module, row.action);
      if (key) fallbackPermissions.add(key);
    });

    return fallbackPermissions;
  }

  const permissions = new Set<PermissionKey>();
  ((data ?? []) as Array<{ module?: string | null; action?: string | null }>).forEach((row) => {
    const key = toPermissionKey(row.module, row.action);
    if (key) permissions.add(key);
  });

  return permissions;
}

export async function getAccessProfileByProfileId(profileId: string): Promise<AccessProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, auth_id, role_id, branch_id, data_access_scope, is_active, allow_login")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  const [{ data: roleRow, error: roleError }, { data: restrictionRow, error: restrictionError }] = await Promise.all([
    data.role_id
      ? supabaseAdmin.from("roles").select("name").eq("id", data.role_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("user_sales_restrictions")
      .select(`
        can_view_cost_price,
        can_apply_discount,
        can_void_sale,
        can_refund,
        can_edit_inventory,
        can_delete_product,
        can_approve_purchase_order,
        can_view_reports,
        allow_price_override,
        allow_negative_inventory,
        require_supervisor_for_discount,
        require_supervisor_for_void,
        require_supervisor_for_refund,
        discount_limit_percent,
        discount_limit_amount,
        max_refund_amount,
        notes
      `)
      .eq("user_id", profileId)
      .maybeSingle(),
  ]);

  if (roleError) throw roleError;
  if (restrictionError && !isSchemaMismatchError(restrictionError)) throw restrictionError;

  const salesRestrictions =
    restrictionError && isSchemaMismatchError(restrictionError)
      ? null
      : normalizeRestrictions(restrictionRow);
  const permissions = await getEffectivePermissionsForUser(profileId);

  return {
    profileId: data.id,
    authUserId: data.auth_id ?? null,
    roleId: data.role_id ?? null,
    roleName: roleRow?.name ?? null,
    branchId: data.branch_id ?? null,
    dataAccessScope: data.data_access_scope ?? "branch_only",
    isActive: data.is_active ?? true,
    allowLogin: data.allow_login ?? true,
    permissions: applyRestrictionPermissions(permissions, salesRestrictions),
    salesRestrictions,
  };
}

export async function getAccessProfileByAuthUserId(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return getAccessProfileByProfileId(data.id);
}

export function hasPermission(accessProfile: Pick<AccessProfile, "permissions" | "roleName">, permission: PermissionKey) {
  return accessProfile.roleName === "super_admin" || accessProfile.permissions.has(permission);
}

export function hasAnyPermission(accessProfile: Pick<AccessProfile, "permissions" | "roleName">, ...permissions: PermissionKey[]) {
  if (accessProfile.roleName === "super_admin") return true;
  return permissions.some((permission) => accessProfile.permissions.has(permission));
}

export function canAccessBranch(accessProfile: Pick<AccessProfile, "branchId" | "roleName" | "dataAccessScope">, branchId: string | null | undefined) {
  if (!branchId) return true;
  return (
    accessProfile.roleName === "super_admin" ||
    accessProfile.roleName === "admin" ||
    accessProfile.dataAccessScope === "all_data" ||
    accessProfile.branchId === branchId
  );
}

export async function logAuditEvent(input: {
  userId: string;
  branchId?: string | null;
  module: string;
  action: string;
  referenceType?: string | null;
  referenceId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { error } = await supabaseAdmin.rpc("log_audit_event", {
    p_user_id: input.userId,
    p_branch_id: input.branchId ?? null,
    p_module: input.module,
    p_action: input.action,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_old_values: input.oldValues ?? null,
    p_new_values: input.newValues ?? null,
    p_ip_address: input.ipAddress ?? null,
    p_user_agent: input.userAgent ?? null,
  });

  if (error) {
    console.error("[audit]", error.message);
  }
}

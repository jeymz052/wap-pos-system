"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hash,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserCog,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS } from "@/lib/rbac";
import { DEFAULT_POLICY, evaluatePassword, type PasswordPolicy } from "@/lib/auth-security";

type PermissionRow = {
  id: string;
  module: string;
  action: string;
  description: string | null;
};

type BranchRow = {
  id: string;
  name: string;
  code?: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
};

type RestrictionShape = {
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
  restriction_notes: string | null;
};

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string;
  email: string;
  phone: string | null;
  employee_id: string | null;
  role_id: string | null;
  role_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  data_access_scope: string | null;
  is_active: boolean | null;
  allow_login: boolean | null;
  two_factor_enabled: boolean | null;
  has_cashier_pin: boolean;
  last_login_at: string | null;
  created_at: string;
  effective_permissions: string[];
  permission_overrides: Record<string, { id: string; isAllowed: boolean; notes: string | null }>;
} & RestrictionShape;

type ActivityRow = {
  user_id: string;
  event_source: string;
  event_action: string;
  event_type: string;
  event_payload?: Record<string, unknown> | null;
  event_at: string;
};

type ToastState = { ok: boolean; message: string } | null;

type UpdateUserDraft = {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  employeeId: string;
  roleId: string;
  branchId: string;
  dataAccessScope: string;
  isActive: boolean;
  allowLogin: boolean;
};

const restrictionPermissionKeys = {
  can_view_cost_price: "inventory:view_cost_price",
  can_apply_discount: "pos:apply_discount",
  can_void_sale: "pos:void",
  can_refund: "returns:refund",
  can_edit_inventory: "inventory:edit",
  can_delete_product: "inventory:delete",
  can_approve_purchase_order: "purchasing:approve",
  can_view_reports: "reports:view",
} as const;

const emptyRestrictions: RestrictionShape = {
  can_view_cost_price: null,
  can_apply_discount: null,
  can_void_sale: null,
  can_refund: null,
  can_edit_inventory: null,
  can_delete_product: null,
  can_approve_purchase_order: null,
  can_view_reports: null,
  allow_price_override: null,
  allow_negative_inventory: null,
  require_supervisor_for_discount: false,
  require_supervisor_for_void: false,
  require_supervisor_for_refund: false,
  discount_limit_percent: null,
  discount_limit_amount: null,
  max_refund_amount: null,
  restriction_notes: null,
};

function formatRole(name: string | null | undefined) {
  if (!name) return "No role";
  return ROLE_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function normalizeUser(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id),
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    last_name: typeof row.last_name === "string" ? row.last_name : null,
    username: String(row.username ?? ""),
    email: String(row.email ?? ""),
    phone: typeof row.phone === "string" ? row.phone : null,
    employee_id: typeof row.employee_id === "string" ? row.employee_id : null,
    role_id: typeof row.role_id === "string" ? row.role_id : null,
    role_name: typeof row.role_name === "string" ? row.role_name : null,
    branch_id: typeof row.branch_id === "string" ? row.branch_id : null,
    branch_name: typeof row.branch_name === "string" ? row.branch_name : null,
    data_access_scope: typeof row.data_access_scope === "string" ? row.data_access_scope : "branch_only",
    is_active: row.is_active !== false,
    allow_login: row.allow_login !== false,
    two_factor_enabled: Boolean(row.two_factor_enabled),
    has_cashier_pin: Boolean(row.has_cashier_pin),
    last_login_at: typeof row.last_login_at === "string" ? row.last_login_at : null,
    created_at: String(row.created_at ?? ""),
    effective_permissions: Array.isArray(row.effective_permissions) ? row.effective_permissions.map(String) : [],
    permission_overrides: (row.permission_overrides as UserRow["permission_overrides"]) ?? {},
    can_view_cost_price: (row.can_view_cost_price as boolean | null) ?? null,
    can_apply_discount: (row.can_apply_discount as boolean | null) ?? null,
    can_void_sale: (row.can_void_sale as boolean | null) ?? null,
    can_refund: (row.can_refund as boolean | null) ?? null,
    can_edit_inventory: (row.can_edit_inventory as boolean | null) ?? null,
    can_delete_product: (row.can_delete_product as boolean | null) ?? null,
    can_approve_purchase_order: (row.can_approve_purchase_order as boolean | null) ?? null,
    can_view_reports: (row.can_view_reports as boolean | null) ?? null,
    allow_price_override: (row.allow_price_override as boolean | null) ?? null,
    allow_negative_inventory: (row.allow_negative_inventory as boolean | null) ?? null,
    require_supervisor_for_discount: Boolean(row.require_supervisor_for_discount),
    require_supervisor_for_void: Boolean(row.require_supervisor_for_void),
    require_supervisor_for_refund: Boolean(row.require_supervisor_for_refund),
    discount_limit_percent: row.discount_limit_percent === null ? null : Number(row.discount_limit_percent ?? null),
    discount_limit_amount: row.discount_limit_amount === null ? null : Number(row.discount_limit_amount ?? null),
    max_refund_amount: row.max_refund_amount === null ? null : Number(row.max_refund_amount ?? null),
    restriction_notes: typeof row.restriction_notes === "string" ? row.restriction_notes : null,
  };
}

export default function UsersRolesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [securityPolicy, setSecurityPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const selectedUserIdRef = useRef("");
  const [pinValue, setPinValue] = useState("");
  const [pinMode, setPinMode] = useState<"set" | "clear" | null>(null);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    employeeId: "",
    password: "",
    roleId: "",
    branchId: "",
    dataAccessScope: "branch_only",
  });
  const [draftUser, setDraftUser] = useState<UpdateUserDraft | null>(null);
  const [draftRestrictions, setDraftRestrictions] = useState<RestrictionShape>(emptyRestrictions);

  function selectUser(user: UserRow | null) {
    if (!user) {
      setSelectedUserId("");
      selectedUserIdRef.current = "";
      setDraftUser(null);
      setDraftRestrictions(emptyRestrictions);
      return;
    }

    setSelectedUserId(user.id);
    selectedUserIdRef.current = user.id;
    setDraftUser({
      userId: user.id,
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      username: user.username,
      email: user.email,
      phone: user.phone ?? "",
      employeeId: user.employee_id ?? "",
      roleId: user.role_id ?? "",
      branchId: user.branch_id ?? "",
      dataAccessScope: user.data_access_scope ?? "branch_only",
      isActive: user.is_active !== false,
      allowLogin: user.allow_login !== false,
    });
    setDraftRestrictions({
      ...emptyRestrictions,
      ...user,
    });
  }

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/users-management", {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });

    const payload = (await response.json()) as {
      users?: Record<string, unknown>[];
      roles?: RoleRow[];
      branches?: BranchRow[];
      permissions?: PermissionRow[];
      activities?: ActivityRow[];
      securityPolicy?: PasswordPolicy;
      error?: string;
    };

    if (!response.ok) {
      setToast({ ok: false, message: payload.error ?? "Unable to load user management." });
      setLoading(false);
      return;
    }

    const nextUsers = (payload.users ?? []).map(normalizeUser);
    setUsers(nextUsers);
    setRoles(payload.roles ?? []);
    setBranches(payload.branches ?? []);
    setPermissions(payload.permissions ?? []);
    setActivities(payload.activities ?? []);
    setSecurityPolicy(payload.securityPolicy ?? DEFAULT_POLICY);
    const preservedUser = nextUsers.find((user) => user.id === selectedUserIdRef.current) ?? nextUsers[0] ?? null;
    selectUser(preservedUser);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [
        user.first_name,
        user.last_name,
        user.username,
        user.email,
        user.role_name,
        user.branch_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [search, users]);

  const selectedActivities = useMemo(
    () => activities.filter((item) => item.user_id === selectedUserId).slice(0, 12),
    [activities, selectedUserId],
  );

  async function postAction(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/users-management", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    setSaving(false);

    if (!response.ok) {
      setToast({ ok: false, message: payload.error ?? "Request failed." });
      return false;
    }

    setToast({ ok: true, message: payload.message ?? successMessage });
    await loadWorkspace();
    return true;
  }

  async function handleCreateUser() {
    const passwordIssues = evaluatePassword(createForm.password, securityPolicy).issues;
    if (passwordIssues.length > 0) {
      setToast({ ok: false, message: `Temporary password requirements: ${passwordIssues.join(", ")}.` });
      return;
    }

    const created = await postAction({ action: "create_user", createUser: createForm }, "Staff account created.");
    if (created) {
      setCreateForm({
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        phone: "",
        employeeId: "",
        password: "",
        roleId: "",
        branchId: "",
        dataAccessScope: "branch_only",
      });
    }
  }

  async function handleSaveUser() {
    if (!draftUser) return;
    await postAction({ action: "update_user", updateUser: draftUser }, "User updated.");
  }

  async function handleSaveRestrictions() {
    if (!selectedUser) return;
    await postAction(
      { action: "update_sales_restrictions", userId: selectedUser.id, restrictions: draftRestrictions },
      "Sales restrictions updated.",
    );
  }

  async function handlePermissionChange(permissionId: string, value: string) {
    if (!selectedUser) return;
    if (value === "inherit") {
      await postAction(
        { action: "set_permission_override", userId: selectedUser.id, permissionId, clear: true },
        "Permission override removed.",
      );
      return;
    }

    await postAction(
      {
        action: "set_permission_override",
        userId: selectedUser.id,
        permissionId,
        isAllowed: value === "allow",
      },
      "Permission override updated.",
    );
  }

  async function handlePinAction() {
    if (!selectedUser || !pinMode) return;
    if (pinMode === "set" && !new RegExp(`^\\d{${securityPolicy.pin_length},8}$`).test(pinValue)) {
      setToast({ ok: false, message: `PIN must be ${securityPolicy.pin_length} to 8 digits.` });
      return;
    }

    const ok = await postAction(
      { action: "set_pin", userId: selectedUser.id, pin: pinMode === "set" ? pinValue : undefined, clear: pinMode === "clear" },
      pinMode === "set" ? "PIN saved." : "PIN cleared.",
    );

    if (ok) {
      setPinMode(null);
      setPinValue("");
    }
  }

  return (
    <div className="ur-page">
      <div className="ur-page__header">
        <div className="ur-page__header-left">
          <UserCog size={22} className="ur-page__header-icon" />
          <div>
            <h2 className="ur-page__title">User Management & Permissions</h2>
            <p className="ur-page__sub">Create staff accounts, assign branches and roles, control permissions, set cashier PINs, and review activity logs.</p>
          </div>
        </div>
        <button className="ur-btn ur-btn--seed" onClick={() => void loadWorkspace()} disabled={loading || saving}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>

      <div className="ur-page__card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="login-form__field">
            <span className="login-form__label">First Name</span>
            <input value={createForm.firstName} onChange={(event) => setCreateForm((current) => ({ ...current, firstName: event.target.value }))} />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Last Name</span>
            <input value={createForm.lastName} onChange={(event) => setCreateForm((current) => ({ ...current, lastName: event.target.value }))} />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Username</span>
            <input value={createForm.username} onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Email</span>
            <input value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Temp Password</span>
            <input type="password" value={createForm.password} onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))} />
            {createForm.password ? (
              <small style={{ color: "#64748b" }}>
                {evaluatePassword(createForm.password, securityPolicy).issues.length === 0
                  ? "Password meets current policy."
                  : `Needs: ${evaluatePassword(createForm.password, securityPolicy).issues.join(", ")}`}
              </small>
            ) : (
              <small style={{ color: "#64748b" }}>
                Policy: {securityPolicy.password_min_length}+ chars
                {securityPolicy.password_require_uppercase ? ", uppercase" : ""}
                {securityPolicy.password_require_number ? ", number" : ""}
                {securityPolicy.password_require_symbol ? ", symbol" : ""}
              </small>
            )}
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Role</span>
            <select value={createForm.roleId} onChange={(event) => setCreateForm((current) => ({ ...current, roleId: event.target.value }))}>
              <option value="">Select role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{formatRole(role.name)}</option>
              ))}
            </select>
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Branch</span>
            <select value={createForm.branchId} onChange={(event) => setCreateForm((current) => ({ ...current, branchId: event.target.value }))}>
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Phone</span>
            <input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="login-form__field">
            <span className="login-form__label">Employee ID</span>
            <input value={createForm.employeeId} onChange={(event) => setCreateForm((current) => ({ ...current, employeeId: event.target.value }))} />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="login-form__submit" onClick={() => void handleCreateUser()} disabled={saving}>
            <Plus size={14} /> Create Staff Account
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(340px, 1.05fr) minmax(360px, 1fr)" }}>
        <section className="ur-page__card">
          <div className="ur-page__toolbar" style={{ marginBottom: 12 }}>
            <div className="ur-page__search">
              <Search size={14} />
              <input placeholder="Search users, roles, or branches..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <span className="ur-page__count">{filteredUsers.length} users</span>
          </div>

          <div className="ur-page__table-wrap">
            <table className="ur-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Login</th>
                  <th>PIN</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => selectUser(user)}
                    style={{ cursor: "pointer", background: user.id === selectedUserId ? "rgba(37,99,235,.06)" : undefined }}
                  >
                    <td>
                      <div className="ur-table__user">
                        <div className="ur-table__avatar">{(user.first_name?.[0] ?? user.username[0] ?? "U").toUpperCase()}</div>
                        <div>
                          <div className="ur-table__name">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}</div>
                          <div className="ur-table__email">{user.username} · {user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{formatRole(user.role_name)}</td>
                    <td>{user.branch_name ?? "All branches"}</td>
                    <td>{user.is_active !== false ? "Active" : "Inactive"}</td>
                    <td>{user.allow_login !== false ? "Allowed" : "Blocked"}</td>
                    <td>{user.has_cashier_pin ? "Set" : "Not set"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ur-page__card">
          {!selectedUser || !draftUser ? (
            <div className="ur-page__empty">Select a user to manage profile settings, permissions, restrictions, and activity.</div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>{[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(" ") || selectedUser.username}</h3>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
                  Last login: {formatDate(selectedUser.last_login_at)} · 2FA {selectedUser.two_factor_enabled ? "enabled" : "disabled"}
                </p>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                <label className="login-form__field"><span className="login-form__label">First Name</span><input value={draftUser.firstName} onChange={(event) => setDraftUser((current) => current ? { ...current, firstName: event.target.value } : current)} /></label>
                <label className="login-form__field"><span className="login-form__label">Last Name</span><input value={draftUser.lastName} onChange={(event) => setDraftUser((current) => current ? { ...current, lastName: event.target.value } : current)} /></label>
                <label className="login-form__field"><span className="login-form__label">Username</span><input value={draftUser.username} onChange={(event) => setDraftUser((current) => current ? { ...current, username: event.target.value } : current)} /></label>
                <label className="login-form__field"><span className="login-form__label">Email</span><input value={draftUser.email} onChange={(event) => setDraftUser((current) => current ? { ...current, email: event.target.value } : current)} /></label>
                <label className="login-form__field"><span className="login-form__label">Phone</span><input value={draftUser.phone} onChange={(event) => setDraftUser((current) => current ? { ...current, phone: event.target.value } : current)} /></label>
                <label className="login-form__field"><span className="login-form__label">Employee ID</span><input value={draftUser.employeeId} onChange={(event) => setDraftUser((current) => current ? { ...current, employeeId: event.target.value } : current)} /></label>
                <label className="login-form__field">
                  <span className="login-form__label">Role</span>
                  <select value={draftUser.roleId} onChange={(event) => setDraftUser((current) => current ? { ...current, roleId: event.target.value } : current)}>
                    <option value="">No role</option>
                    {roles.map((role) => <option key={role.id} value={role.id}>{formatRole(role.name)}</option>)}
                  </select>
                </label>
                <label className="login-form__field">
                  <span className="login-form__label">Branch</span>
                  <select value={draftUser.branchId} onChange={(event) => setDraftUser((current) => current ? { ...current, branchId: event.target.value } : current)}>
                    <option value="">All branches</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <label><input type="checkbox" checked={draftUser.isActive} onChange={(event) => setDraftUser((current) => current ? { ...current, isActive: event.target.checked } : current)} /> Active</label>
                <label><input type="checkbox" checked={draftUser.allowLogin} onChange={(event) => setDraftUser((current) => current ? { ...current, allowLogin: event.target.checked } : current)} /> Allow login</label>
                <button className="login-form__submit" onClick={() => void handleSaveUser()} disabled={saving}>
                  <CheckCircle2 size={14} /> Save Profile
                </button>
                <button className="login-form__submit" style={{ background: "#2563eb" }} onClick={() => setPinMode("set")} disabled={saving}>
                  <Hash size={14} /> {selectedUser.has_cashier_pin ? "Change PIN" : "Set PIN"}
                </button>
                {selectedUser.has_cashier_pin ? (
                  <button className="login-form__submit" style={{ background: "#dc2626" }} onClick={() => setPinMode("clear")} disabled={saving}>
                    <XCircle size={14} /> Clear PIN
                  </button>
                ) : null}
              </div>

              {pinMode ? (
                <div style={{ border: "1px solid #dbeafe", background: "#eff6ff", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong>{pinMode === "set" ? "Set cashier PIN" : "Clear cashier PIN"}</strong>
                    <button type="button" onClick={() => { setPinMode(null); setPinValue(""); }} style={{ background: "transparent", border: 0, cursor: "pointer" }}>Close</button>
                  </div>
                  {pinMode === "set" ? (
                    <input
                      type="password"
                      value={pinValue}
                      inputMode="numeric"
                      maxLength={8}
                      placeholder={`${securityPolicy.pin_length} to 8 digits`}
                      onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ""))}
                      style={{ width: "100%", marginBottom: 10 }}
                    />
                  ) : (
                    <p style={{ margin: "0 0 10px", color: "#475569" }}>This removes quick cashier PIN login for this user.</p>
                  )}
                  <button className="login-form__submit" onClick={() => void handlePinAction()} disabled={saving}>
                    <Lock size={14} /> Confirm
                  </button>
                </div>
              ) : null}

              <div>
                <h4 style={{ margin: "0 0 8px" }}>Permission Matrix</h4>
                <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                  <table className="ur-table">
                    <thead>
                      <tr>
                        <th>Permission</th>
                        <th>Effective</th>
                        <th>Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permissions.map((permission) => {
                        const key = `${permission.module}:${permission.action}`;
                        const effective = selectedUser.effective_permissions.includes(key);
                        const override = selectedUser.permission_overrides[permission.id];
                        return (
                          <tr key={permission.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{permission.module}:{permission.action}</div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>{permission.description}</div>
                            </td>
                            <td>{effective ? "Allowed" : "Blocked"}</td>
                            <td>
                              <select value={override ? (override.isAllowed ? "allow" : "deny") : "inherit"} onChange={(event) => void handlePermissionChange(permission.id, event.target.value)}>
                                <option value="inherit">Inherit role</option>
                                <option value="allow">Force allow</option>
                                <option value="deny">Force deny</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px" }}>Sales Restriction Settings</h4>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  {Object.entries(restrictionPermissionKeys).map(([field, permissionKey]) => (
                    <label key={field} className="login-form__field">
                      <span className="login-form__label">{permissionKey}</span>
                      <select
                        value={draftRestrictions[field as keyof typeof restrictionPermissionKeys] === null ? "inherit" : draftRestrictions[field as keyof typeof restrictionPermissionKeys] ? "allow" : "deny"}
                        onChange={(event) => setDraftRestrictions((current) => ({
                          ...current,
                          [field]:
                            event.target.value === "inherit"
                              ? null
                              : event.target.value === "allow",
                        }))}
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </label>
                  ))}
                  <label className="login-form__field"><span className="login-form__label">Discount Limit %</span><input value={draftRestrictions.discount_limit_percent ?? ""} onChange={(event) => setDraftRestrictions((current) => ({ ...current, discount_limit_percent: event.target.value ? Number(event.target.value) : null }))} /></label>
                  <label className="login-form__field"><span className="login-form__label">Discount Limit Amount</span><input value={draftRestrictions.discount_limit_amount ?? ""} onChange={(event) => setDraftRestrictions((current) => ({ ...current, discount_limit_amount: event.target.value ? Number(event.target.value) : null }))} /></label>
                  <label className="login-form__field"><span className="login-form__label">Max Refund Amount</span><input value={draftRestrictions.max_refund_amount ?? ""} onChange={(event) => setDraftRestrictions((current) => ({ ...current, max_refund_amount: event.target.value ? Number(event.target.value) : null }))} /></label>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                  <label><input type="checkbox" checked={draftRestrictions.require_supervisor_for_discount} onChange={(event) => setDraftRestrictions((current) => ({ ...current, require_supervisor_for_discount: event.target.checked }))} /> Require supervisor for discount</label>
                  <label><input type="checkbox" checked={draftRestrictions.require_supervisor_for_void} onChange={(event) => setDraftRestrictions((current) => ({ ...current, require_supervisor_for_void: event.target.checked }))} /> Require supervisor for void</label>
                  <label><input type="checkbox" checked={draftRestrictions.require_supervisor_for_refund} onChange={(event) => setDraftRestrictions((current) => ({ ...current, require_supervisor_for_refund: event.target.checked }))} /> Require supervisor for refund</label>
                  <label><input type="checkbox" checked={draftRestrictions.allow_price_override === true} onChange={(event) => setDraftRestrictions((current) => ({ ...current, allow_price_override: event.target.checked }))} /> Allow price override</label>
                  <label><input type="checkbox" checked={draftRestrictions.allow_negative_inventory === true} onChange={(event) => setDraftRestrictions((current) => ({ ...current, allow_negative_inventory: event.target.checked }))} /> Allow negative inventory</label>
                </div>
                <label className="login-form__field" style={{ marginTop: 10 }}>
                  <span className="login-form__label">Restriction Notes</span>
                  <textarea value={draftRestrictions.restriction_notes ?? ""} onChange={(event) => setDraftRestrictions((current) => ({ ...current, restriction_notes: event.target.value }))} rows={3} />
                </label>
                <button className="login-form__submit" onClick={() => void handleSaveRestrictions()} disabled={saving}>
                  <Shield size={14} /> Save Restrictions
                </button>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px" }}>Activity Logs</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {selectedActivities.length ? selectedActivities.map((activity, index) => (
                    <div key={`${activity.event_source}-${index}`} style={{ padding: 12, border: "1px solid #e2e8f0", borderRadius: 12 }}>
                      <div style={{ fontWeight: 700 }}>{activity.event_source} · {activity.event_type}</div>
                      <div style={{ fontSize: 13, color: "#475569" }}>{activity.event_action}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{formatDate(activity.event_at)}</div>
                    </div>
                  )) : (
                    <div className="ur-page__empty">No recent activity for this user.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {toast ? (
        <div className={`ur-toast ${toast.ok ? "ur-toast--ok" : "ur-toast--err"}`} style={{ position: "fixed", right: 18, bottom: 18, zIndex: 50 }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

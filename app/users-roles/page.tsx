"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, CheckCircle, ChevronDown, Hash, Lock,
  Plus, RefreshCw, Search, Shield, Trash2, User,
  UserCheck, UserCog, UserX, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRbac } from "@/components/RbacProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  allow_login: boolean;
  cashier_pin_hash: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  roles: { id: string; name: string; display_name: string } | null;
  branches: { id: string; name: string } | null;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
}

// ─── Toast helper ─────────────────────────────────────────────────────────────

type Toast = { id: number; ok: boolean; msg: string };

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersRolesPage() {
  const { role: callerRole } = useRbac();
  const isAdmin = callerRole?.name === "super_admin" || callerRole?.name === "admin";

  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [roles,    setRoles]    = useState<Role[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [toasts,   setToasts]   = useState<Toast[]>([]);
  const [toastId,  setToastId]  = useState(0);

  // Modals
  const [pinModal,     setPinModal]     = useState<UserRow | null>(null);
  const [pinValue,     setPinValue]     = useState("");
  const [pinLoading,   setPinLoading]   = useState(false);
  const [pinConfirm,   setPinConfirm]   = useState("");
  const [clearTarget,  setClearTarget]  = useState<UserRow | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────

  const toast = (ok: boolean, msg: string) => {
    const id = toastId + 1;
    setToastId(id);
    setToasts(t => [...t, { id, ok, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("users")
      .select(`
        id, username, first_name, last_name, email,
        is_active, allow_login, cashier_pin_hash, two_factor_enabled, created_at,
        roles(id, name, display_name),
        branches(id, name)
      `)
      .order("created_at", { ascending: false });

    setUsers((data ?? []) as unknown as UserRow[]);
    setLoading(false);
  }, []);

  const loadRoles = useCallback(async () => {
    const { data } = await supabase
      .from("roles")
      .select("id, name, display_name")
      .order("name");
    setRoles((data ?? []) as Role[]);
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadRoles();
  }, [loadUsers, loadRoles]);

  // ── Toggle active ─────────────────────────────────────────────────────────

  const toggleActive = async (u: UserRow) => {
    const { error } = await supabase
      .from("users")
      .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
      .eq("id", u.id);

    if (error) { toast(false, "Failed to update status."); return; }
    toast(true, `${u.username} ${!u.is_active ? "activated" : "deactivated"}.`);
    void loadUsers();
  };

  // ── Toggle allow_login ────────────────────────────────────────────────────

  const toggleLogin = async (u: UserRow) => {
    const { error } = await supabase
      .from("users")
      .update({ allow_login: !u.allow_login, updated_at: new Date().toISOString() })
      .eq("id", u.id);

    if (error) { toast(false, "Failed to update login access."); return; }
    toast(true, `Login ${!u.allow_login ? "enabled" : "disabled"} for ${u.username}.`);
    void loadUsers();
  };

  // ── Change role ───────────────────────────────────────────────────────────

  const changeRole = async (u: UserRow, roleId: string) => {
    const { error } = await supabase
      .from("users")
      .update({ role_id: roleId, updated_at: new Date().toISOString() })
      .eq("id", u.id);

    if (error) { toast(false, "Failed to update role."); return; }
    const roleName = roles.find(r => r.id === roleId)?.display_name ?? roleId;
    toast(true, `${u.username} → ${roleName}`);
    void loadUsers();
  };

  // ── Set PIN ───────────────────────────────────────────────────────────────

  const handleSetPin = async () => {
    if (!pinModal) return;
    if (!/^\d{4,8}$/.test(pinValue)) {
      toast(false, "PIN must be 4–8 digits only."); return;
    }
    if (pinValue !== pinConfirm) {
      toast(false, "PINs do not match."); return;
    }

    setPinLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/auth/set-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: pinModal.id, pin: pinValue, action: "set" }),
    });
    const json = await res.json() as { ok?: boolean; error?: string; message?: string };
    if (!res.ok || !json.ok) {
      toast(false, json.error ?? "Failed to set PIN.");
    } else {
      toast(true, json.message ?? "PIN set successfully.");
      setPinModal(null);
      setPinValue("");
      setPinConfirm("");
      void loadUsers();
    }
    setPinLoading(false);
  };

  // ── Clear PIN ─────────────────────────────────────────────────────────────

  const handleClearPin = async (u: UserRow) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/auth/set-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: u.id, action: "clear" }),
    });
    const json = await res.json() as { ok?: boolean; error?: string; message?: string };
    if (!res.ok || !json.ok) {
      toast(false, json.error ?? "Failed to clear PIN.");
    } else {
      toast(true, `PIN cleared for ${u.username}.`);
      setClearTarget(null);
      void loadUsers();
    }
  };

  // ── Filtered users ────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.roles?.display_name?.toLowerCase().includes(q)
    );
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const roleBadge = (roleName: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      super_admin: { bg: "rgba(168,85,247,.12)", color: "#9333ea" },
      admin:       { bg: "rgba(59,130,246,.12)",  color: "#2563eb" },
      manager:     { bg: "rgba(16,185,129,.12)",  color: "#059669" },
      cashier:     { bg: "rgba(245,158,11,.12)",  color: "#d97706" },
      stock_clerk: { bg: "rgba(100,116,139,.12)", color: "#475569" },
    };
    const s = map[roleName] ?? { bg: "rgba(148,163,184,.12)", color: "#64748b" };
    return (
      <span style={{
        background: s.bg, color: s.color,
        borderRadius: 6, padding: "2px 9px",
        fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      }}>
        {roleName.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
      </span>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="ur-page">

      {/* Header */}
      <div className="ur-page__header">
        <div className="ur-page__header-left">
          <UserCog size={22} className="ur-page__header-icon" />
          <div>
            <h2 className="ur-page__title">Users &amp; Roles</h2>
            <p className="ur-page__sub">Manage accounts, roles, login access and cashier PINs</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="ur-page__toolbar">
        <div className="ur-page__search">
          <Search size={14} />
          <input
            id="input-user-search"
            type="text"
            placeholder="Search by name, email, username or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="ur-page__search-clear">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="ur-page__count">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="ur-page__card">
        {loading ? (
          <div className="ur-page__loading"><RefreshCw size={18} className="spin" /> Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="ur-page__empty">No users found.</div>
        ) : (
          <div className="ur-page__table-wrap">
            <table className="ur-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Login</th>
                  <th>2FA</th>
                  <th>PIN</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    {/* User */}
                    <td>
                      <div className="ur-table__user">
                        <div className="ur-table__avatar">
                          {(u.first_name?.[0] ?? u.username?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div>
                          <div className="ur-table__name">
                            {u.first_name} {u.last_name}
                          </div>
                          <div className="ur-table__email">{u.username} · {u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td>
                      {isAdmin ? (
                        <div className="ur-table__role-select">
                          <select
                            id={`select-role-${u.id}`}
                            value={u.roles?.id ?? ""}
                            onChange={e => changeRole(u, e.target.value)}
                            className="ur-table__select"
                          >
                            <option value="" disabled>No role</option>
                            {roles.map(r => (
                              <option key={r.id} value={r.id}>{r.display_name}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="ur-table__select-icon" />
                        </div>
                      ) : (
                        roleBadge(u.roles?.name ?? "")
                      )}
                    </td>

                    {/* Branch */}
                    <td className="ur-table__branch">
                      {u.branches?.name ?? <span style={{ color: "#94a3b8" }}>All</span>}
                    </td>

                    {/* Active status */}
                    <td>
                      <button
                        id={`btn-toggle-active-${u.id}`}
                        className={`ur-table__pill ${u.is_active ? "ur-table__pill--green" : "ur-table__pill--red"}`}
                        onClick={() => isAdmin && toggleActive(u)}
                        disabled={!isAdmin}
                        title={isAdmin ? "Click to toggle" : ""}
                      >
                        {u.is_active ? <UserCheck size={11} /> : <UserX size={11} />}
                        {u.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>

                    {/* Allow login */}
                    <td>
                      <button
                        id={`btn-toggle-login-${u.id}`}
                        className={`ur-table__pill ${u.allow_login ? "ur-table__pill--blue" : "ur-table__pill--gray"}`}
                        onClick={() => isAdmin && toggleLogin(u)}
                        disabled={!isAdmin}
                        title={isAdmin ? "Click to toggle" : ""}
                      >
                        {u.allow_login ? <Lock size={11} /> : <X size={11} />}
                        {u.allow_login ? "Allowed" : "Blocked"}
                      </button>
                    </td>

                    {/* 2FA */}
                    <td>
                      <span className={`ur-table__pill ur-table__pill--static ${u.two_factor_enabled ? "ur-table__pill--green" : "ur-table__pill--gray"}`}>
                        <Shield size={11} />
                        {u.two_factor_enabled ? "On" : "Off"}
                      </span>
                    </td>

                    {/* PIN */}
                    <td>
                      {u.cashier_pin_hash ? (
                        <span className="ur-table__pill ur-table__pill--static ur-table__pill--green">
                          <Hash size={11} /> Set
                        </span>
                      ) : (
                        <span className="ur-table__pill ur-table__pill--static ur-table__pill--gray">
                          <Hash size={11} /> Not Set
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td>
                        <div className="ur-table__actions">
                          <button
                            id={`btn-set-pin-${u.id}`}
                            className="ur-table__action-btn ur-table__action-btn--pin"
                            onClick={() => { setPinModal(u); setPinValue(""); setPinConfirm(""); }}
                            title="Set cashier PIN"
                          >
                            <Hash size={13} />
                            {u.cashier_pin_hash ? "Change PIN" : "Set PIN"}
                          </button>
                          {u.cashier_pin_hash && (
                            <button
                              id={`btn-clear-pin-${u.id}`}
                              className="ur-table__action-btn ur-table__action-btn--danger"
                              onClick={() => setClearTarget(u)}
                              title="Remove PIN"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Set PIN Modal ─────────────────────────────────────────────────── */}
      {pinModal && (
        <div className="auth-modal__backdrop" role="dialog" aria-modal="true">
          <div className="auth-modal" style={{ textAlign: "left" }}>
            <button className="auth-modal__close" onClick={() => setPinModal(null)}><X size={16} /></button>

            <div className="auth-modal__icon auth-modal__icon--blue" style={{ marginBottom: 14 }}>
              <Hash size={26} />
            </div>
            <h3 className="auth-modal__title" style={{ textAlign: "center" }}>
              {pinModal.cashier_pin_hash ? "Change PIN" : "Set Cashier PIN"}
            </h3>
            <p style={{ textAlign: "center", color: "#64748b", fontSize: 12.5, marginBottom: 20 }}>
              Setting PIN for <strong>{pinModal.first_name} {pinModal.last_name}</strong>
              {" "}(<code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>{pinModal.username}</code>)
            </p>

            <div className="login-form__field" style={{ marginBottom: 14 }}>
              <span className="login-form__label">New PIN (4–8 digits)</span>
              <div className="login-form__input-wrap">
                <Hash size={15} className="login-form__icon" />
                <input
                  id="input-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••"
                  value={pinValue}
                  onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))}
                  disabled={pinLoading}
                  autoFocus
                />
              </div>
            </div>

            <div className="login-form__field" style={{ marginBottom: 20 }}>
              <span className="login-form__label">Confirm PIN</span>
              <div className="login-form__input-wrap">
                <Hash size={15} className="login-form__icon" />
                <input
                  id="input-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                  disabled={pinLoading}
                />
              </div>
              {pinConfirm && pinValue !== pinConfirm && (
                <p className="reset-pw__mismatch">PINs do not match.</p>
              )}
            </div>

            <button
              id="btn-confirm-set-pin"
              className="login-form__submit"
              disabled={pinLoading || pinValue.length < 4 || pinValue !== pinConfirm}
              onClick={handleSetPin}
            >
              {pinLoading ? <RefreshCw size={15} className="spin" /> : <CheckCircle size={15} />}
              <span>{pinLoading ? "Saving…" : "Save PIN"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Clear PIN Confirm ─────────────────────────────────────────────── */}
      {clearTarget && (
        <div className="auth-modal__backdrop" role="dialog" aria-modal="true">
          <div className="auth-modal">
            <div className="auth-modal__icon auth-modal__icon--amber">
              <AlertTriangle size={26} />
            </div>
            <h3 className="auth-modal__title">Remove PIN?</h3>
            <p className="auth-modal__body">
              This will remove the cashier PIN for <strong>{clearTarget.username}</strong>.
              They will no longer be able to log in via PIN.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                id="btn-confirm-clear-pin"
                className="login-form__submit"
                style={{ flex: 1, background: "#ef4444" }}
                onClick={() => handleClearPin(clearTarget)}
              >
                <Trash2 size={15} /> Remove PIN
              </button>
              <button
                className="login-form__submit"
                style={{ flex: 1, background: "#64748b" }}
                onClick={() => setClearTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast stack ───────────────────────────────────────────────────── */}
      <div className="ur-toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`ur-toast ${t.ok ? "ur-toast--ok" : "ur-toast--err"}`}>
            {t.ok ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

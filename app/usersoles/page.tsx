"use client";

import { useEffect, useState, useDeferredValue, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users, UserCheck, UserX, Shield, Key, Plus, Search,
  Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw,
  LogIn, Settings2, Activity, Filter, CheckCircle2, XCircle,
  Clock, Database, AlertCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoleRow = { id: string; name: string; description: string | null; is_system: boolean; created_at: string; };
type BranchRow = { id: string; name: string; is_main: boolean; };
type PermissionRow = { id: string; module: string; action: string; description: string | null; };
type RolePermRow = { id: string; role_id: string; permission_id: string; is_allowed: boolean; };
type LoginHistRow = { id: string; user_id: string; status: string; logged_in_at: string; };

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string;
  email: string;
  role_id: string | null;
  branch_id: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d?: string | null) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

function initials(u: UserRow) {
  const f = (u.first_name ?? "").trim();
  const l = (u.last_name ?? "").trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return u.username.slice(0, 2).toUpperCase();
}

function fullName(u: UserRow) {
  const f = (u.first_name ?? "").trim();
  const l = (u.last_name ?? "").trim();
  return [f, l].filter(Boolean).join(" ") || u.username;
}

function formatRole(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "#7c3aed", administrator: "#1d4ed8", admin: "#1d4ed8",
  cashier: "#15803d", inventory_staff: "#d97706",
  accountant: "#b45309", branch_staff: "#64748b",
};

function roleColor(name: string) {
  const key = name.toLowerCase().replace(/\s+/g, "_");
  return ROLE_COLORS[key] ?? "#64748b";
}

const ROLE_DOCS: Record<string, string> = {
  super_admin: "Full system access to all modules and settings",
  administrator: "Full access to all modules and settings",
  admin: "Manage staff, customers, receivables, payables, and daily operations",
  cashier: "Process sales and manage POS",
  inventory_staff: "Manage inventory and stock movements",
  accountant: "Manage reports, expenses, receivables, payables, and cash drawer reporting",
  branch_staff: "Access limited to assigned branch only",
};

function roleDesc(name: string, fallback: string | null) {
  const key = name.toLowerCase().replace(/\s+/g, "_");
  return ROLE_DOCS[key] ?? fallback ?? "—";
}

const AVATAR_COLORS: [string, string][] = [
  ["#eff6ff","#1d4ed8"],["#f0fdf4","#15803d"],["#fef3c7","#b45309"],
  ["#fdf4ff","#7e22ce"],["#fff1f2","#be123c"],["#f0fdfa","#0f766e"],
];

function avatarColor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? ["#f1f5f9", "#64748b"];
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function UsersRolesPage() {
  // ── State ────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermRow[]>([]);
  const [loginHist, setLoginHist] = useState<LoginHistRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{success?:boolean;msg?:string}|null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleTab, setRoleTab] = useState<"permissions"|"users"|"info">("permissions");
  const [permSearch, setPermSearch] = useState("");
  const [permModule, setPermModule] = useState("all");

  const deferredSearch = useDeferredValue(search);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    const [u, r, b, p, rp, lh] = await Promise.all([
      supabase.from("users").select("id,first_name,last_name,username,email,role_id,branch_id,is_active,created_at,updated_at").order("created_at",{ascending:false}),
      supabase.from("roles").select("id,name,description,is_system,created_at").order("name"),
      supabase.from("branches").select("id,name,is_main").eq("is_active",true).order("name"),
      supabase.from("permissions").select("id,module,action,description").order("module").order("action"),
      supabase.from("role_permissions").select("id,role_id,permission_id,is_allowed"),
      supabase.from("login_history").select("id,user_id,status,logged_in_at").order("logged_in_at",{ascending:false}).limit(200),
    ]);
    if (u.error||r.error||b.error) { setError(u.error?.message||r.error?.message||b.error?.message||"Failed to load"); setLoading(false); return; }
    setUsers((u.data??[]) as UserRow[]);
    setRoles((r.data??[]) as RoleRow[]);
    setBranches((b.data??[]) as BranchRow[]);
    setPermissions((p.data??[]) as PermissionRow[]);
    setRolePerms((rp.data??[]) as RolePermRow[]);
    setLoginHist((lh.data??[]) as LoginHistRow[]);
    if (r.data?.length) setSelectedRoleId((r.data as RoleRow[])[0].id);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadAll]);

  // ── Seed RBAC ─────────────────────────────────────────────────────────────
  async function seedRbac() {
    setSeeding(true);
    setSeedResult(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setSeedResult({ success: false, msg: "Please sign in again before seeding RBAC." });
        setSeeding(false);
        return;
      }

      const res = await fetch("/api/seed-rbac", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const json = await res.json() as { success?: boolean; roles?: number; permissions?: number; mappings?: number; error?: string };
      if (!res.ok || json.error) {
        setSeedResult({ success: false, msg: json.error ?? "Seed failed" });
      } else {
        setSeedResult({ success: true, msg: `✓ Seeded ${json.roles} roles, ${json.permissions} permissions, ${json.mappings} mappings.` });
        await loadAll();
      }
    } catch (e) {
      setSeedResult({ success: false, msg: e instanceof Error ? e.message : "Network error" });
    } finally {
      setSeeding(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const roleMap = new Map(roles.map(r => [r.id, r]));
  const branchMap = new Map(branches.map(b => [b.id, b]));
  const permMap = new Map(permissions.map(p => [p.id, p]));

  const activeUsers = users.filter(u => u.is_active !== false);
  const inactiveUsers = users.filter(u => u.is_active === false);
  const totalPerms = permissions.length;

  const needle = deferredSearch.trim().toLowerCase();
  const filtered = users.filter(u => {
    if (statusFilter !== "all" && (statusFilter === "active" ? !u.is_active : u.is_active !== false)) return false;
    if (roleFilter !== "all" && u.role_id !== roleFilter) return false;
    if (branchFilter !== "all" && u.branch_id !== branchFilter) return false;
    if (needle) {
      const name = fullName(u).toLowerCase();
      if (!name.includes(needle) && !u.email.toLowerCase().includes(needle) && !u.username.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage-1)*PAGE_SIZE, safePage*PAGE_SIZE);

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const selectedRolePerms = rolePerms.filter(rp => rp.role_id === selectedRoleId && rp.is_allowed);
  const selectedRolePermDetails = selectedRolePerms.map(rp => permMap.get(rp.permission_id)).filter(Boolean) as PermissionRow[];
  const selectedRoleUsers = users.filter(u => u.role_id === selectedRoleId);

  const permNeedle = permSearch.trim().toLowerCase();
  const filteredPerms = selectedRolePermDetails.filter(p => {
    if (permModule !== "all" && p.module !== permModule) return false;
    if (permNeedle && !p.module.includes(permNeedle) && !p.action.includes(permNeedle) && !(p.description??"").toLowerCase().includes(permNeedle)) return false;
    return true;
  });
  const permModules = Array.from(new Set(selectedRolePermDetails.map(p => p.module))).sort();
  const permPageSize = 10;
  const [permPage, setPermPage] = useState(1);
  const totalPermPages = Math.max(1, Math.ceil(filteredPerms.length / permPageSize));
  const pagedPerms = filteredPerms.slice((permPage-1)*permPageSize, permPage*permPageSize);

  const lastLoginMap = new Map<string, LoginHistRow>();
  loginHist.forEach(lh => { if (!lastLoginMap.has(lh.user_id)) lastLoginMap.set(lh.user_id, lh); });

  const recentActivity = loginHist.slice(0, 6).map(lh => ({
    ...lh,
    user: users.find(u => u.id === lh.user_id),
  }));

  if (loading) return (
    <div className="ur-page"><div className="ur-loading"><RefreshCw size={20} className="ur-spin"/><span>Loading Users & Roles...</span></div></div>
  );

  return (
    <div className="ur-page">

      {/* ── RBAC Setup Banner (shown when db is empty) ─────────────────────── */}
      {roles.length === 0 && !loading && (
        <div className="ur-setup-banner">
          <div className="ur-setup-banner__left">
            <div className="ur-setup-banner__icon"><Database size={22}/></div>
            <div style={{flex:1}}>
              <div className="ur-setup-banner__title">RBAC Not Configured</div>
              <div className="ur-setup-banner__sub">
                No roles or permissions found. Choose one of two ways to seed the database:
              </div>
              <div className="ur-setup-steps">
                <div className="ur-setup-step">
                  <span className="ur-setup-step__num">A</span>
                  <div>
                    <strong>Run SQL in Supabase Dashboard (recommended)</strong>
                    <div className="ur-setup-step__detail">
                      Open <em>Supabase → SQL Editor</em>, paste and run&nbsp;
                      <code>supabase/rbac_rls_policies.sql</code> first, then&nbsp;
                      <code>supabase/seed_rbac.sql</code>.
                    </div>
                  </div>
                </div>
                <div className="ur-setup-step">
                  <span className="ur-setup-step__num">B</span>
                  <div>
                    <strong>Use the Seed RBAC button</strong>
                    <div className="ur-setup-step__detail">
                      First run <code>rbac_rls_policies.sql</code> in Supabase, then add your&nbsp;
                      <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code>&nbsp;
                      (Supabase → Project Settings → API → service_role), restart the dev server, sign in as a&nbsp;
                      <code>super_admin</code>, and click Seed RBAC.
                    </div>
                  </div>
                </div>
              </div>
              {seedResult && (
                <div className={seedResult.success ? "ur-seed-ok" : "ur-seed-err"}>
                  {seedResult.success ? <CheckCircle2 size={13}/> : <AlertCircle size={13}/>}
                  <span>{seedResult.msg}</span>
                </div>
              )}
            </div>
          </div>
          <div className="ur-setup-banner__actions">
            <button className="ur-btn ur-btn--seed" onClick={()=>void seedRbac()} disabled={seeding}>
              {seeding ? <RefreshCw size={14} className="ur-spin"/> : <Database size={14}/>}
              {seeding ? "Seeding…" : "Seed RBAC"}
            </button>
            <button className="ur-ghost-btn" style={{marginTop:8}} onClick={()=>void loadAll()}>
              <RefreshCw size={13}/> Refresh
            </button>
          </div>
        </div>
      )}

      {/* Seed result feedback when roles already existed */}
      {roles.length > 0 && seedResult && (
        <div className={seedResult.success ? "ur-seed-ok ur-seed-ok--banner" : "ur-seed-err ur-seed-err--banner"}>
          {seedResult.success ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
          <span>{seedResult.msg}</span>
        </div>
      )}

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <div className="ur-stats">
        <article className="ur-stat ur-stat--blue">
          <div className="ur-stat__icon"><Users size={20}/></div>
          <div>
            <div className="ur-stat__label">TOTAL USERS</div>
            <div className="ur-stat__value">{users.length}</div>
            <div className="ur-stat__sub">Active users</div>
          </div>
        </article>
        <article className="ur-stat ur-stat--green">
          <div className="ur-stat__icon"><UserCheck size={20}/></div>
          <div>
            <div className="ur-stat__label">ACTIVE USERS</div>
            <div className="ur-stat__value">{activeUsers.length}</div>
            <div className="ur-stat__sub">{users.length>0?((activeUsers.length/users.length)*100).toFixed(1):0}% of total users</div>
          </div>
        </article>
        <article className="ur-stat ur-stat--orange">
          <div className="ur-stat__icon"><UserX size={20}/></div>
          <div>
            <div className="ur-stat__label">INACTIVE USERS</div>
            <div className="ur-stat__value">{inactiveUsers.length}</div>
            <div className="ur-stat__sub">{users.length>0?((inactiveUsers.length/users.length)*100).toFixed(1):0}% of total users</div>
          </div>
        </article>
        <article className="ur-stat ur-stat--purple">
          <div className="ur-stat__icon"><Shield size={20}/></div>
          <div>
            <div className="ur-stat__label">TOTAL ROLES</div>
            <div className="ur-stat__value">{roles.length}</div>
            <div className="ur-stat__sub">System roles</div>
          </div>
        </article>
        <article className="ur-stat ur-stat--red">
          <div className="ur-stat__icon"><Key size={20}/></div>
          <div>
            <div className="ur-stat__label">PERMISSIONS</div>
            <div className="ur-stat__value">{totalPerms}</div>
            <div className="ur-stat__sub">System permissions</div>
          </div>
        </article>
      </div>

      {error && <div className="ur-error">{error}</div>}

      {/* ── Main Grid ─────────────────────────────────────────────────────── */}
      <div className="ur-grid">

        {/* ── LEFT: Users Table ─────────────────────────────────────────── */}
        <section className="ur-card ur-users-card">
          <div className="ur-card__header">
            <span className="ur-card__title">USERS</span>
            <button className="ur-btn ur-btn--primary"><Plus size={13}/> Add New User</button>
          </div>
          {/* Filters */}
          <div className="ur-toolbar">
            <label className="ur-search-wrap">
              <Search size={14}/>
              <input className="ur-search" placeholder="Search users..." value={search}
                onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
            </label>
            <select className="ur-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select className="ur-select" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(1);}}>
              <option value="all">All Roles</option>
              {roles.map(r=><option key={r.id} value={r.id}>{formatRole(r.name)}</option>)}
            </select>
            <select className="ur-select" value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1);}}>
              <option value="all">All Branches</option>
              {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="ur-ghost-btn"><Filter size={13}/> Filters</button>
          </div>

          {/* Table */}
          <div className="ur-table-wrap">
            <table className="ur-table">
              <thead><tr>
                <th>#</th><th>User</th><th>Username</th><th>Email</th>
                <th>Role</th><th>Branch</th><th>Status</th><th>Last Login</th><th>Action</th>
              </tr></thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={9}><div className="ur-empty">No users match your filters.</div></td></tr>
                ) : paged.map((u,i) => {
                  const role = u.role_id ? roleMap.get(u.role_id) : null;
                  const branch = u.branch_id ? branchMap.get(u.branch_id) : null;
                  const lastLogin = lastLoginMap.get(u.id);
                  const active = u.is_active !== false;
                  const [bg, fg] = avatarColor(u.id);
                  return (
                    <tr key={u.id}>
                      <td className="ur-table__num">{(safePage-1)*PAGE_SIZE+i+1}</td>
                      <td>
                        <div className="ur-user-cell">
                          <div className="ur-avatar" style={{background:bg,color:fg}}>{initials(u)}</div>
                          <div>
                            <div className="ur-user-cell__name">{fullName(u)}</div>
                            <div className="ur-user-cell__email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="ur-mono">{u.username}</td>
                      <td className="ur-muted">{u.email}</td>
                      <td>{role ? <span className="ur-role-badge" style={{background:roleColor(role.name)+"18",color:roleColor(role.name)}}>{formatRole(role.name)}</span> : <span className="ur-muted">—</span>}</td>
                      <td>{branch?.name ?? <span className="ur-muted">—</span>}</td>
                      <td><span className={active?"ur-status ur-status--active":"ur-status ur-status--inactive"}>{active?"Active":"Inactive"}</span></td>
                      <td className="ur-muted ur-small">{lastLogin ? fmt(lastLogin.logged_in_at) : "—"}</td>
                      <td>
                        <div className="ur-actions">
                          <button className="ur-icon-btn" aria-label="Edit"><Pencil size={13}/></button>
                          <button className="ur-icon-btn ur-icon-btn--danger" aria-label="Delete"><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="ur-pagination">
            <span className="ur-pagination__info">Showing {filtered.length===0?0:(safePage-1)*PAGE_SIZE+1} to {Math.min(safePage*PAGE_SIZE,filtered.length)} of {filtered.length} users</span>
            <div className="ur-pagination__controls">
              <button className="ur-page-btn" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={14}/></button>
              {Array.from({length:Math.min(totalPages,3)},(_,i)=>i+1).map(n=>(
                <button key={n} className={n===safePage?"ur-page-btn ur-page-btn--active":"ur-page-btn"} onClick={()=>setPage(n)}>{n}</button>
              ))}
              {totalPages>3&&<span className="ur-pagination__dots">…</span>}
              {totalPages>3&&<button className="ur-page-btn" onClick={()=>setPage(totalPages)}>{totalPages}</button>}
              <button className="ur-page-btn" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}><ChevronRight size={14}/></button>
            </div>
            <select className="ur-select ur-select--sm" onChange={()=>{}} value={PAGE_SIZE}><option>10 / page</option></select>
          </div>
        </section>

        {/* ── RIGHT column ─────────────────────────────────────────────── */}
        <div className="ur-right-col">

          {/* Roles Overview */}
          <section className="ur-card">
            <div className="ur-card__header">
              <span className="ur-card__title">ROLES OVERVIEW</span>
              <button className="ur-btn ur-btn--primary"><Plus size={13}/> Create New Role</button>
            </div>
            <div className="ur-table-wrap">
              <table className="ur-table">
                <thead><tr><th>Role Name</th><th>Users</th><th>Description</th><th>Action</th></tr></thead>
                <tbody>
                  {roles.map(r => {
                    const count = users.filter(u=>u.role_id===r.id).length;
                    return (
                      <tr key={r.id} className={r.id===selectedRoleId?"ur-table__row--active":""} onClick={()=>setSelectedRoleId(r.id)} style={{cursor:"pointer"}}>
                        <td>
                          <div className="ur-role-name-cell">
                            <div className="ur-role-dot" style={{background:roleColor(r.name)}}/>
                            <span style={{fontWeight:600,fontSize:12}}>{formatRole(r.name)}</span>
                          </div>
                        </td>
                        <td><span className="ur-count-badge">{count}</span></td>
                        <td className="ur-muted ur-small">{roleDesc(r.name, r.description)}</td>
                        <td>
                          <div className="ur-actions">
                            <button className="ur-icon-btn"><Pencil size={12}/></button>
                            <button className="ur-icon-btn ur-icon-btn--danger"><Trash2 size={12}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {roles.length===0&&<tr><td colSpan={4}><div className="ur-empty">No roles found.</div></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="ur-card__footer">Showing 1 to {roles.length} of {roles.length} roles</div>
          </section>

          {/* Recent Activity */}
          <section className="ur-card ur-activity-card">
            <div className="ur-card__header">
              <span className="ur-card__title">RECENT USER ACTIVITY</span>
              <button className="ur-ghost-btn">View All</button>
            </div>
            <div className="ur-activity-list">
              {recentActivity.length===0&&<div className="ur-empty">No recent activity.</div>}
              {recentActivity.map(item=>{
                const u = item.user;
                const isLogin = item.status==="success";
                return (
                  <div key={item.id} className="ur-activity-item">
                    <div className="ur-activity-item__left">
                      {u ? (
                        <div className="ur-avatar ur-avatar--sm" style={(() => { const [bg,fg]=avatarColor(u.id); return {background:bg,color:fg}; })()}>{initials(u)}</div>
                      ) : (
                        <div className="ur-avatar ur-avatar--sm" style={{background:"#f1f5f9",color:"#64748b"}}><Activity size={12}/></div>
                      )}
                      <div>
                        <div className="ur-activity-item__name">{u ? fullName(u) : "Unknown User"}</div>
                        <div className="ur-activity-item__meta">{fmt(item.logged_in_at)}</div>
                      </div>
                    </div>
                    <span className={isLogin?"ur-act-badge ur-act-badge--login":"ur-act-badge ur-act-badge--logout"}>
                      {isLogin ? <><LogIn size={10}/> Login</> : <><XCircle size={10}/> Failed</>}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ur-security-banner">
              <Shield size={18} style={{color:"#2563eb",flexShrink:0}}/>
              <div>
                <div className="ur-security-banner__title">Keep your system secure</div>
                <div className="ur-security-banner__sub">Regularly review user access and permissions to ensure data security and operational efficiency.</div>
              </div>
              <button className="ur-ghost-btn ur-ghost-btn--sm"><Settings2 size={12}/> Security Settings</button>
            </div>
          </section>
        </div>
      </div>

      {/* ── Bottom: Role Details ──────────────────────────────────────────── */}
      {selectedRole && (
        <div className="ur-bottom-grid">

          {/* Role Selector */}
          <section className="ur-card ur-role-selector">
            <div className="ur-card__header"><span className="ur-card__title">SELECT ROLE TO VIEW DETAILS</span></div>
            <div className="ur-role-list">
              {roles.map(r=>{
                const count = users.filter(u=>u.role_id===r.id).length;
                return (
                  <button key={r.id} className={r.id===selectedRoleId?"ur-role-item ur-role-item--active":"ur-role-item"} onClick={()=>setSelectedRoleId(r.id)}>
                    <div className="ur-role-item__icon" style={{background:roleColor(r.name)+"22",color:roleColor(r.name)}}>
                      <Shield size={14}/>
                    </div>
                    <div>
                      <div className="ur-role-item__name">{formatRole(r.name)}</div>
                      <div className="ur-role-item__count">{count} user{count!==1?"s":""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Role Details Panel */}
          <section className="ur-card ur-role-detail">
            <div className="ur-card__header">
              <span className="ur-card__title">ROLE DETAILS: {formatRole(selectedRole.name).toUpperCase()}</span>
            </div>
            <div className="ur-tabs">
              {(["permissions","users","info"] as const).map(tab=>(
                <button key={tab} className={roleTab===tab?"ur-tab ur-tab--active":"ur-tab"} onClick={()=>{setRoleTab(tab);setPermPage(1);}}>
                  {tab.charAt(0).toUpperCase()+tab.slice(1)}
                  {tab==="users"&&<span className="ur-tab__count">{selectedRoleUsers.length}</span>}
                </button>
              ))}
            </div>

            {roleTab==="permissions" && (
              <>
                <div className="ur-toolbar ur-toolbar--compact">
                  <label className="ur-search-wrap">
                    <Search size={12}/>
                    <input className="ur-search ur-search--sm" placeholder="Search permissions..." value={permSearch} onChange={e=>{setPermSearch(e.target.value);setPermPage(1);}}/>
                  </label>
                  <select className="ur-select ur-select--sm" value={permModule} onChange={e=>{setPermModule(e.target.value);setPermPage(1);}}>
                    <option value="all">All Modules</option>
                    {permModules.map(m=><option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                  </select>
                </div>
                <div className="ur-table-wrap">
                  <table className="ur-table">
                    <thead><tr><th><CheckCircle2 size={12}/></th><th>Permission</th><th>Module</th><th>Description</th><th>Status</th></tr></thead>
                    <tbody>
                      {pagedPerms.length===0?<tr><td colSpan={5}><div className="ur-empty">No permissions found.</div></td></tr>
                      :pagedPerms.map(p=>(
                        <tr key={p.id}>
                          <td><CheckCircle2 size={13} style={{color:"#22c55e"}}/></td>
                          <td style={{fontWeight:600,fontSize:12}}>{p.action.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</td>
                          <td><span className="ur-module-tag">{p.module}</span></td>
                          <td className="ur-muted ur-small">{p.description||"—"}</td>
                          <td><span className="ur-status ur-status--active">Allowed</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ur-pagination">
                  <span className="ur-pagination__info">Showing {filteredPerms.length===0?0:(permPage-1)*permPageSize+1} to {Math.min(permPage*permPageSize,filteredPerms.length)} of {filteredPerms.length}</span>
                  <div className="ur-pagination__controls">
                    <button className="ur-page-btn" disabled={permPage<=1} onClick={()=>setPermPage(p=>Math.max(1,p-1))}><ChevronLeft size={12}/></button>
                    {Array.from({length:Math.min(totalPermPages,3)},(_,i)=>i+1).map(n=>(
                      <button key={n} className={n===permPage?"ur-page-btn ur-page-btn--active":"ur-page-btn"} onClick={()=>setPermPage(n)}>{n}</button>
                    ))}
                    {totalPermPages>3&&<span>…</span>}
                    {totalPermPages>3&&<button className="ur-page-btn" onClick={()=>setPermPage(totalPermPages)}>{totalPermPages}</button>}
                    <button className="ur-page-btn" disabled={permPage>=totalPermPages} onClick={()=>setPermPage(p=>Math.min(totalPermPages,p+1))}><ChevronRight size={12}/></button>
                  </div>
                  <select className="ur-select ur-select--sm" value="10" onChange={()=>{}}><option>10 / page</option></select>
                </div>
              </>
            )}

            {roleTab==="users" && (
              <div className="ur-table-wrap">
                <table className="ur-table">
                  <thead><tr><th>User</th><th>Username</th><th>Branch</th><th>Status</th><th>Last Login</th></tr></thead>
                  <tbody>
                    {selectedRoleUsers.length===0?<tr><td colSpan={5}><div className="ur-empty">No users with this role.</div></td></tr>
                    :selectedRoleUsers.map(u=>{
                      const branch = u.branch_id?branchMap.get(u.branch_id):null;
                      const lastLogin = lastLoginMap.get(u.id);
                      const active = u.is_active!==false;
                      const [bg,fg]=avatarColor(u.id);
                      return (
                        <tr key={u.id}>
                          <td><div className="ur-user-cell"><div className="ur-avatar ur-avatar--sm" style={{background:bg,color:fg}}>{initials(u)}</div><span style={{fontWeight:600,fontSize:12}}>{fullName(u)}</span></div></td>
                          <td className="ur-mono">{u.username}</td>
                          <td>{branch?.name??<span className="ur-muted">—</span>}</td>
                          <td><span className={active?"ur-status ur-status--active":"ur-status ur-status--inactive"}>{active?"Active":"Inactive"}</span></td>
                          <td className="ur-muted ur-small">{lastLogin?fmt(lastLogin.logged_in_at):"Never"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {roleTab==="info" && (
              <div className="ur-role-info">
                <div className="ur-role-info__row"><span>Role Name</span><strong>{formatRole(selectedRole.name)}</strong></div>
                <div className="ur-role-info__row"><span>Description</span><strong>{roleDesc(selectedRole.name,selectedRole.description)}</strong></div>
                <div className="ur-role-info__row"><span>System Role</span><strong>{selectedRole.is_system?"Yes":"No"}</strong></div>
                <div className="ur-role-info__row"><span>Users Assigned</span><strong>{selectedRoleUsers.length}</strong></div>
                <div className="ur-role-info__row"><span>Permissions</span><strong>{selectedRolePerms.length}</strong></div>
                <div className="ur-role-info__row"><span>Created</span><strong>{fmt(selectedRole.created_at)}</strong></div>
              </div>
            )}
          </section>

          {/* Admin Shortcuts */}
          <section className="ur-card ur-shortcuts">
            <div className="ur-card__header"><span className="ur-card__title">ADMIN SHORTCUTS</span></div>
            <div className="ur-shortcut-list">
              <button className="ur-shortcut ur-shortcut--primary"><Plus size={13}/> Add New User</button>
              <button className="ur-shortcut ur-shortcut--success"><Shield size={13}/> Create New Role</button>
              <button className="ur-shortcut ur-shortcut--muted"><Clock size={13}/> User Activity Log</button>
              <button className="ur-shortcut ur-shortcut--muted"><Key size={13}/> Permission Matrix</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

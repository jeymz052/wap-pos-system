"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import {
  AlertTriangle, CheckCircle, Clock, Eye, EyeOff, Globe,
  History, KeyRound, Laptop, Lock, LogOut, Monitor,
  RefreshCw, Shield, ShieldCheck, ShieldOff, Smartphone,
  Trash2, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRbac } from "@/components/RbacProvider";
import { evaluatePassword, DEFAULT_POLICY } from "@/lib/auth-security";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LoginHistoryRow {
  id: string;
  status: "success" | "failed";
  login_method: string;
  ip_address: string | null;
  user_agent: string | null;
  device_name: string | null;
  logged_in_at: string;
  users?: { username: string; first_name: string; last_name: string } | null;
}

interface DeviceSession {
  id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  last_active_at: string;
  created_at: string;
  is_current: boolean;
}

type Tab = "history" | "sessions" | "2fa" | "password";
type Toast = { id: number; ok: boolean; msg: string };

// ─── Password Strength Bar ─────────────────────────────────────────────────────

function PwStrengthBar({ password }: { password: string }) {
  const s = evaluatePassword(password);
  if (!password) return null;
  return (
    <div className="pwd-strength">
      <div className="pwd-strength__bars">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="pwd-strength__bar"
            style={{ background: i <= s.score ? s.color : "var(--border-subtle)" }} />
        ))}
      </div>
      <span className="pwd-strength__label" style={{ color: s.color }}>{s.label}</span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { user, role } = useRbac();
  const isAdmin = role?.name === "super_admin" || role?.name === "admin";

  const [tab, setTab]       = useState<Tab>("history");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tid, setTid]       = useState(0);

  const toast = useCallback((ok: boolean, msg: string) => {
    const id = tid + 1; setTid(id);
    setToasts(t => [...t, { id, ok, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, [tid]);

  // ─── LOGIN HISTORY ──────────────────────────────────────────────────────────
  const [history, setHistory]     = useState<LoginHistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage]   = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histUserId, setHistUserId] = useState<string | undefined>(undefined);
  const HIST_LIMIT = 15;

  const loadHistory = useCallback(async (page = 1, userId?: string) => {
    setHistLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const params = new URLSearchParams({ page: String(page), limit: String(HIST_LIMIT) });
    if (userId) params.set("user_id", userId);
    const res = await fetch(`/api/auth/login-history?${params}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const json = await res.json() as { data?: LoginHistoryRow[]; total?: number };
    setHistory(json.data ?? []);
    setHistTotal(json.total ?? 0);
    setHistLoading(false);
  }, []);

  useEffect(() => { if (tab === "history") void loadHistory(histPage, histUserId); }, [tab, histPage, histUserId, loadHistory]);

  // ─── SESSIONS ──────────────────────────────────────────────────────────────
  const [sessions, setSessions]   = useState<DeviceSession[]>([]);
  const [sessLoading, setSessLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/auth/sessions", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const json = await res.json() as { data?: DeviceSession[] };
    setSessions(json.data ?? []);
    setSessLoading(false);
  }, []);

  useEffect(() => { if (tab === "sessions") void loadSessions(); }, [tab, loadSessions]);

  const revokeSession = async (sessionId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/auth/sessions", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    toast(true, "Session revoked.");
    void loadSessions();
  };

  const revokeAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/auth/sessions", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    toast(true, "All other sessions revoked.");
    void loadSessions();
  };

  // ─── 2FA ───────────────────────────────────────────────────────────────────
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [enrollData, setEnrollData]     = useState<{ qr_code?: string; secret?: string; factor_id?: string } | null>(null);
  const [verifyCode, setVerifyCode]     = useState("");

  const load2FA = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/auth/2fa", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json() as { enabled?: boolean };
    setTwoFaEnabled(json.enabled ?? false);
  }, []);

  useEffect(() => { if (tab === "2fa") void load2FA(); }, [tab, load2FA]);

  const startEnroll = async () => {
    setTwoFaLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) { toast(false, error?.message ?? "Enrollment failed."); setTwoFaLoading(false); return; }
    const qr = (data as { totp?: { qr_code?: string; secret?: string }; id?: string }).totp;
    setEnrollData({ qr_code: qr?.qr_code, secret: qr?.secret, factor_id: (data as { id?: string }).id });
    setTwoFaLoading(false);
  };

  const confirmEnroll = async () => {
    if (!enrollData?.factor_id || verifyCode.length !== 6) { toast(false, "Enter the 6-digit code."); return; }
    setTwoFaLoading(true);
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.factor_id });
    if (challengeErr || !challengeData) { toast(false, "Challenge failed."); setTwoFaLoading(false); return; }
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: enrollData.factor_id, challengeId: challengeData.id, code: verifyCode });
    if (verifyErr) { toast(false, "Invalid code. Try again."); setTwoFaLoading(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/auth/2fa", { method: "PUT", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setTwoFaEnabled(true);
    setEnrollData(null);
    setVerifyCode("");
    toast(true, "Two-factor authentication enabled!");
    setTwoFaLoading(false);
  };

  const disable2FA = async () => {
    setTwoFaLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/auth/2fa", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable" }) });
    setTwoFaEnabled(false);
    setEnrollData(null);
    toast(true, "2FA disabled.");
    setTwoFaLoading(false);
  };

  // ─── PASSWORD CHANGE ───────────────────────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew]         = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    const strength = evaluatePassword(pwNew, DEFAULT_POLICY);
    if (strength.issues.length > 0) { toast(false, "Password: " + strength.issues.join(", ")); return; }
    if (pwNew !== pwConfirm) { toast(false, "Passwords do not match."); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) { toast(false, error.message); setPwLoading(false); return; }
    toast(true, "Password updated successfully!");
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setPwLoading(false);
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const fmtDate = (d: string) => new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  const histPages = Math.ceil(histTotal / HIST_LIMIT);

  const deviceIcon = (session: DeviceSession) => {
    const ua = (session.device_name ?? "").toLowerCase();
    if (/mobile|android|iphone|ipad/.test(ua)) return <Smartphone size={16} />;
    return <Monitor size={16} />;
  };

  const TABS: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: "history",  icon: History,     label: "Login History" },
    { id: "sessions", icon: Laptop,      label: "Active Sessions" },
    { id: "2fa",      icon: ShieldCheck, label: "Two-Factor Auth" },
    { id: "password", icon: KeyRound,    label: "Change Password" },
  ];

  return (
    <div className="sec-page">
      {/* Header */}
      <div className="sec-page__header">
        <div className="sec-page__header-icon"><Shield size={22} /></div>
        <div>
          <h2 className="sec-page__title">Security Center</h2>
          <p className="sec-page__sub">Manage your login history, sessions, two-factor auth, and password</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="sec-tabs">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button key={id} id={`sec-tab-${id}`}
            className={`sec-tab ${tab === id ? "sec-tab--active" : ""}`}
            onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── LOGIN HISTORY ─────────────────────────────────────── */}
      {tab === "history" && (
        <div className="sec-panel">
          <div className="sec-panel__bar">
            <h3 className="sec-panel__title"><History size={16} /> Login History</h3>
            <button className="sec-refresh-btn" onClick={() => loadHistory(histPage, histUserId)} disabled={histLoading}>
              <RefreshCw size={13} className={histLoading ? "spin" : ""} /> Refresh
            </button>
          </div>

          {histLoading ? (
            <div className="sec-loading"><RefreshCw size={18} className="spin" /> Loading history…</div>
          ) : history.length === 0 ? (
            <div className="sec-empty"><History size={32} /><p>No login history found.</p></div>
          ) : (
            <>
              <div className="sec-table-wrap">
                <table className="sec-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Method</th>
                      {isAdmin && <th>User</th>}
                      <th>Device</th>
                      <th>IP Address</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id}>
                        <td>
                          <span className={`sec-badge ${h.status === "success" ? "sec-badge--green" : "sec-badge--red"}`}>
                            {h.status === "success" ? <CheckCircle size={11}/> : <AlertTriangle size={11}/>}
                            {h.status}
                          </span>
                        </td>
                        <td><span className="sec-method">{h.login_method ?? "password"}</span></td>
                        {isAdmin && (
                          <td className="sec-table__user">
                            {h.users ? `${h.users.first_name} ${h.users.last_name}` : "—"}
                          </td>
                        )}
                        <td className="sec-table__device">{h.device_name ?? h.user_agent?.slice(0, 40) ?? "—"}</td>
                        <td><code className="sec-ip">{h.ip_address ?? "—"}</code></td>
                        <td className="sec-table__date"><Clock size={11}/> {fmtDate(h.logged_in_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {histPages > 1 && (
                <div className="sec-pagination">
                  <button className="sec-page-btn" disabled={histPage <= 1} onClick={() => setHistPage(p => Math.max(1, p-1))}>← Prev</button>
                  <span className="sec-page-info">Page {histPage} of {histPages} · {histTotal} records</span>
                  <button className="sec-page-btn" disabled={histPage >= histPages} onClick={() => setHistPage(p => Math.min(histPages, p+1))}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ACTIVE SESSIONS ───────────────────────────────────── */}
      {tab === "sessions" && (
        <div className="sec-panel">
          <div className="sec-panel__bar">
            <h3 className="sec-panel__title"><Laptop size={16} /> Active Sessions</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sec-refresh-btn" onClick={loadSessions} disabled={sessLoading}>
                <RefreshCw size={13} className={sessLoading ? "spin" : ""} /> Refresh
              </button>
              {sessions.filter(s => !s.is_current).length > 0 && (
                <button className="sec-danger-btn" onClick={revokeAll}>
                  <LogOut size={13} /> Revoke All Others
                </button>
              )}
            </div>
          </div>

          {sessLoading ? (
            <div className="sec-loading"><RefreshCw size={18} className="spin" /> Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="sec-empty"><Laptop size={32} /><p>No active sessions found.</p></div>
          ) : (
            <div className="sec-sessions">
              {sessions.map(s => (
                <div key={s.id} className={`sec-session-card ${s.is_current ? "sec-session-card--current" : ""}`}>
                  <div className="sec-session-card__icon">
                    {deviceIcon(s)}
                  </div>
                  <div className="sec-session-card__info">
                    <div className="sec-session-card__name">
                      {s.device_name ?? "Unknown Device"}
                      {s.is_current && <span className="sec-current-badge">Current</span>}
                    </div>
                    <div className="sec-session-card__meta">
                      {[s.ip_address, s.browser, s.os].filter(Boolean).join(" · ")}
                    </div>
                    <div className="sec-session-card__time">
                      <Clock size={10}/> Last active: {fmtDate(s.last_active_at)}
                    </div>
                  </div>
                  {!s.is_current && (
                    <button className="sec-revoke-btn" onClick={() => revokeSession(s.id)} title="Revoke this session">
                      <X size={13}/> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TWO-FACTOR AUTH ───────────────────────────────────── */}
      {tab === "2fa" && (
        <div className="sec-panel">
          <div className="sec-panel__bar">
            <h3 className="sec-panel__title"><ShieldCheck size={16} /> Two-Factor Authentication</h3>
          </div>

          <div className="sec-2fa">
            {/* Status card */}
            <div className={`sec-2fa__status ${twoFaEnabled ? "sec-2fa__status--on" : "sec-2fa__status--off"}`}>
              <div className="sec-2fa__status-icon">
                {twoFaEnabled ? <ShieldCheck size={28}/> : <ShieldOff size={28}/>}
              </div>
              <div>
                <div className="sec-2fa__status-title">
                  2FA is currently <strong>{twoFaEnabled ? "ENABLED" : "DISABLED"}</strong>
                </div>
                <div className="sec-2fa__status-sub">
                  {twoFaEnabled
                    ? "Your account is protected with an authenticator app."
                    : "Add an extra layer of security to your account."}
                </div>
              </div>
              {twoFaEnabled && (
                <button className="sec-danger-btn" onClick={disable2FA} disabled={twoFaLoading}>
                  {twoFaLoading ? <RefreshCw size={13} className="spin"/> : <ShieldOff size={13}/>}
                  Disable 2FA
                </button>
              )}
            </div>

            {!twoFaEnabled && !enrollData && (
              <div className="sec-2fa__setup-cta">
                <div className="sec-2fa__cta-icon"><Shield size={40}/></div>
                <h4>Protect your account with 2FA</h4>
                <p>Use an authenticator app like Google Authenticator or Authy to generate time-based one-time passwords.</p>
                <button className="sec-primary-btn" onClick={startEnroll} disabled={twoFaLoading}>
                  {twoFaLoading ? <RefreshCw size={14} className="spin"/> : <ShieldCheck size={14}/>}
                  Set Up Two-Factor Auth
                </button>
              </div>
            )}

            {enrollData && (
              <div className="sec-2fa__enroll">
                <div className="sec-2fa__enroll-step">
                  <div className="sec-2fa__step-num">1</div>
                  <div>
                    <p className="sec-2fa__step-title">Scan QR Code</p>
                    <p className="sec-2fa__step-sub">Open your authenticator app and scan this QR code.</p>
                    {enrollData.qr_code && (
                      <div className="sec-2fa__qr-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={enrollData.qr_code} alt="2FA QR Code" className="sec-2fa__qr" />
                      </div>
                    )}
                    {enrollData.secret && (
                      <div className="sec-2fa__secret-wrap">
                        <span className="sec-2fa__secret-label">Or enter manually:</span>
                        <code className="sec-2fa__secret">{enrollData.secret}</code>
                      </div>
                    )}
                  </div>
                </div>

                <div className="sec-2fa__enroll-step">
                  <div className="sec-2fa__step-num">2</div>
                  <div style={{ flex: 1 }}>
                    <p className="sec-2fa__step-title">Enter Verification Code</p>
                    <p className="sec-2fa__step-sub">Enter the 6-digit code from your authenticator app to confirm setup.</p>
                    <div className="sec-2fa__code-row">
                      <input
                        id="input-2fa-verify"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={verifyCode}
                        onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                        className="sec-2fa__code-input"
                        autoFocus
                      />
                      <button className="sec-primary-btn" onClick={confirmEnroll}
                        disabled={twoFaLoading || verifyCode.length !== 6}>
                        {twoFaLoading ? <RefreshCw size={14} className="spin"/> : <CheckCircle size={14}/>}
                        Verify & Enable
                      </button>
                      <button className="sec-ghost-btn" onClick={() => { setEnrollData(null); setVerifyCode(""); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD ───────────────────────────────────── */}
      {tab === "password" && (
        <div className="sec-panel">
          <div className="sec-panel__bar">
            <h3 className="sec-panel__title"><KeyRound size={16}/> Change Password</h3>
          </div>

          <div className="sec-pw-wrap">
            <div className="sec-pw-requirements">
              <p className="sec-pw-req__title">Password requirements:</p>
              <ul className="sec-pw-req__list">
                {[
                  { label: `At least ${DEFAULT_POLICY.password_min_length} characters`, ok: pwNew.length >= DEFAULT_POLICY.password_min_length },
                  { label: "One uppercase letter", ok: /[A-Z]/.test(pwNew) },
                  { label: "One number",           ok: /[0-9]/.test(pwNew) },
                ].map(({ label, ok }) => (
                  <li key={label} className={`sec-pw-req__item ${ok ? "sec-pw-req__item--ok" : ""}`}>
                    <span className="sec-pw-req__dot"/>
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <form className="sec-pw-form" onSubmit={handlePasswordChange} id="form-change-password">
              {[
                { id: "input-new-password",     label: "New Password",      val: pwNew,     set: setPwNew,     autoComp: "new-password" },
                { id: "input-confirm-password",  label: "Confirm Password",  val: pwConfirm, set: setPwConfirm, autoComp: "new-password" },
              ].map(({ id, label, val, set, autoComp }) => (
                <label key={id} className="login-form__field">
                  <span className="login-form__label">{label}</span>
                  <div className="login-form__input-wrap">
                    <Lock size={15} className="login-form__icon"/>
                    <input
                      id={id}
                      type={showPw ? "text" : "password"}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      value={val}
                      onChange={e => set(e.target.value)}
                      autoComplete={autoComp}
                      required
                      disabled={pwLoading}
                    />
                    {id === "input-new-password" && (
                      <button type="button" className="login-form__visibility"
                        onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? "Hide" : "Show"}>
                        {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                      </button>
                    )}
                  </div>
                  {id === "input-new-password" && <PwStrengthBar password={val}/>}
                  {id === "input-confirm-password" && val && pwNew !== val && (
                    <p className="reset-pw__mismatch">Passwords do not match.</p>
                  )}
                </label>
              ))}

              <button
                id="btn-update-password"
                type="submit"
                className="login-form__submit"
                style={{ marginTop: 8 }}
                disabled={pwLoading || !pwNew || !pwConfirm || pwNew !== pwConfirm}>
                {pwLoading ? <RefreshCw size={15} className="spin"/> : <KeyRound size={15}/>}
                <span>{pwLoading ? "Updating…" : "Update Password"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toast stack */}
      <div className="ur-toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`ur-toast ${t.ok ? "ur-toast--ok" : "ur-toast--err"}`}>
            {t.ok ? <CheckCircle size={14}/> : <AlertTriangle size={14}/>}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

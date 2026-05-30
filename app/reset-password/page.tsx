"use client";

import { Suspense } from "react";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { evaluatePassword, DEFAULT_POLICY, type PasswordPolicy } from "@/lib/auth-security";
import { normalizeSecurityPolicy } from "@/lib/security-policy";

function PasswordStrengthBar({ password, policy }: { password: string; policy: PasswordPolicy }) {
  const strength = evaluatePassword(password, policy);
  if (!password) return null;
  return (
    <div className="pwd-strength">
      <div className="pwd-strength__bars">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="pwd-strength__bar"
            style={{ background: i <= strength.score ? strength.color : "#e2e8f0" }}
          />
        ))}
      </div>
      <span className="pwd-strength__label" style={{ color: strength.color }}>
        {strength.label}
      </span>
    </div>
  );
}

function ResetPasswordForm() {
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState(false);
  const [securityPolicy, setSecurityPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const { data, error: policyError } = await supabase.rpc("get_password_policy");
      if (!policyError) {
        setSecurityPolicy(normalizeSecurityPolicy((data as Record<string, unknown> | null) ?? null));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const strength = evaluatePassword(password, securityPolicy);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (strength.issues.length > 0) {
      setError("Password does not meet the requirements: " + strength.issues.join(", ") + ".");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    // Supabase uses the hash fragment for reset tokens — the session is set automatically
    // when the user arrives at this page via the reset link.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ password }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Unable to update password.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      window.location.replace("/?reason=password_reset");
    }, 2500);
  };

  if (success) {
    return (
      <div className="reset-pw__success">
        <div className="login-card__icon-wrap login-card__icon-wrap--blue" style={{ marginBottom: 16 }}>
          <ShieldCheck size={28} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
          Password Updated!
        </h2>
        <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
          Your password has been changed successfully. Redirecting you to login…
        </p>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} id="form-reset-password">
      <div className="login-card__header">
        <div className="login-card__icon-wrap login-card__icon-wrap--blue">
          <KeyRound size={28} />
        </div>
        <h2>Set New Password</h2>
        <p>Choose a strong password for your account</p>
      </div>

      {/* Requirements */}
      <div className="reset-pw__requirements">
        <p className="reset-pw__req-title">Password must have:</p>
        <ul className="reset-pw__req-list">
          {[
            { label: `At least ${securityPolicy.password_min_length} characters`, ok: password.length >= securityPolicy.password_min_length },
            { label: "One uppercase letter", ok: !securityPolicy.password_require_uppercase || /[A-Z]/.test(password) },
            { label: "One number",           ok: !securityPolicy.password_require_number || /[0-9]/.test(password) },
            ...(securityPolicy.password_require_symbol ? [{ label: "One special character", ok: /[^A-Za-z0-9]/.test(password) }] : []),
          ].map(({ label, ok }) => (
            <li key={label} className={`reset-pw__req-item ${ok ? "reset-pw__req-item--ok" : ""}`}>
              <span className="reset-pw__req-dot" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <label className="login-form__field">
        <span className="login-form__label">New Password</span>
        <div className="login-form__input-wrap">
          <Lock size={16} className="login-form__icon" />
          <input
            id="input-new-password"
            type={showPw ? "text" : "password"}
            placeholder="Enter new password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
          <button
            type="button"
            className="login-form__visibility"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? "Hide" : "Show"}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PasswordStrengthBar password={password} policy={securityPolicy} />
      </label>

      <label className="login-form__field">
        <span className="login-form__label">Confirm Password</span>
        <div className="login-form__input-wrap">
          <Lock size={16} className="login-form__icon" />
          <input
            id="input-confirm-password"
            type={showConfirm ? "text" : "password"}
            placeholder="Re-enter new password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
          <button
            type="button"
            className="login-form__visibility"
            onClick={() => setShowConfirm(v => !v)}
            aria-label={showConfirm ? "Hide" : "Show"}
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {confirm && password !== confirm && (
          <p className="reset-pw__mismatch">Passwords do not match.</p>
        )}
      </label>

      {error && (
        <div className="login-form__error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <button
        id="btn-update-password"
        type="submit"
        className="login-form__submit"
        disabled={loading || strength.issues.length > 0 || password !== confirm}
      >
        {loading ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
        <span>{loading ? "Updating…" : "Update Password"}</span>
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="login-page login-page--centered">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <Suspense fallback={<div style={{ padding: 32, color: "#64748b", textAlign: "center" }}>Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

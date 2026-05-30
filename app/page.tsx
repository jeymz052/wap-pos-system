"use client";

import { Suspense } from "react";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import {
  AlertTriangle,
  Boxes,
  ChartNoAxesCombined,
  CheckCircle,
  Eye,
  EyeOff,
  Hash,
  Info,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  User,
  UsersRound,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_POLICY,
  evaluatePassword,
  detectDeviceName,
  formatLockCountdown,
  type PasswordPolicy,
} from "@/lib/auth-security";
import { isPasswordExpired, normalizeSecurityPolicy } from "@/lib/security-policy";

// ─── Types ────────────────────────────────────────────────────────────────────

type LoginStep = "credentials" | "2fa" | "pin";
type ModalType = "forgot-password" | "reset-sent" | "inactivity" | null;
type UserAuthRow = {
  id: string;
  locked_until: string | null;
  failed_login_attempts: number | null;
  two_factor_enabled: boolean | null;
  is_active: boolean | null;
  allow_login: boolean | null;
  roles?: { name?: string | null } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PasswordStrengthBar({ password, policy }: { password: string; policy: PasswordPolicy }) {
  const strength = evaluatePassword(password, policy);
  if (!password) return null;
  return (
    <div className="pwd-strength">
      <div className="pwd-strength__bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="pwd-strength__bar"
            style={{ background: i <= strength.score ? strength.color : "var(--border-subtle)" }}
          />
        ))}
      </div>
      <span className="pwd-strength__label" style={{ color: strength.color }}>
        {strength.label}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function LoginPageInner() {
  const searchParams = useSearchParams();

  // Step & modal state
  const [step, setStep]       = useState<LoginStep>("credentials");
  const [modal, setModal]     = useState<ModalType>(null);

  // Credentials fields
  const [identifier, setIdentifier]     = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(true);

  // PIN login
  const [pinIdentifier, setPinIdentifier] = useState("");
  const [pinDigits, setPinDigits]         = useState<string[]>(Array.from({ length: 8 }, () => ""));
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 2FA
  const [totpCode, setTotpCode]   = useState("");
  const [tempSession, setTempSession] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);

  // Forgot password
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotLoading, setForgotLoading]       = useState(false);

  // UI state
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [lockCountdown, setLockCountdown] = useState("");
  const [securityPolicy, setSecurityPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);

  const loadSecurityPolicy = useCallback(async () => {
    const { data, error: policyError } = await supabase.rpc("get_password_policy");
    if (!policyError) {
      setSecurityPolicy(normalizeSecurityPolicy((data as Record<string, unknown> | null) ?? null));
    }
  }, []);

  // ── Check inactivity redirect ──────────────────────────────────────────────
  useEffect(() => {
    const reason = searchParams?.get("reason");
    if (reason === "inactivity") {
      const timer = window.setTimeout(() => {
        setModal("inactivity");
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSecurityPolicy();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSecurityPolicy]);

  // ── Countdown timer for account lock ─────────────────────────────────────
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => setLockCountdown(formatLockCountdown(lockedUntil));
    tick();
    const id = setInterval(() => {
      tick();
      if (new Date(lockedUntil).getTime() <= Date.now()) {
        setLockedUntil(null);
        setError("");
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // ── Already logged in? → skip to dashboard ───────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) window.location.replace("/dashboard");
    });
  }, []);

  // ─── Password Login ────────────────────────────────────────────────────────

  const handlePasswordLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const normalizedId = identifier.trim();
    let email = normalizedId;

    // Resolve username → email
    if (!normalizedId.includes("@")) {
      const { data: resolvedEmail, error: resolveErr } = await supabase.rpc("resolve_auth_user_email", {
        identifier: normalizedId,
      });
      if (resolveErr || !resolvedEmail) {
        setError("We couldn't find that account.");
        setLoading(false);
        return;
      }
      email = resolvedEmail as string;
    }

    // Check if account is locked before attempting Supabase auth
    const { data: userRowData } = await supabase
      .from("users")
      .select("id, locked_until, failed_login_attempts, two_factor_enabled, is_active, allow_login, roles(name)")
      .eq("email", email)
      .maybeSingle();
    const userRow = (userRowData as UserAuthRow | null) ?? null;

    if (userRow) {
      if (!userRow.is_active || !userRow.allow_login) {
        setError("This account has been disabled. Please contact your administrator.");
        setLoading(false);
        return;
      }
      if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
        setLockedUntil(userRow.locked_until);
        setError("Account temporarily locked due to too many failed attempts.");
        setLoading(false);
        return;
      }
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      // Record failed attempt in DB
      if (userRow?.id) {
        const { data: lockResult } = await supabase.rpc("record_failed_login", {
          p_user_id:    userRow.id,
          p_ip_address: null,
          p_user_agent: navigator.userAgent,
        });
        const lr = lockResult as { is_locked?: boolean; locked_until?: string; attempts?: number; max_attempts?: number } | null;
        if (lr?.is_locked && lr.locked_until) {
          setLockedUntil(lr.locked_until);
          setError(`Account locked. Try again in ${formatLockCountdown(lr.locked_until)}.`);
        } else if (lr && lr.attempts != null && lr.max_attempts != null) {
          const remaining = lr.max_attempts - lr.attempts;
          setError(`Invalid password. ${remaining > 0 ? `${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` : "Account locked."}`);
        } else {
          setError(authError.message);
        }
      } else {
        setError("Invalid credentials.");
      }
      setLoading(false);
      return;
    }

    const roleName = (userRow?.roles as { name?: string | null } | null)?.name ?? "";
    const isPrivilegedRole = roleName === "super_admin" || roleName === "admin";
    const requireAdmin2fa = securityPolicy.require_2fa_for_admins;
    const mustSetupAdmin2fa = isPrivilegedRole && requireAdmin2fa && !userRow?.two_factor_enabled;

    if (mustSetupAdmin2fa) {
      await finalizeLogin(authData.session?.access_token ?? "", "password", { redirectToSecuritySetup: true });
      return;
    }

    // Check if 2FA is required
    if (userRow?.two_factor_enabled) {
      const { data: factorData } = await supabase.auth.mfa.listFactors();
      const verifiedTotpFactor = factorData?.totp.find((factor) => factor.status === "verified") ?? null;
      if (!verifiedTotpFactor?.id) {
        setError("Two-factor authentication is enabled, but no verified authenticator factor was found.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      setTempSession(authData.session?.access_token ?? null);
      setTotpFactorId(verifiedTotpFactor.id);
      setStep("2fa");
      setLoading(false);
      return;
    }

    await finalizeLogin(authData.session?.access_token ?? "", "password");
  };

  // ─── 2FA Verification ──────────────────────────────────────────────────────

  const handle2FAVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!totpCode || totpCode.length !== 6) {
      setError("Please enter your 6-digit code.");
      setLoading(false);
      return;
    }

    if (!totpFactorId) {
      setError("Your 2FA session has expired. Please sign in with your password again.");
      setLoading(false);
      return;
    }

    // Verify via Supabase MFA
    let mfaSession: { access_token: string } | null = null;
    let mfaError: Error | null = null;
    try {
      const challengeResult = await supabase.auth.mfa.challenge({ factorId: totpFactorId });
      if (challengeResult.error || !challengeResult.data) {
        mfaError = new Error(challengeResult.error?.message ?? "MFA challenge failed");
      } else {
        const verifyResult = await supabase.auth.mfa.verify({
          factorId: totpFactorId,
          challengeId: challengeResult.data.id,
          code: totpCode,
        });

        if (verifyResult.error) {
          mfaError = new Error(verifyResult.error.message);
        } else {
          mfaSession = (verifyResult.data as unknown as { session?: { access_token: string } })?.session ?? null;
        }
      }
    } catch {
      mfaError = new Error("MFA verify failed");
    }

    if (mfaError || !mfaSession) {
      setError("Invalid verification code. Please try again.");
      setLoading(false);
      return;
    }

    await finalizeLogin(mfaSession.access_token ?? tempSession ?? "", "totp");
  };

  // ─── PIN Login ────────────────────────────────────────────────────────────

  const handlePinLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const pin = pinDigits.slice(0, securityPolicy.pin_length).join("");
    if (pin.length !== securityPolicy.pin_length) {
      setError(`Please enter your full ${securityPolicy.pin_length}-digit PIN.`);
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: pinIdentifier, pin }),
    });

    const json = await res.json() as { ok?: boolean; action_link?: string; error?: string };

    if (!res.ok || !json.ok) {
      setError(json.error ?? "PIN login failed.");
      setPinDigits(Array.from({ length: 8 }, () => ""));
      pinRefs.current[0]?.focus();
      setLoading(false);
      return;
    }

    // The API returned a magic-link; verify it via Supabase to create a session
    if (json.action_link) {
      window.location.href = json.action_link;
    }
  };

  // ─── Forgot Password ──────────────────────────────────────────────────────

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotLoading(true);

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotIdentifier }),
    });

    setForgotLoading(false);
    setModal("reset-sent");
  };

  // ─── Finalize successful login ─────────────────────────────────────────────

  const finalizeLogin = async (
    accessToken: string,
    method: string,
    options?: { redirectToSecuritySetup?: boolean }
  ) => {
    const { data: { user: signedInUser } } = await supabase.auth.getUser();

    if (signedInUser) {
      // Sync profile
      await supabase.rpc("sync_auth_user_profile_by_id", {
        p_auth_user_id: signedInUser.id,
        p_email:        signedInUser.email ?? "",
        p_user_metadata: signedInUser.user_metadata ?? {},
        p_app_metadata:  signedInUser.app_metadata ?? {},
      });

      // Record login + session
      if (accessToken) {
        await fetch("/api/auth/record-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            device_name:  detectDeviceName(),
            login_method: method,
          }),
        }).catch(() => null);
      }
    }

    if (!rememberMe) {
      sessionStorage.removeItem("sb-session");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    let redirectTarget = options?.redirectToSecuritySetup ? "/security?setup2fa=required" : "/dashboard";

    if (!options?.redirectToSecuritySetup && session?.access_token) {
      const accessResponse = await fetch("/api/auth/access", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const accessPayload = (await accessResponse.json()) as {
        user?: { require_password_change?: boolean | null; password_expires_at?: string | null } | null;
      };

      if (accessPayload.user?.require_password_change || isPasswordExpired(accessPayload.user?.password_expires_at)) {
        const reason = accessPayload.user?.require_password_change ? "password_update_required" : "password_expired";
        redirectTarget = `/security?tab=password&reason=${reason}`;
      }
    }

    window.location.replace(redirectTarget);
  };

  // ─── PIN digit input handler ───────────────────────────────────────────────

  const handlePinDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pinDigits];
    next[index] = digit;
    setPinDigits(next);
    if (digit && index < securityPolicy.pin_length - 1) pinRefs.current[index + 1]?.focus();
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="login-page">
        {/* ── Hero / Left panel ─────────────────────────────── */}
        <section className="login-page__hero">
          <div className="login-page__bg-shape login-page__bg-shape--one" />
          <div className="login-page__bg-shape login-page__bg-shape--two" />

          <div className="login-page__brand-card">
            <Image
              src="/images/poslogo2.png"
              alt="WAP POS"
              width={900}
              height={520}
              priority
              className="login-page__logo"
            />
          </div>

          <div className="login-page__hero-copy">
            <h1>Smart POS. Smarter Business.</h1>
            <p className="login-page__lead">
              Manage sales, inventory, customers and more
              <br />all in one powerful system.
            </p>

            <div className="login-page__features">
              {[
                { icon: ShoppingCart, cls: "cart",  title: "Sales & POS",           sub: "Fast and secure transactions" },
                { icon: Boxes,        cls: "boxes", title: "Inventory Management",   sub: "Track stock in real-time" },
                { icon: UsersRound,   cls: "users", title: "Customers & Suppliers",  sub: "Manage relationships easily" },
                { icon: ChartNoAxesCombined, cls: "chart", title: "Reports & Analytics", sub: "Make smarter decisions" },
              ].map(({ icon: Icon, cls, title, sub }) => (
                <div key={cls} className="login-page__feature">
                  <span className="login-page__feature-icon">
                    <Icon size={18} className={`login-page__feature-glyph login-page__feature-glyph--${cls}`} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Form panel ────────────────────────────────────── */}
        <section className="login-page__form-wrap">
          <div className="login-card">

            {/* ── Tab switcher (credentials / pin) ─────────── */}
            {step !== "2fa" && (
              <div className="login-card__tabs">
                <button
                  type="button"
                  id="tab-password"
                  className={`login-card__tab ${step === "credentials" ? "login-card__tab--active" : ""}`}
                  onClick={() => { setStep("credentials"); setError(""); }}
                >
                  <Lock size={14} /> Password
                </button>
                <button
                  type="button"
                  id="tab-pin"
                  className={`login-card__tab ${step === "pin" ? "login-card__tab--active" : ""}`}
                  onClick={() => { setStep("pin"); setError(""); }}
                >
                  <Hash size={14} /> Cashier PIN
                </button>
              </div>
            )}

            {/* ── Step: Password Login ──────────────────────── */}
            {step === "credentials" && (
              <>
                <div className="login-card__header">
                  <h2>Welcome Back!</h2>
                  <p>Sign in to your WAP POS account</p>
                </div>

                <form className="login-form" onSubmit={handlePasswordLogin} id="form-password-login">
                  <label className="login-form__field">
                    <span className="login-form__label">Username or Email</span>
                    <div className="login-form__input-wrap">
                      <User size={16} className="login-form__icon" />
                      <input
                        id="input-identifier"
                        type="text"
                        placeholder="Enter your username or email"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        autoComplete="username"
                        required
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <label className="login-form__field">
                    <span className="login-form__label">Password</span>
                    <div className="login-form__input-wrap">
                      <Lock size={16} className="login-form__icon" />
                      <input
                        id="input-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        disabled={loading}
                      />
                      <button
                        type="button"
                        id="btn-toggle-password"
                        className="login-form__visibility"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <PasswordStrengthBar password={password} policy={securityPolicy} />
                  </label>

                  <div className="login-form__row">
                    <label className="login-form__remember">
                      <input
                        id="checkbox-remember"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      id="btn-forgot-password"
                      className="login-form__link"
                      onClick={() => { setForgotIdentifier(identifier); setModal("forgot-password"); }}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {error && (
                    <div className="login-form__error" role="alert">
                      <AlertTriangle size={14} />
                      <span>{error}</span>
                      {lockedUntil && (
                        <span className="login-form__countdown"> Unlocks in {lockCountdown}</span>
                      )}
                    </div>
                  )}

                  <button
                    id="btn-sign-in"
                    type="submit"
                    className="login-form__submit"
                    disabled={loading || !!lockedUntil}
                  >
                    {loading ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
                    <span>{loading ? "Signing In..." : "Sign In"}</span>
                  </button>

                  <div className="login-form__divider">2FA is verified after your password</div>

                  <p className="login-form__footer">
                    {"Don't have an account? "}
                    <button type="button" className="login-form__link">Contact Administrator</button>
                  </p>
                </form>
              </>
            )}

            {/* ── Step: 2FA Verification ────────────────────── */}
            {step === "2fa" && (
              <>
                <div className="login-card__header">
                  <div className="login-card__icon-wrap login-card__icon-wrap--blue">
                    <ShieldCheck size={28} />
                  </div>
                  <h2>Two-Factor Auth</h2>
                  <p>Enter the 6-digit code from your authenticator app</p>
                </div>

                <form className="login-form" onSubmit={handle2FAVerify} id="form-2fa">
                  <label className="login-form__field">
                    <span className="login-form__label">Authenticator Code</span>
                    <div className="login-form__input-wrap">
                      <KeyRound size={16} className="login-form__icon" />
                      <input
                        id="input-totp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                        className="login-form__totp-input"
                        autoFocus
                        required
                        disabled={loading}
                      />
                    </div>
                  </label>

                  {error && (
                    <div className="login-form__error" role="alert">
                      <AlertTriangle size={14} /><span>{error}</span>
                    </div>
                  )}

                  <button id="btn-verify-2fa" type="submit" className="login-form__submit" disabled={loading}>
                    {loading ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
                    <span>{loading ? "Verifying..." : "Verify & Sign In"}</span>
                  </button>

                  <button
                    type="button"
                    className="login-form__back"
                    onClick={() => {
                      setStep("credentials");
                      setError("");
                      setTotpCode("");
                      setTotpFactorId(null);
                    }}
                  >
                    Back to login
                  </button>
                </form>
              </>
            )}

            {/* ── Step: PIN Login ───────────────────────────── */}
            {step === "pin" && (
              <>
                <div className="login-card__header">
                  <div className="login-card__icon-wrap login-card__icon-wrap--orange">
                    <Hash size={28} />
                  </div>
                  <h2>Cashier PIN Login</h2>
                  <p>Quick access for cashier accounts</p>
                </div>

                <form className="login-form" onSubmit={handlePinLogin} id="form-pin-login">
                  <label className="login-form__field">
                    <span className="login-form__label">Username</span>
                    <div className="login-form__input-wrap">
                      <User size={16} className="login-form__icon" />
                      <input
                        id="input-pin-username"
                        type="text"
                        placeholder="Your username"
                        value={pinIdentifier}
                        onChange={e => setPinIdentifier(e.target.value)}
                        autoComplete="username"
                        required
                        disabled={loading}
                      />
                    </div>
                  </label>

                  <div className="login-form__field">
                    <span className="login-form__label">{securityPolicy.pin_length}-Digit PIN</span>
                    <div className="login-form__pin-wrap">
                      {pinDigits.slice(0, securityPolicy.pin_length).map((d, i) => (
                        <input
                          key={i}
                          ref={el => { pinRefs.current[i] = el; }}
                          id={`input-pin-digit-${i}`}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={d}
                          onChange={e => handlePinDigit(i, e.target.value)}
                          onKeyDown={e => handlePinKeyDown(i, e)}
                          className="login-form__pin-digit"
                          disabled={loading}
                          aria-label={`PIN digit ${i + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="login-form__error" role="alert">
                      <AlertTriangle size={14} /><span>{error}</span>
                    </div>
                  )}

                  <button
                    id="btn-pin-submit"
                    type="submit"
                    className="login-form__submit"
                    disabled={loading || pinDigits.slice(0, securityPolicy.pin_length).join("").length < securityPolicy.pin_length || !pinIdentifier}
                  >
                    {loading ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
                    <span>{loading ? "Verifying..." : "Sign In with PIN"}</span>
                  </button>

                  <p className="login-form__footer">
                    <Info size={12} style={{ display: "inline", marginRight: 4 }} />
                    PIN login is for cashier roles only and currently requires {securityPolicy.pin_length} digits.
                  </p>
                </form>
              </>
            )}
          </div>

          <footer className="login-page__footer">
            <span>© {new Date().getFullYear()} WAP Motorparts Trading</span>
            <span>All rights reserved.</span>
          </footer>
        </section>
      </main>

      {/* ── Modal: Forgot Password ──────────────────────────────── */}
      {modal === "forgot-password" && (
        <div className="auth-modal__backdrop" role="dialog" aria-modal="true" aria-label="Forgot Password">
          <div className="auth-modal">
            <button id="btn-close-forgot" className="auth-modal__close" onClick={() => setModal(null)}>
              <X size={16} />
            </button>
            <div className="auth-modal__icon auth-modal__icon--blue">
              <Mail size={28} />
            </div>
            <h3 className="auth-modal__title">Reset Password</h3>
            <p className="auth-modal__body">
              Enter your username or email. We&apos;ll send a reset link if the account exists.
            </p>
            <form onSubmit={handleForgotPassword} id="form-forgot-password">
              <div className="login-form__input-wrap" style={{ marginBottom: 16 }}>
                <User size={16} className="login-form__icon" />
                <input
                  id="input-forgot-identifier"
                  type="text"
                  placeholder="Username or email"
                  value={forgotIdentifier}
                  onChange={e => setForgotIdentifier(e.target.value)}
                  required
                  disabled={forgotLoading}
                />
              </div>
              <button
                id="btn-send-reset"
                type="submit"
                className="login-form__submit"
                disabled={forgotLoading}
              >
                {forgotLoading ? <RefreshCw size={16} className="spin" /> : <Mail size={16} />}
                <span>{forgotLoading ? "Sending..." : "Send Reset Link"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Reset Email Sent ────────────────────────────── */}
      {modal === "reset-sent" && (
        <div className="auth-modal__backdrop" role="dialog" aria-modal="true">
          <div className="auth-modal">
            <div className="auth-modal__icon auth-modal__icon--green">
              <CheckCircle size={28} />
            </div>
            <h3 className="auth-modal__title">Check Your Email</h3>
            <p className="auth-modal__body">
              If an account exists for <strong>{forgotIdentifier}</strong>, a password reset link has been sent. Check your inbox.
            </p>
            <button
              id="btn-done-reset"
              className="login-form__submit"
              onClick={() => { setModal(null); setForgotIdentifier(""); }}
            >
              <CheckCircle size={16} />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Inactivity Logout ───────────────────────────── */}
      {modal === "inactivity" && (
        <div className="auth-modal__backdrop" role="dialog" aria-modal="true">
          <div className="auth-modal">
            <div className="auth-modal__icon auth-modal__icon--amber">
              <AlertTriangle size={28} />
            </div>
            <h3 className="auth-modal__title">Session Expired</h3>
            <p className="auth-modal__body">
              You were automatically signed out due to inactivity. Please sign in again.
            </p>
            <button
              id="btn-ok-inactivity"
              className="login-form__submit"
              onClick={() => setModal(null)}
            >
              <LogIn size={16} />
              <span>Sign In Again</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

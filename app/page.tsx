"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Boxes,
  ChartNoAxesCombined,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  ShoppingCart,
  User,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const normalizedIdentifier = identifier.trim();
    let email = normalizedIdentifier;

    if (!normalizedIdentifier.includes("@")) {
      const { data: resolvedEmail, error: userError } = await supabase.rpc("resolve_auth_user_email", {
        identifier: normalizedIdentifier,
      });

      if (userError || !resolvedEmail) {
        setError("We couldn't find that account in your database.");
        setLoading(false);
        return;
      }

      email = resolvedEmail;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const {
      data: { user: signedInUser },
    } = await supabase.auth.getUser();

    if (signedInUser) {
      const { error: profileSyncError } = await supabase.rpc("sync_auth_user_profile_by_id", {
        p_auth_user_id: signedInUser.id,
        p_email: signedInUser.email ?? email,
        p_user_metadata: signedInUser.user_metadata ?? {},
        p_app_metadata: signedInUser.app_metadata ?? {},
      });

      if (profileSyncError) {
        console.error("[Login] Failed to sync authenticated user profile:", profileSyncError.message);
      }
    }

    if (!rememberMe) {
      sessionStorage.removeItem("sb-session");
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="login-page">
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
            Manage sales, inventory, customers and more - all in one powerful system.
          </p>

          <div className="login-page__features">
            <div className="login-page__feature">
              <span className="login-page__feature-icon"><ShoppingCart size={18} /></span>
              <div>
                <strong>Sales & POS</strong>
                <span>Fast and secure transactions</span>
              </div>
            </div>
            <div className="login-page__feature">
              <span className="login-page__feature-icon"><Boxes size={18} /></span>
              <div>
                <strong>Inventory Management</strong>
                <span>Track stock in real-time</span>
              </div>
            </div>
            <div className="login-page__feature">
              <span className="login-page__feature-icon"><UsersRound size={18} /></span>
              <div>
                <strong>Customers & Suppliers</strong>
                <span>Manage relationships easily</span>
              </div>
            </div>
            <div className="login-page__feature">
              <span className="login-page__feature-icon"><ChartNoAxesCombined size={18} /></span>
              <div>
                <strong>Reports & Analytics</strong>
                <span>Make smarter business decisions</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="login-page__form-wrap">
        <div className="login-card">
          <div className="login-card__header">
            <h2>Welcome Back!</h2>
            <p>Sign in to your WAP POS account</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-form__field">
              <span className="login-form__label">Username or Email</span>
              <div className="login-form__input-wrap">
                <User size={16} className="login-form__icon" />
                <input
                  type="text"
                  placeholder="Enter your username or email"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <label className="login-form__field">
              <span className="login-form__label">Password</span>
              <div className="login-form__input-wrap">
                <Lock size={16} className="login-form__icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-form__visibility"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <div className="login-form__row">
              <label className="login-form__remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-form__link">
                Forgot Password?
              </button>
            </div>

            {error && <div className="login-form__error">{error}</div>}

            <button type="submit" className="login-form__submit" disabled={loading}>
              <Lock size={16} />
              <span>{loading ? "Signing In..." : "Sign In"}</span>
            </button>

            <div className="login-form__divider">or</div>

            <button type="button" className="login-form__secondary">
              <ShieldCheck size={16} />
              <span>Sign in with 2FA</span>
            </button>

            <p className="login-form__footer">
              Don&apos;t have an account? <button type="button" className="login-form__link">Contact Administrator</button>
            </p>
          </form>
        </div>

        <footer className="login-page__footer">
          <span>© 2024 WAP Motorparts Trading</span>
          <span>All rights reserved.</span>
        </footer>
      </section>
    </main>
  );
}

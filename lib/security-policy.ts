import { DEFAULT_POLICY, type PasswordPolicy } from "@/lib/auth-security";

type RawPolicy = Record<string, unknown> | null | undefined;

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function parseNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeSecurityPolicy(raw: RawPolicy): PasswordPolicy {
  return {
    password_min_length: parseNumber(raw?.password_min_length, DEFAULT_POLICY.password_min_length),
    password_require_uppercase: parseBoolean(raw?.password_require_uppercase, DEFAULT_POLICY.password_require_uppercase),
    password_require_number: parseBoolean(raw?.password_require_number, DEFAULT_POLICY.password_require_number),
    password_require_symbol: parseBoolean(raw?.password_require_symbol, DEFAULT_POLICY.password_require_symbol),
    password_expiry_days: parseNumber(raw?.password_expiry_days, DEFAULT_POLICY.password_expiry_days),
    max_login_attempts: parseNumber(raw?.max_login_attempts, DEFAULT_POLICY.max_login_attempts),
    lockout_duration_minutes: parseNumber(raw?.lockout_duration_minutes, DEFAULT_POLICY.lockout_duration_minutes),
    session_timeout_minutes: parseNumber(raw?.session_timeout_minutes, DEFAULT_POLICY.session_timeout_minutes),
    pin_length: parseNumber(raw?.pin_length, DEFAULT_POLICY.pin_length),
    require_2fa_for_admins: parseBoolean(raw?.require_2fa_for_admins, DEFAULT_POLICY.require_2fa_for_admins),
  };
}

export function validatePasswordAgainstPolicy(password: string, policy: PasswordPolicy) {
  const issues: string[] = [];

  if (password.length < policy.password_min_length) {
    issues.push(`At least ${policy.password_min_length} characters`);
  }
  if (policy.password_require_uppercase && !/[A-Z]/.test(password)) {
    issues.push("One uppercase letter");
  }
  if (policy.password_require_number && !/[0-9]/.test(password)) {
    issues.push("One number");
  }
  if (policy.password_require_symbol && !/[^A-Za-z0-9]/.test(password)) {
    issues.push("One special character");
  }

  return issues;
}

export function getPasswordExpiryIso(policy: PasswordPolicy, from = new Date()) {
  if (!policy.password_expiry_days || policy.password_expiry_days <= 0) return null;
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + policy.password_expiry_days);
  return expiry.toISOString();
}

export function isPasswordExpired(passwordExpiresAt: string | null | undefined, now = new Date()) {
  if (!passwordExpiresAt) return false;
  return new Date(passwordExpiresAt).getTime() <= now.getTime();
}

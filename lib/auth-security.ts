// ─── Password Policy ──────────────────────────────────────────────────────────

export interface PasswordPolicy {
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_number: boolean;
  password_require_symbol: boolean;
  password_expiry_days: number;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  session_timeout_minutes: number;
  pin_length: number;
  require_2fa_for_admins: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  password_min_length: 8,
  password_require_uppercase: true,
  password_require_number: true,
  password_require_symbol: false,
  password_expiry_days: 90,
  max_login_attempts: 5,
  lockout_duration_minutes: 15,
  session_timeout_minutes: 30,
  pin_length: 4,
  require_2fa_for_admins: true,
};

export interface PasswordStrength {
  score: number;       // 0–4
  label: string;
  color: string;
  issues: string[];
}

export function evaluatePassword(
  password: string,
  policy: Partial<PasswordPolicy> = {}
): PasswordStrength {
  const p = { ...DEFAULT_POLICY, ...policy };
  const issues: string[] = [];

  if (password.length < p.password_min_length)
    issues.push(`At least ${p.password_min_length} characters`);
  if (p.password_require_uppercase && !/[A-Z]/.test(password))
    issues.push("One uppercase letter");
  if (p.password_require_number && !/[0-9]/.test(password))
    issues.push("One number");
  if (p.password_require_symbol && !/[^A-Za-z0-9]/.test(password))
    issues.push("One special character");

  // Bonus scoring
  let score = 0;
  if (password.length >= p.password_min_length) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score = Math.min(score + 1, 4);

  const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];

  return {
    score,
    label: labels[score] ?? "Very Weak",
    color: colors[score] ?? "#ef4444",
    issues,
  };
}

// ─── Format lock countdown ────────────────────────────────────────────────────

export function formatLockCountdown(lockedUntil: string | Date): string {
  const until = new Date(lockedUntil).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.ceil((until - now) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ─── Device/browser detection ─────────────────────────────────────────────────

export function detectDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown Device";
  const ua = navigator.userAgent;
  const browsers = [
    { name: "Chrome",  re: /Chrome\/[\d.]+/ },
    { name: "Firefox", re: /Firefox\/[\d.]+/ },
    { name: "Safari",  re: /Safari\/[\d.]+/ },
    { name: "Edge",    re: /Edg\/[\d.]+/ },
  ];
  const browser = browsers.find(b => b.re.test(ua))?.name ?? "Browser";
  const os =
    /Windows/i.test(ua)     ? "Windows" :
    /Macintosh/i.test(ua)   ? "macOS"   :
    /Android/i.test(ua)     ? "Android" :
    /iPhone|iPad/i.test(ua) ? "iOS"     :
    /Linux/i.test(ua)       ? "Linux"   : "Unknown OS";
  return `${browser} on ${os}`;
}

// ─── Inactivity timer ─────────────────────────────────────────────────────────

type InactivityOptions = {
  timeoutMs: number;
  warningMs?: number;         // Show warning this many ms before logout
  onWarning?: () => void;
  onLogout: () => void;
};

export class InactivityTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private opts: InactivityOptions;
  private readonly EVENTS = [
    "mousemove", "mousedown", "keydown",
    "touchstart", "scroll", "click",
  ] as const;

  constructor(opts: InactivityOptions) {
    this.opts = opts;
  }

  private reset = () => {
    if (this.timer)        clearTimeout(this.timer);
    if (this.warningTimer) clearTimeout(this.warningTimer);

    const { timeoutMs, warningMs, onWarning, onLogout } = this.opts;

    if (warningMs && onWarning) {
      this.warningTimer = setTimeout(onWarning, timeoutMs - warningMs);
    }
    this.timer = setTimeout(onLogout, timeoutMs);
  };

  start() {
    this.EVENTS.forEach(e => window.addEventListener(e, this.reset, { passive: true }));
    this.reset();
  }

  stop() {
    if (this.timer)        clearTimeout(this.timer);
    if (this.warningTimer) clearTimeout(this.warningTimer);
    this.EVENTS.forEach(e => window.removeEventListener(e, this.reset));
  }
}

// ─── Local TOTP utilities (for enrollment UI) ─────────────────────────────────

/** Generate a random base-32 TOTP secret (server should do this in production) */
export function generateTotpUri(secret: string, email: string, issuer = "WAP POS"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ─── Session token fingerprint (first 32 chars) ───────────────────────────────

export function sessionFingerprint(token: string): string {
  return token.slice(0, 32);
}

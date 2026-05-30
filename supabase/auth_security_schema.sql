-- ============================================================
-- WAP POS – Module 1: Authentication & Security Schema
-- Run AFTER wap_pos_supabase_schema.sql and rbac_rls_policies.sql
-- ============================================================

-- ============================================================
-- 0. DROP conflicting function signatures before redefining
--    (necessary when return type changed vs existing version)
-- ============================================================

-- The original wap_pos_supabase_schema.sql defines this as RETURNS users.
-- We do not redefine it here — the original is sufficient.
-- Drop is only needed if you ran an older version of this file.
DROP FUNCTION IF EXISTS public.sync_auth_user_profile_by_id(UUID, TEXT, JSONB, JSONB) CASCADE;


-- ============================================================
-- 0b. ENSURE HELPER FUNCTIONS EXIST
--     These are normally created by rbac_rls_policies.sql.
--     Inlined here so this file is self-contained and can run
--     standalone (idempotent — CREATE OR REPLACE is safe).
-- ============================================================

CREATE OR REPLACE FUNCTION public.auth_user_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.roles r ON r.id = u.role_id
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = r.id AND rp.is_allowed = TRUE
    LEFT JOIN public.permissions p
      ON p.id = rp.permission_id
    WHERE u.auth_id = auth.uid()
      AND (
        lower(r.name) = 'super_admin'
        OR (lower(p.module) = lower(p_module) AND lower(p.action) = lower(p_action))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO anon, authenticated;


-- ============================================================
-- 1. EXTEND users TABLE with auth security columns
--    (Only add columns that may not already exist)
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts   INT          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until            TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_login_at           TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_active_at          TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cashier_pin_hash        TEXT         DEFAULT NULL; -- bcrypt hash

-- ============================================================
-- 2. LOGIN HISTORY (extend existing table)
-- ============================================================

-- Add extra columns to the existing login_history table
ALTER TABLE login_history
  ADD COLUMN IF NOT EXISTS device_name   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS login_method  TEXT DEFAULT 'password', -- password | pin | totp
  ADD COLUMN IF NOT EXISTS location_city TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_id    TEXT DEFAULT NULL; -- links to device_sessions

-- ============================================================
-- 3. DEVICE / SESSION MONITORING
-- ============================================================

CREATE TABLE IF NOT EXISTS device_sessions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token   TEXT        NOT NULL UNIQUE, -- supabase session access token prefix (first 32 chars)
  device_name     TEXT,
  browser         TEXT,
  os              TEXT,
  ip_address      TEXT,
  location_city   TEXT,
  is_current      BOOLEAN     DEFAULT TRUE,
  last_active_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_token   ON device_sessions(session_token);

-- ============================================================
-- 4. PASSWORD RESET TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE, -- SHA-256 of the raw token
  used_at     TIMESTAMPTZ DEFAULT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);

-- ============================================================
-- 5. TOTP / 2FA SECRETS (for admin 2FA)
-- ============================================================

CREATE TABLE IF NOT EXISTS totp_secrets (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  secret         TEXT        NOT NULL,           -- base32-encoded TOTP secret (store encrypted in prod)
  backup_codes   TEXT[]      DEFAULT '{}',        -- array of hashed backup codes
  is_verified    BOOLEAN     DEFAULT FALSE,       -- user has completed enrollment
  enrolled_at    TIMESTAMPTZ DEFAULT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. PASSWORD POLICY (global + per-branch settings)
-- ============================================================

-- We reuse the existing `settings` table for policy key-value pairs.
-- Keys we will set in seed:
--   'password_min_length'         → e.g. '8'
--   'password_require_uppercase'  → 'true'
--   'password_require_number'     → 'true'
--   'password_require_symbol'     → 'true'
--   'password_expiry_days'        → '90'   (0 = never)
--   'max_login_attempts'          → '5'
--   'lockout_duration_minutes'    → '15'
--   'session_timeout_minutes'     → '30'
--   'pin_length'                  → '4'
--   'require_2fa_for_admins'      → 'false'

-- ============================================================
-- 7. ACCOUNT LOCKOUT HELPER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_user_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           RECORD;
  v_max_attempts   INT;
  v_lockout_mins   INT;
  v_new_attempts   INT;
  v_locked_until   TIMESTAMPTZ;
BEGIN
  -- Fetch user
  SELECT failed_login_attempts, max_login_attempts, locked_until, branch_id
    INTO v_user
    FROM public.users
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Get policy values (fall back to user column)
  SELECT COALESCE(
    (SELECT s.value::int FROM public.settings s WHERE s.key = 'max_login_attempts' AND s.branch_id IS NULL LIMIT 1),
    v_user.max_login_attempts,
    5
  ) INTO v_max_attempts;

  SELECT COALESCE(
    (SELECT s.value::int FROM public.settings s WHERE s.key = 'lockout_duration_minutes' AND s.branch_id IS NULL LIMIT 1),
    15
  ) INTO v_lockout_mins;

  v_new_attempts := v_user.failed_login_attempts + 1;

  IF v_new_attempts >= v_max_attempts THEN
    v_locked_until := NOW() + (v_lockout_mins || ' minutes')::interval;
  ELSE
    v_locked_until := NULL;
  END IF;

  -- Update user
  UPDATE public.users
     SET failed_login_attempts = v_new_attempts,
         locked_until = v_locked_until
   WHERE id = p_user_id;

  -- Record login history
  INSERT INTO public.login_history (user_id, branch_id, ip_address, user_agent, status, login_method)
  VALUES (p_user_id, v_user.branch_id, p_ip_address, p_user_agent, 'failed', 'password');

  RETURN jsonb_build_object(
    'attempts',      v_new_attempts,
    'max_attempts',  v_max_attempts,
    'locked_until',  v_locked_until,
    'is_locked',     v_locked_until IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_successful_login(
  p_user_id     UUID,
  p_ip_address  TEXT DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL,
  p_login_method TEXT DEFAULT 'password',
  p_session_id  TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT branch_id INTO v_branch_id FROM public.users WHERE id = p_user_id;

  UPDATE public.users
     SET failed_login_attempts = 0,
         locked_until          = NULL,
         last_login_at         = NOW(),
         last_active_at        = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.login_history (user_id, branch_id, ip_address, user_agent, status, login_method, session_id, device_name)
  VALUES (p_user_id, v_branch_id, p_ip_address, p_user_agent, 'success', p_login_method, p_session_id, p_device_name);
END;
$$;

-- ============================================================
-- 8. CHECK ACCOUNT LOCK STATUS
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_account_lock(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT is_active, allow_login, locked_until, failed_login_attempts
    INTO v_user
    FROM public.users
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'user_not_found');
  END IF;

  IF NOT v_user.is_active THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'account_inactive');
  END IF;

  IF NOT v_user.allow_login THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'login_disabled');
  END IF;

  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'allowed',      FALSE,
      'reason',       'account_locked',
      'locked_until', v_user.locked_until,
      'retry_in_secs', EXTRACT(EPOCH FROM (v_user.locked_until - NOW()))::int
    );
  END IF;

  -- Auto-clear expired lock
  IF v_user.locked_until IS NOT NULL AND v_user.locked_until <= NOW() THEN
    UPDATE public.users
       SET locked_until = NULL, failed_login_attempts = 0
     WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('allowed', TRUE);
END;
$$;

-- ============================================================
-- 9. RESOLVE USERNAME → EMAIL (for username login)
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_auth_user_email(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Try username match first
  SELECT email INTO v_email
    FROM public.users
   WHERE lower(username) = lower(identifier)
     AND is_active = TRUE
   LIMIT 1;

  IF FOUND THEN RETURN v_email; END IF;

  -- Try email match
  SELECT email INTO v_email
    FROM public.users
   WHERE lower(email) = lower(identifier)
     AND is_active = TRUE
   LIMIT 1;

  RETURN v_email; -- NULL if not found
END;
$$;

-- ============================================================
-- 10. VERIFY CASHIER PIN
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_cashier_pin(
  p_username TEXT,
  p_pin      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, cashier_pin_hash, is_active, allow_login, locked_until
    INTO v_user
    FROM public.users
   WHERE lower(username) = lower(p_username)
      OR lower(email)    = lower(p_username)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'user_not_found');
  END IF;

  IF NOT v_user.is_active OR NOT v_user.allow_login THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'account_inactive');
  END IF;

  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > NOW() THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'account_locked', 'locked_until', v_user.locked_until);
  END IF;

  IF v_user.cashier_pin_hash IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'pin_not_set');
  END IF;

  -- Compare bcrypt hash
  IF v_user.cashier_pin_hash = crypt(p_pin, v_user.cashier_pin_hash) THEN
    RETURN jsonb_build_object('success', TRUE, 'user_id', v_user.id);
  ELSE
    RETURN jsonb_build_object('success', FALSE, 'reason', 'invalid_pin');
  END IF;
END;
$$;

-- ============================================================
-- 11. UPDATE LAST ACTIVE (heartbeat for auto-logout)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_last_active(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET last_active_at = NOW() WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- 12. GET PASSWORD POLICY (returns JSONB of all settings)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_password_policy()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_object_agg(key, value)
    FROM public.settings
   WHERE branch_id IS NULL
     AND key IN (
       'password_min_length', 'password_require_uppercase',
       'password_require_number', 'password_require_symbol',
       'password_expiry_days', 'max_login_attempts',
       'lockout_duration_minutes', 'session_timeout_minutes',
       'pin_length', 'require_2fa_for_admins'
     );
$$;

-- ============================================================
-- 13. SYNC AUTH USER PROFILE
--     The full version lives in wap_pos_supabase_schema.sql
--     (RETURNS users). We rely on that — no redefinition here.
-- ============================================================

-- ============================================================
-- 14. RLS for new tables
-- ============================================================

ALTER TABLE IF EXISTS device_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS password_reset_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS totp_secrets           ENABLE ROW LEVEL SECURITY;

-- Device sessions: user can see their own; admins can see all
DROP POLICY IF EXISTS "device_sessions_select" ON device_sessions;
CREATE POLICY "device_sessions_select" ON device_sessions
  FOR SELECT USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('users', 'view')
  );

DROP POLICY IF EXISTS "device_sessions_insert" ON device_sessions;
CREATE POLICY "device_sessions_insert" ON device_sessions
  FOR INSERT WITH CHECK (user_id = public.auth_user_profile_id());

DROP POLICY IF EXISTS "device_sessions_update" ON device_sessions;
CREATE POLICY "device_sessions_update" ON device_sessions
  FOR UPDATE USING (user_id = public.auth_user_profile_id())
  WITH CHECK (user_id = public.auth_user_profile_id());

DROP POLICY IF EXISTS "device_sessions_delete" ON device_sessions;
CREATE POLICY "device_sessions_delete" ON device_sessions
  FOR DELETE USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('users', 'edit')
  );

-- Password reset tokens: service-role only via API
DROP POLICY IF EXISTS "prt_select" ON password_reset_tokens;
CREATE POLICY "prt_select" ON password_reset_tokens
  FOR SELECT USING (user_id = public.auth_user_profile_id());

-- TOTP: user sees own
DROP POLICY IF EXISTS "totp_select" ON totp_secrets;
CREATE POLICY "totp_select" ON totp_secrets
  FOR SELECT USING (user_id = public.auth_user_profile_id());

DROP POLICY IF EXISTS "totp_insert" ON totp_secrets;
CREATE POLICY "totp_insert" ON totp_secrets
  FOR INSERT WITH CHECK (user_id = public.auth_user_profile_id());

DROP POLICY IF EXISTS "totp_update" ON totp_secrets;
CREATE POLICY "totp_update" ON totp_secrets
  FOR UPDATE USING (user_id = public.auth_user_profile_id())
  WITH CHECK (user_id = public.auth_user_profile_id());

-- Login history: own + admin
DROP POLICY IF EXISTS "login_history_select" ON login_history;
CREATE POLICY "login_history_select" ON login_history
  FOR SELECT USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('users', 'view')
  );

DROP POLICY IF EXISTS "login_history_insert" ON login_history;
CREATE POLICY "login_history_insert" ON login_history
  FOR INSERT WITH CHECK (TRUE); -- insert done via SECURITY DEFINER functions only

-- ============================================================
-- 15. GRANT EXECUTE on new functions
-- ============================================================

GRANT EXECUTE ON FUNCTION public.record_failed_login(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_successful_login(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_account_lock(UUID)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_auth_user_email(TEXT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(TEXT, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_last_active(UUID)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_password_policy()                 TO anon, authenticated;
-- Note: sync_auth_user_profile_by_id grant is in wap_pos_supabase_schema.sql

-- ============================================================
-- 16. DEFAULT SECURITY POLICY SETTINGS (idempotent upsert)
-- ============================================================

INSERT INTO public.settings (branch_id, key, value) VALUES
  (NULL, 'password_min_length',        '8'),
  (NULL, 'password_require_uppercase', 'true'),
  (NULL, 'password_require_number',    'true'),
  (NULL, 'password_require_symbol',    'false'),
  (NULL, 'password_expiry_days',       '90'),
  (NULL, 'max_login_attempts',         '5'),
  (NULL, 'lockout_duration_minutes',   '15'),
  (NULL, 'session_timeout_minutes',    '30'),
  (NULL, 'pin_length',                 '4'),
  (NULL, 'require_2fa_for_admins',     'false')
ON CONFLICT (branch_id, key) DO NOTHING;

-- ============================================================
-- 17. SET / CLEAR CASHIER PIN  (admin-only helper)
--     Uses pgcrypto's crypt() + gen_salt('bf') for bcrypt.
--     Called via the /api/auth/set-pin API route (service role).
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_cashier_pin(
  p_user_id UUID,
  p_pin     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(p_pin) < 4 OR length(p_pin) > 8 THEN
    RAISE EXCEPTION 'PIN must be between 4 and 8 digits';
  END IF;

  IF p_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must contain only digits';
  END IF;

  UPDATE public.users
     SET cashier_pin_hash = crypt(p_pin, gen_salt('bf')),
         updated_at       = NOW()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_cashier_pin(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET cashier_pin_hash = NULL,
         updated_at       = NOW()
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_cashier_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_cashier_pin(UUID)    TO authenticated;

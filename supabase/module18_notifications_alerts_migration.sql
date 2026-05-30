-- ============================================================
-- MODULE 18: NOTIFICATIONS & ALERTS
-- ============================================================
-- Adds reusable notification preferences, delivery logs, alert
-- metadata, and default thresholds for operational alerts.

BEGIN;

INSERT INTO public.permissions (module, action, description)
VALUES
  ('notifications', 'view', 'View in-app notifications and alert history'),
  ('notifications', 'manage', 'Manage alert generation and notification delivery')
ON CONFLICT (module, action) DO UPDATE
SET description = EXCLUDED.description;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_severity_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_severity_check
      CHECK (severity IN ('info', 'warning', 'critical'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_user_type_unique UNIQUE (user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS public.notification_email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  notification_type public.notification_type NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_email_logs_status_check CHECK (status IN ('queued', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type_branch_created
  ON public.notifications(notification_type, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON public.notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_email_logs_user_created
  ON public.notification_email_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_email_logs_type_status
  ON public.notification_email_logs(notification_type, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_notification_preferences_touch_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_touch_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_insert" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_update" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_delete" ON public.notification_preferences;

CREATE POLICY "notification_preferences_select" ON public.notification_preferences
  FOR SELECT
  USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('notifications', 'manage')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "notification_preferences_insert" ON public.notification_preferences
  FOR INSERT
  WITH CHECK (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('notifications', 'manage')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "notification_preferences_update" ON public.notification_preferences
  FOR UPDATE
  USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('notifications', 'manage')
    OR public.has_permission('users', 'manage')
  )
  WITH CHECK (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('notifications', 'manage')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "notification_preferences_delete" ON public.notification_preferences
  FOR DELETE
  USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('notifications', 'manage')
    OR public.has_permission('users', 'manage')
  );

DROP POLICY IF EXISTS "notification_email_logs_select" ON public.notification_email_logs;
DROP POLICY IF EXISTS "notification_email_logs_insert" ON public.notification_email_logs;
DROP POLICY IF EXISTS "notification_email_logs_update" ON public.notification_email_logs;
DROP POLICY IF EXISTS "notification_email_logs_delete" ON public.notification_email_logs;

CREATE POLICY "notification_email_logs_select" ON public.notification_email_logs
  FOR SELECT
  USING (
    user_id = public.auth_user_profile_id()
    OR (
      branch_id IS NOT NULL
      AND public.can_access_branch(branch_id)
      AND (
        public.has_permission('notifications', 'manage')
        OR public.has_permission('reports', 'view')
      )
    )
  );

CREATE POLICY "notification_email_logs_insert" ON public.notification_email_logs
  FOR INSERT
  WITH CHECK (
    public.has_permission('notifications', 'manage')
    OR public.has_permission('reports', 'manage')
  );

CREATE POLICY "notification_email_logs_update" ON public.notification_email_logs
  FOR UPDATE
  USING (
    public.has_permission('notifications', 'manage')
    OR public.has_permission('reports', 'manage')
  )
  WITH CHECK (
    public.has_permission('notifications', 'manage')
    OR public.has_permission('reports', 'manage')
  );

CREATE POLICY "notification_email_logs_delete" ON public.notification_email_logs
  FOR DELETE
  USING (
    public.has_permission('notifications', 'manage')
    OR public.has_permission('reports', 'manage')
  );

INSERT INTO public.settings (branch_id, key, value)
VALUES
  (NULL, 'notifications_enabled', 'true'),
  (NULL, 'email_notifications_enabled', 'true'),
  (NULL, 'notification_credit_due_days', '3'),
  (NULL, 'notification_supplier_payment_due_days', '5'),
  (NULL, 'notification_warranty_expiry_days', '14'),
  (NULL, 'notification_shift_closing_hours', '10'),
  (NULL, 'notification_unusual_discount_percent', '20'),
  (NULL, 'notification_unusual_discount_amount', '1000')
ON CONFLICT (branch_id, key) DO NOTHING;

CREATE OR REPLACE VIEW public.v_supplier_payables_due AS
SELECT
  po.id AS purchase_order_id,
  po.po_number,
  po.branch_id,
  po.supplier_id,
  s.code AS supplier_code,
  s.name AS supplier_name,
  po.status,
  po.expected_date,
  COALESCE(po.total_amount, 0) AS total_amount,
  COALESCE(po.paid_amount, 0) AS paid_amount,
  GREATEST(COALESCE(po.total_amount, 0) - COALESCE(po.paid_amount, 0), 0) AS balance_due,
  (
    COALESCE(po.expected_date, po.created_at::DATE)
    + MAKE_INTERVAL(days => GREATEST(COALESCE(s.payment_terms, 0), 0))
  )::DATE AS due_date
FROM public.purchase_orders AS po
JOIN public.suppliers AS s
  ON s.id = po.supplier_id
WHERE po.status IN ('approved', 'ordered', 'partially_received', 'fully_received')
  AND GREATEST(COALESCE(po.total_amount, 0) - COALESCE(po.paid_amount, 0), 0) > 0;

COMMIT;

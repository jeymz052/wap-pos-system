-- ============================================================
-- MODULE 20: SUBSCRIPTION & SAAS MANAGEMENT
-- ============================================================
-- Adds plan catalog, billing history, usage snapshots, feature
-- locks, and hard limit enforcement for branches, users, and
-- products.

BEGIN;

INSERT INTO public.permissions (module, action, description)
VALUES
  ('subscriptions', 'view', 'View subscription plans, limits, and billing history'),
  ('subscriptions', 'manage', 'Manage plans, renewals, invoices, and subscription settings')
ON CONFLICT (module, action) DO UPDATE
SET description = EXCLUDED.description;

ALTER TABLE public.subscriptions
  ALTER COLUMN branch_limit DROP NOT NULL,
  ALTER COLUMN user_limit DROP NOT NULL,
  ALTER COLUMN product_limit DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS renewal_date DATE,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_billing_cycle_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_cycle_check
      CHECK (billing_cycle IN ('monthly', 'annual', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_payment_status_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_payment_status_check
      CHECK (payment_status IN ('trial', 'paid', 'unpaid', 'past_due', 'overdue', 'cancelled'));
  END IF;
END $$;

ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS billing_period_start DATE,
  ADD COLUMN IF NOT EXISTS billing_period_end DATE,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.subscription_invoices
SET
  subtotal = COALESCE(subtotal, amount),
  total_amount = COALESCE(total_amount, amount),
  paid_amount = COALESCE(paid_amount, CASE WHEN paid_at IS NOT NULL THEN amount ELSE 0 END),
  invoice_number = COALESCE(invoice_number, 'SUB-' || TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMMDD') || '-' || LEFT(id::TEXT, 8)),
  due_date = COALESCE(due_date, created_at::DATE),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE subtotal IS NULL
   OR total_amount IS NULL
   OR invoice_number IS NULL
   OR due_date IS NULL
   OR updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_invoices_status_check'
  ) THEN
    ALTER TABLE public.subscription_invoices
      ADD CONSTRAINT subscription_invoices_status_check
      CHECK (status IN ('draft', 'issued', 'unpaid', 'partial', 'paid', 'void'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subscription_plan_definitions (
  plan public.subscription_plan PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  branch_limit INT,
  user_limit INT,
  product_limit INT,
  monthly_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  badge_text TEXT,
  accent_color TEXT NOT NULL DEFAULT '#1d4ed8',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_features (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'operations',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_plan_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan public.subscription_plan NOT NULL REFERENCES public.subscription_plan_definitions(plan) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES public.subscription_features(code) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_plan_features_unique UNIQUE (plan, feature_code)
);

CREATE TABLE IF NOT EXISTS public.subscription_feature_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_code TEXT NOT NULL REFERENCES public.subscription_features(code) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_feature_overrides_feature_unique UNIQUE (feature_code)
);

CREATE TABLE IF NOT EXISTS public.subscription_plan_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  previous_plan public.subscription_plan,
  next_plan public.subscription_plan NOT NULL,
  previous_branch_limit INT,
  previous_user_limit INT,
  previous_product_limit INT,
  next_branch_limit INT,
  next_user_limit INT,
  next_product_limit INT,
  change_reason TEXT,
  effective_on DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.subscription_plan_definitions (
  plan,
  display_name,
  description,
  branch_limit,
  user_limit,
  product_limit,
  monthly_price,
  annual_price,
  badge_text,
  accent_color,
  sort_order
)
VALUES
  ('starter', 'Starter Plan', 'For small single-branch shops.', 1, 3, 500, 1499, 14990, 'Best for new shops', '#0f766e', 1),
  ('professional', 'Professional Plan', 'For growing shops.', 3, 10, 5000, 3999, 39990, 'Most popular', '#1d4ed8', 2),
  ('enterprise', 'Enterprise Plan', 'For large motorparts businesses.', NULL, NULL, NULL, 9999, 99990, 'Unlimited scale', '#7c3aed', 3)
ON CONFLICT (plan) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  branch_limit = EXCLUDED.branch_limit,
  user_limit = EXCLUDED.user_limit,
  product_limit = EXCLUDED.product_limit,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  badge_text = EXCLUDED.badge_text,
  accent_color = EXCLUDED.accent_color,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO public.subscription_features (code, display_name, description, category)
VALUES
  ('pos', 'POS', 'Point-of-sale and checkout workflows.', 'core'),
  ('basic_inventory', 'Basic Inventory', 'Catalog, stock, and on-hand inventory tools.', 'core'),
  ('basic_reports', 'Basic Reports', 'Essential operational and financial reporting.', 'core'),
  ('barcode_printing', 'Barcode Printing', 'Barcode generation and label printing tools.', 'operations'),
  ('purchase_orders', 'Purchase Orders', 'Purchasing, receiving, and supplier ordering workflows.', 'operations'),
  ('customer_credit', 'Customer Credit', 'Receivables, credit invoicing, and collections.', 'finance'),
  ('advanced_reports', 'Advanced Reports', 'Scheduled exports, deeper analytics, and advanced report tooling.', 'analytics'),
  ('multi_branch_transfers', 'Multi-Branch Transfers', 'Inter-branch stock movement and transfer workflows.', 'operations'),
  ('api_access', 'API Access', 'API usage and external integration access.', 'platform'),
  ('audit_logs', 'Audit Logs', 'System audit trail, activity history, and compliance records.', 'security'),
  ('advanced_analytics', 'Advanced Analytics', 'Owner-level analytics and decision support metrics.', 'analytics'),
  ('custom_branding', 'Custom Branding', 'Tenant branding and white-label configuration.', 'platform')
ON CONFLICT (code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO public.subscription_plan_features (plan, feature_code, is_enabled)
VALUES
  ('starter', 'pos', TRUE),
  ('starter', 'basic_inventory', TRUE),
  ('starter', 'basic_reports', TRUE),
  ('professional', 'pos', TRUE),
  ('professional', 'basic_inventory', TRUE),
  ('professional', 'basic_reports', TRUE),
  ('professional', 'barcode_printing', TRUE),
  ('professional', 'purchase_orders', TRUE),
  ('professional', 'customer_credit', TRUE),
  ('professional', 'advanced_reports', TRUE),
  ('enterprise', 'pos', TRUE),
  ('enterprise', 'basic_inventory', TRUE),
  ('enterprise', 'basic_reports', TRUE),
  ('enterprise', 'barcode_printing', TRUE),
  ('enterprise', 'purchase_orders', TRUE),
  ('enterprise', 'customer_credit', TRUE),
  ('enterprise', 'advanced_reports', TRUE),
  ('enterprise', 'multi_branch_transfers', TRUE),
  ('enterprise', 'api_access', TRUE),
  ('enterprise', 'audit_logs', TRUE),
  ('enterprise', 'advanced_analytics', TRUE),
  ('enterprise', 'custom_branding', TRUE)
ON CONFLICT (plan, feature_code) DO UPDATE
SET is_enabled = EXCLUDED.is_enabled;

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_dates
  ON public.subscriptions(is_active, renewal_date, ends_at);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription_created
  ON public.subscription_invoices(subscription_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_number
  ON public.subscription_invoices(invoice_number);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_change_log_subscription_created
  ON public.subscription_plan_change_log(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_features_category
  ON public.subscription_features(category, code);

DROP TRIGGER IF EXISTS trg_subscription_plan_definitions_touch_updated_at ON public.subscription_plan_definitions;
CREATE TRIGGER trg_subscription_plan_definitions_touch_updated_at
BEFORE UPDATE ON public.subscription_plan_definitions
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_feature_overrides_touch_updated_at ON public.subscription_feature_overrides;
CREATE TRIGGER trg_subscription_feature_overrides_touch_updated_at
BEFORE UPDATE ON public.subscription_feature_overrides
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_invoices_touch_updated_at ON public.subscription_invoices;
CREATE TRIGGER trg_subscription_invoices_touch_updated_at
BEFORE UPDATE ON public.subscription_invoices
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.subscription_plan_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plan_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_plan_definitions_select" ON public.subscription_plan_definitions;
DROP POLICY IF EXISTS "subscription_features_select" ON public.subscription_features;
DROP POLICY IF EXISTS "subscription_plan_features_select" ON public.subscription_plan_features;
DROP POLICY IF EXISTS "subscription_feature_overrides_select" ON public.subscription_feature_overrides;
DROP POLICY IF EXISTS "subscription_feature_overrides_manage" ON public.subscription_feature_overrides;
DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_manage" ON public.subscriptions;
DROP POLICY IF EXISTS "subscription_invoices_select" ON public.subscription_invoices;
DROP POLICY IF EXISTS "subscription_invoices_manage" ON public.subscription_invoices;
DROP POLICY IF EXISTS "subscription_plan_change_log_select" ON public.subscription_plan_change_log;
DROP POLICY IF EXISTS "subscription_plan_change_log_manage" ON public.subscription_plan_change_log;

CREATE POLICY "subscription_plan_definitions_select" ON public.subscription_plan_definitions
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscription_features_select" ON public.subscription_features
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscription_plan_features_select" ON public.subscription_plan_features
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscription_feature_overrides_select" ON public.subscription_feature_overrides
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscription_feature_overrides_manage" ON public.subscription_feature_overrides
  FOR ALL
  USING (public.has_permission('subscriptions', 'manage'))
  WITH CHECK (public.has_permission('subscriptions', 'manage'));

CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscriptions_manage" ON public.subscriptions
  FOR ALL
  USING (public.has_permission('subscriptions', 'manage'))
  WITH CHECK (public.has_permission('subscriptions', 'manage'));

CREATE POLICY "subscription_invoices_select" ON public.subscription_invoices
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
    OR public.has_permission('reports', 'view')
  );

CREATE POLICY "subscription_invoices_manage" ON public.subscription_invoices
  FOR ALL
  USING (public.has_permission('subscriptions', 'manage'))
  WITH CHECK (public.has_permission('subscriptions', 'manage'));

CREATE POLICY "subscription_plan_change_log_select" ON public.subscription_plan_change_log
  FOR SELECT
  USING (
    public.has_permission('subscriptions', 'view')
    OR public.has_permission('subscriptions', 'manage')
  );

CREATE POLICY "subscription_plan_change_log_manage" ON public.subscription_plan_change_log
  FOR ALL
  USING (public.has_permission('subscriptions', 'manage'))
  WITH CHECK (public.has_permission('subscriptions', 'manage'));

CREATE OR REPLACE FUNCTION public.current_subscription_row()
RETURNS public.subscriptions
LANGUAGE SQL
STABLE
AS $$
  SELECT sub.*
  FROM public.subscriptions AS sub
  ORDER BY
    sub.is_active DESC,
    COALESCE(sub.renewal_date::TIMESTAMPTZ, sub.ends_at, sub.trial_ends_at, sub.starts_at) DESC,
    sub.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.subscription_feature_enabled(p_feature_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  sub public.subscriptions;
  override_enabled BOOLEAN;
  plan_enabled BOOLEAN;
BEGIN
  sub := public.current_subscription_row();

  IF sub.id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT sfo.is_enabled
  INTO override_enabled
  FROM public.subscription_feature_overrides AS sfo
  WHERE sfo.feature_code = p_feature_code;

  IF override_enabled IS NOT NULL THEN
    RETURN override_enabled;
  END IF;

  SELECT spf.is_enabled
  INTO plan_enabled
  FROM public.subscription_plan_features AS spf
  WHERE spf.plan = sub.plan
    AND spf.feature_code = p_feature_code;

  RETURN COALESCE(plan_enabled, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_subscription_limit(p_limit_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  sub public.subscriptions;
  limit_value INT;
  current_count INT;
BEGIN
  sub := public.current_subscription_row();

  IF sub.id IS NULL THEN
    RETURN;
  END IF;

  CASE p_limit_type
    WHEN 'branches' THEN
      limit_value := sub.branch_limit;
      IF limit_value IS NULL THEN
        RETURN;
      END IF;

      SELECT COUNT(*)
      INTO current_count
      FROM public.branches
      WHERE is_active = TRUE;

      IF current_count >= limit_value THEN
        RAISE EXCEPTION 'Branch limit reached for the % plan (% active branches allowed).', sub.plan, limit_value
          USING ERRCODE = 'P0001';
      END IF;

    WHEN 'users' THEN
      limit_value := sub.user_limit;
      IF limit_value IS NULL THEN
        RETURN;
      END IF;

      SELECT COUNT(*)
      INTO current_count
      FROM public.users
      WHERE is_active = TRUE;

      IF current_count >= limit_value THEN
        RAISE EXCEPTION 'User limit reached for the % plan (% active users allowed).', sub.plan, limit_value
          USING ERRCODE = 'P0001';
      END IF;

    WHEN 'products' THEN
      limit_value := sub.product_limit;
      IF limit_value IS NULL THEN
        RETURN;
      END IF;

      SELECT COUNT(*)
      INTO current_count
      FROM public.products
      WHERE COALESCE(status::TEXT, 'active') = 'active';

      IF current_count >= limit_value THEN
        RAISE EXCEPTION 'Product limit reached for the % plan (% active products allowed).', sub.plan, limit_value
          USING ERRCODE = 'P0001';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported subscription limit type: %', p_limit_type
        USING ERRCODE = 'P0001';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_branch_subscription_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_active, FALSE) IS DISTINCT FROM TRUE) THEN
    PERFORM public.assert_subscription_limit('branches');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_user_subscription_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_active, FALSE) IS DISTINCT FROM TRUE) THEN
    PERFORM public.assert_subscription_limit('users');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_subscription_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.status::TEXT, 'active') = 'active'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status::TEXT, 'inactive') <> 'active') THEN
    PERFORM public.assert_subscription_limit('products');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_subscription_limit ON public.branches;
CREATE TRIGGER trg_branches_subscription_limit
BEFORE INSERT OR UPDATE OF is_active ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.enforce_branch_subscription_limit();

DROP TRIGGER IF EXISTS trg_users_subscription_limit ON public.users;
CREATE TRIGGER trg_users_subscription_limit
BEFORE INSERT OR UPDATE OF is_active ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_subscription_limit();

DROP TRIGGER IF EXISTS trg_products_subscription_limit ON public.products;
CREATE TRIGGER trg_products_subscription_limit
BEFORE INSERT OR UPDATE OF status ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_subscription_limit();

CREATE OR REPLACE VIEW public.v_subscription_usage AS
WITH sub AS (
  SELECT *
  FROM public.current_subscription_row()
),
usage_counts AS (
  SELECT
    (SELECT COUNT(*) FROM public.branches WHERE is_active = TRUE) AS active_branch_count,
    (SELECT COUNT(*) FROM public.users WHERE is_active = TRUE) AS active_user_count,
    (SELECT COUNT(*) FROM public.products WHERE COALESCE(status::TEXT, 'active') = 'active') AS active_product_count,
    (SELECT COUNT(*) FROM public.subscription_invoices WHERE status IN ('issued', 'unpaid', 'partial')) AS open_invoice_count
)
SELECT
  sub.id AS subscription_id,
  sub.plan,
  sub.display_name,
  sub.is_active,
  sub.is_trial,
  sub.trial_ends_at,
  sub.starts_at,
  sub.ends_at,
  sub.renewal_date,
  sub.payment_status,
  sub.billing_cycle,
  sub.currency_code,
  sub.branch_limit,
  sub.user_limit,
  sub.product_limit,
  usage_counts.active_branch_count,
  usage_counts.active_user_count,
  usage_counts.active_product_count,
  usage_counts.open_invoice_count,
  CASE
    WHEN sub.branch_limit IS NULL OR sub.branch_limit = 0 THEN 0
    ELSE ROUND((usage_counts.active_branch_count::NUMERIC / sub.branch_limit::NUMERIC) * 100, 2)
  END AS branch_usage_percent,
  CASE
    WHEN sub.user_limit IS NULL OR sub.user_limit = 0 THEN 0
    ELSE ROUND((usage_counts.active_user_count::NUMERIC / sub.user_limit::NUMERIC) * 100, 2)
  END AS user_usage_percent,
  CASE
    WHEN sub.product_limit IS NULL OR sub.product_limit = 0 THEN 0
    ELSE ROUND((usage_counts.active_product_count::NUMERIC / sub.product_limit::NUMERIC) * 100, 2)
  END AS product_usage_percent
FROM sub
CROSS JOIN usage_counts;

CREATE OR REPLACE VIEW public.v_subscription_feature_matrix AS
WITH sub AS (
  SELECT *
  FROM public.current_subscription_row()
)
SELECT
  sf.code,
  sf.display_name,
  sf.description,
  sf.category,
  sub.plan,
  COALESCE(sfo.is_enabled, spf.is_enabled, FALSE) AS is_enabled,
  sfo.notes AS override_notes
FROM public.subscription_features AS sf
CROSS JOIN sub
LEFT JOIN public.subscription_plan_features AS spf
  ON spf.feature_code = sf.code
 AND spf.plan = sub.plan
LEFT JOIN public.subscription_feature_overrides AS sfo
  ON sfo.feature_code = sf.code
ORDER BY sf.category, sf.display_name;

DROP TRIGGER IF EXISTS trg_audit_subscriptions ON public.subscriptions;
CREATE TRIGGER trg_audit_subscriptions
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'subscriptions',
  'subscription',
  '',
  'updated_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_subscription_invoices ON public.subscription_invoices;
CREATE TRIGGER trg_audit_subscription_invoices
AFTER INSERT OR UPDATE OR DELETE ON public.subscription_invoices
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'subscriptions',
  'subscription_invoice',
  '',
  'created_by',
  'updated_at'
);

DO $$
DECLARE
  branch_count INT;
  user_count INT;
  product_count INT;
  chosen_plan public.subscription_plan;
  chosen_branch_limit INT;
  chosen_user_limit INT;
  chosen_product_limit INT;
  start_ts TIMESTAMPTZ := NOW();
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE is_active = TRUE) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO branch_count FROM public.branches WHERE is_active = TRUE;
  SELECT COUNT(*) INTO user_count FROM public.users WHERE is_active = TRUE;
  SELECT COUNT(*) INTO product_count FROM public.products WHERE COALESCE(status::TEXT, 'active') = 'active';

  IF branch_count <= 1 AND user_count <= 3 AND product_count <= 500 THEN
    chosen_plan := 'starter';
  ELSIF branch_count <= 3 AND user_count <= 10 AND product_count <= 5000 THEN
    chosen_plan := 'professional';
  ELSE
    chosen_plan := 'enterprise';
  END IF;

  SELECT branch_limit, user_limit, product_limit
  INTO chosen_branch_limit, chosen_user_limit, chosen_product_limit
  FROM public.subscription_plan_definitions
  WHERE plan = chosen_plan;

  INSERT INTO public.subscriptions (
    plan,
    display_name,
    branch_limit,
    user_limit,
    product_limit,
    is_trial,
    trial_ends_at,
    starts_at,
    renewal_date,
    is_active,
    payment_status,
    billing_cycle,
    currency_code,
    auto_renew,
    notes
  )
  VALUES (
    chosen_plan,
    (SELECT display_name FROM public.subscription_plan_definitions WHERE plan = chosen_plan),
    chosen_branch_limit,
    chosen_user_limit,
    chosen_product_limit,
    TRUE,
    start_ts + INTERVAL '14 days',
    start_ts,
    (start_ts + INTERVAL '14 days')::DATE,
    TRUE,
    'trial',
    'monthly',
    'PHP',
    TRUE,
    'Auto-created by Module 20 migration.'
  );
END $$;

COMMIT;

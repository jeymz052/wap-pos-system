-- ============================================================
-- MODULE 16: USER MANAGEMENT & PERMISSIONS
-- ============================================================
-- Adds per-user permission overrides, sales restriction settings,
-- audit helpers, and reusable views for user administration.

BEGIN;

INSERT INTO public.permissions (module, action, description)
VALUES
  ('inventory', 'view_cost_price', 'View product cost price and margin-sensitive inventory values'),
  ('returns', 'refund', 'Finalize customer refunds and issue store credit')
ON CONFLICT (module, action) DO UPDATE
SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_permission_overrides_unique UNIQUE (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_sales_restrictions (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  can_view_cost_price BOOLEAN,
  can_apply_discount BOOLEAN,
  can_void_sale BOOLEAN,
  can_refund BOOLEAN,
  can_edit_inventory BOOLEAN,
  can_delete_product BOOLEAN,
  can_approve_purchase_order BOOLEAN,
  can_view_reports BOOLEAN,
  allow_price_override BOOLEAN,
  allow_negative_inventory BOOLEAN,
  require_supervisor_for_discount BOOLEAN NOT NULL DEFAULT FALSE,
  require_supervisor_for_void BOOLEAN NOT NULL DEFAULT FALSE,
  require_supervisor_for_refund BOOLEAN NOT NULL DEFAULT FALSE,
  discount_limit_percent NUMERIC(5, 2),
  discount_limit_amount NUMERIC(12, 2),
  max_refund_amount NUMERIC(12, 2),
  notes TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_sales_restrictions_discount_percent_check CHECK (
    discount_limit_percent IS NULL
    OR (discount_limit_percent >= 0 AND discount_limit_percent <= 100)
  ),
  CONSTRAINT user_sales_restrictions_discount_amount_check CHECK (
    discount_limit_amount IS NULL OR discount_limit_amount >= 0
  ),
  CONSTRAINT user_sales_restrictions_refund_amount_check CHECK (
    max_refund_amount IS NULL OR max_refund_amount >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user
  ON public.user_permission_overrides(user_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_permission
  ON public.user_permission_overrides(permission_id);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sales_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permission_overrides_select" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "user_permission_overrides_insert" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "user_permission_overrides_update" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "user_permission_overrides_delete" ON public.user_permission_overrides;

CREATE POLICY "user_permission_overrides_select" ON public.user_permission_overrides
  FOR SELECT
  USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('users', 'view')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_permission_overrides_insert" ON public.user_permission_overrides
  FOR INSERT
  WITH CHECK (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_permission_overrides_update" ON public.user_permission_overrides
  FOR UPDATE
  USING (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  )
  WITH CHECK (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_permission_overrides_delete" ON public.user_permission_overrides
  FOR DELETE
  USING (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

DROP POLICY IF EXISTS "user_sales_restrictions_select" ON public.user_sales_restrictions;
DROP POLICY IF EXISTS "user_sales_restrictions_insert" ON public.user_sales_restrictions;
DROP POLICY IF EXISTS "user_sales_restrictions_update" ON public.user_sales_restrictions;
DROP POLICY IF EXISTS "user_sales_restrictions_delete" ON public.user_sales_restrictions;

CREATE POLICY "user_sales_restrictions_select" ON public.user_sales_restrictions
  FOR SELECT
  USING (
    user_id = public.auth_user_profile_id()
    OR public.has_permission('users', 'view')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_sales_restrictions_insert" ON public.user_sales_restrictions
  FOR INSERT
  WITH CHECK (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_sales_restrictions_update" ON public.user_sales_restrictions
  FOR UPDATE
  USING (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  )
  WITH CHECK (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

CREATE POLICY "user_sales_restrictions_delete" ON public.user_sales_restrictions
  FOR DELETE
  USING (
    public.has_permission('users', 'edit')
    OR public.has_permission('users', 'manage')
  );

DROP TRIGGER IF EXISTS trg_user_permission_overrides_touch_updated_at ON public.user_permission_overrides;
CREATE TRIGGER trg_user_permission_overrides_touch_updated_at
BEFORE UPDATE ON public.user_permission_overrides
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_sales_restrictions_touch_updated_at ON public.user_sales_restrictions;
CREATE TRIGGER trg_user_sales_restrictions_touch_updated_at
BEFORE UPDATE ON public.user_sales_restrictions
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_module TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_name TEXT;
  v_permission_id UUID;
  v_override BOOLEAN;
  v_allowed BOOLEAN := FALSE;
  v_restrictions public.user_sales_restrictions%ROWTYPE;
BEGIN
  SELECT lower(r.name)
    INTO v_role_name
  FROM public.users AS u
  LEFT JOIN public.roles AS r
    ON r.id = u.role_id
  WHERE u.id = p_user_id;

  IF v_role_name = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  SELECT p.id
    INTO v_permission_id
  FROM public.permissions AS p
  WHERE lower(p.module) = lower(p_module)
    AND lower(p.action) = lower(p_action)
  LIMIT 1;

  IF v_permission_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.role_permissions AS rp
      ON rp.role_id = u.role_id
    WHERE u.id = p_user_id
      AND rp.permission_id = v_permission_id
      AND rp.is_allowed = TRUE
  )
  INTO v_allowed;

  SELECT uo.is_allowed
    INTO v_override
  FROM public.user_permission_overrides AS uo
  WHERE uo.user_id = p_user_id
    AND uo.permission_id = v_permission_id
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    v_allowed := v_override;
  END IF;

  SELECT *
    INTO v_restrictions
  FROM public.user_sales_restrictions AS usr
  WHERE usr.user_id = p_user_id;

  IF FOUND THEN
    IF lower(p_module) = 'inventory' AND lower(p_action) = 'view_cost_price' AND v_restrictions.can_view_cost_price IS NOT NULL THEN
      v_allowed := v_restrictions.can_view_cost_price;
    ELSIF lower(p_module) = 'pos' AND lower(p_action) = 'apply_discount' AND v_restrictions.can_apply_discount IS NOT NULL THEN
      v_allowed := v_restrictions.can_apply_discount;
    ELSIF lower(p_module) = 'pos' AND lower(p_action) = 'void' AND v_restrictions.can_void_sale IS NOT NULL THEN
      v_allowed := v_restrictions.can_void_sale;
    ELSIF lower(p_module) = 'returns' AND lower(p_action) = 'refund' AND v_restrictions.can_refund IS NOT NULL THEN
      v_allowed := v_restrictions.can_refund;
    ELSIF lower(p_module) = 'inventory' AND lower(p_action) = 'edit' AND v_restrictions.can_edit_inventory IS NOT NULL THEN
      v_allowed := v_restrictions.can_edit_inventory;
    ELSIF lower(p_module) = 'inventory' AND lower(p_action) = 'delete' AND v_restrictions.can_delete_product IS NOT NULL THEN
      v_allowed := v_restrictions.can_delete_product;
    ELSIF lower(p_module) = 'purchasing' AND lower(p_action) = 'approve' AND v_restrictions.can_approve_purchase_order IS NOT NULL THEN
      v_allowed := v_restrictions.can_approve_purchase_order;
    ELSIF lower(p_module) = 'reports' AND lower(p_action) = 'view' AND v_restrictions.can_view_reports IS NOT NULL THEN
      v_allowed := v_restrictions.can_view_reports;
    END IF;
  END IF;

  RETURN COALESCE(v_allowed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id UUID,
  p_branch_id UUID,
  p_module TEXT,
  p_action TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    branch_id,
    module,
    action,
    reference_type,
    reference_id,
    old_values,
    new_values,
    ip_address,
    user_agent
  )
  VALUES (
    p_user_id,
    p_branch_id,
    p_module,
    p_action,
    p_reference_type,
    p_reference_id,
    p_old_values,
    p_new_values,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE VIEW public.v_user_effective_permissions AS
WITH base_permissions AS (
  SELECT
    u.id AS user_id,
    p.id AS permission_id,
    p.module,
    p.action,
    p.description,
    TRUE AS is_allowed,
    'role'::TEXT AS source
  FROM public.users AS u
  JOIN public.roles AS r
    ON r.id = u.role_id
  JOIN public.role_permissions AS rp
    ON rp.role_id = r.id
   AND rp.is_allowed = TRUE
  JOIN public.permissions AS p
    ON p.id = rp.permission_id
  WHERE lower(r.name) <> 'super_admin'

  UNION ALL

  SELECT
    u.id AS user_id,
    p.id AS permission_id,
    p.module,
    p.action,
    p.description,
    TRUE AS is_allowed,
    'role'::TEXT AS source
  FROM public.users AS u
  JOIN public.roles AS r
    ON r.id = u.role_id
  CROSS JOIN public.permissions AS p
  WHERE lower(r.name) = 'super_admin'
),
overrides AS (
  SELECT
    uo.user_id,
    p.id AS permission_id,
    p.module,
    p.action,
    p.description,
    uo.is_allowed,
    'override'::TEXT AS source
  FROM public.user_permission_overrides AS uo
  JOIN public.permissions AS p
    ON p.id = uo.permission_id
),
restriction_permissions AS (
  SELECT
    usr.user_id,
    p.id AS permission_id,
    p.module,
    p.action,
    p.description,
    CASE
      WHEN p.module = 'inventory' AND p.action = 'view_cost_price' THEN usr.can_view_cost_price
      WHEN p.module = 'pos' AND p.action = 'apply_discount' THEN usr.can_apply_discount
      WHEN p.module = 'pos' AND p.action = 'void' THEN usr.can_void_sale
      WHEN p.module = 'returns' AND p.action = 'refund' THEN usr.can_refund
      WHEN p.module = 'inventory' AND p.action = 'edit' THEN usr.can_edit_inventory
      WHEN p.module = 'inventory' AND p.action = 'delete' THEN usr.can_delete_product
      WHEN p.module = 'purchasing' AND p.action = 'approve' THEN usr.can_approve_purchase_order
      WHEN p.module = 'reports' AND p.action = 'view' THEN usr.can_view_reports
      ELSE NULL
    END AS is_allowed,
    'restriction'::TEXT AS source
  FROM public.user_sales_restrictions AS usr
  JOIN public.permissions AS p
    ON (p.module, p.action) IN (
      ('inventory', 'view_cost_price'),
      ('pos', 'apply_discount'),
      ('pos', 'void'),
      ('returns', 'refund'),
      ('inventory', 'edit'),
      ('inventory', 'delete'),
      ('purchasing', 'approve'),
      ('reports', 'view')
    )
),
ranked AS (
  SELECT
    combined.*,
    ROW_NUMBER() OVER (
      PARTITION BY combined.user_id, combined.permission_id
      ORDER BY CASE combined.source
        WHEN 'restriction' THEN 3
        WHEN 'override' THEN 2
        ELSE 1
      END DESC
    ) AS priority_rank
  FROM (
    SELECT * FROM base_permissions
    UNION ALL
    SELECT * FROM overrides
    UNION ALL
    SELECT * FROM restriction_permissions WHERE is_allowed IS NOT NULL
  ) AS combined
)
SELECT
  user_id,
  permission_id,
  module,
  action,
  description,
  is_allowed,
  source
FROM ranked
WHERE priority_rank = 1
  AND is_allowed = TRUE;

CREATE OR REPLACE VIEW public.v_user_management_overview AS
SELECT
  u.id,
  u.auth_id,
  u.first_name,
  u.last_name,
  u.username,
  u.email,
  u.phone,
  u.employee_id,
  u.role_id,
  r.name AS role_name,
  r.description AS role_description,
  u.branch_id,
  br.name AS branch_name,
  u.data_access_scope,
  u.is_active,
  u.allow_login,
  u.two_factor_enabled,
  u.last_login_at,
  u.last_active_at,
  u.failed_login_attempts,
  u.locked_until,
  (u.cashier_pin_hash IS NOT NULL) AS has_cashier_pin,
  usr.can_view_cost_price,
  usr.can_apply_discount,
  usr.can_void_sale,
  usr.can_refund,
  usr.can_edit_inventory,
  usr.can_delete_product,
  usr.can_approve_purchase_order,
  usr.can_view_reports,
  usr.allow_price_override,
  usr.allow_negative_inventory,
  usr.require_supervisor_for_discount,
  usr.require_supervisor_for_void,
  usr.require_supervisor_for_refund,
  usr.discount_limit_percent,
  usr.discount_limit_amount,
  usr.max_refund_amount,
  usr.notes AS restriction_notes,
  u.created_at,
  u.updated_at
FROM public.users AS u
LEFT JOIN public.roles AS r
  ON r.id = u.role_id
LEFT JOIN public.branches AS br
  ON br.id = u.branch_id
LEFT JOIN public.user_sales_restrictions AS usr
  ON usr.user_id = u.id;

CREATE OR REPLACE VIEW public.v_user_activity_feed AS
SELECT
  lh.user_id,
  lh.branch_id,
  'login_history'::TEXT AS event_source,
  lh.id AS event_id,
  lh.status AS event_action,
  lh.login_method AS event_type,
  NULL::TEXT AS reference_type,
  NULL::UUID AS reference_id,
  jsonb_build_object(
    'status', lh.status,
    'login_method', lh.login_method,
    'device_name', lh.device_name,
    'ip_address', lh.ip_address,
    'logged_in_at', lh.logged_in_at
  ) AS event_payload,
  lh.logged_in_at AS event_at
FROM public.login_history AS lh

UNION ALL

SELECT
  al.user_id,
  al.branch_id,
  'audit_logs'::TEXT AS event_source,
  al.id AS event_id,
  al.action AS event_action,
  al.module AS event_type,
  al.reference_type,
  al.reference_id,
  jsonb_strip_nulls(jsonb_build_object(
    'old_values', al.old_values,
    'new_values', al.new_values,
    'ip_address', al.ip_address
  )) AS event_payload,
  al.created_at AS event_at
FROM public.audit_logs AS al;

GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB, JSONB, TEXT, TEXT) TO anon, authenticated;

COMMIT;

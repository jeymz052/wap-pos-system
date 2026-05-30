-- ============================================================
-- MODULE 17: AUDIT LOGS & ACTIVITY HISTORY
-- ============================================================
-- Automates audit capture for critical operational tables and
-- exposes a unified activity history view for login events,
-- product changes, price changes, stock adjustments, deletes,
-- voids, refunds, and broader user activity.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action_created
  ON public.audit_logs(module, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_reference
  ON public.audit_logs(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_login_history_user_logged_in
  ON public.login_history(user_id, logged_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_history_branch_logged_in
  ON public.login_history(branch_id, logged_in_at DESC);

CREATE OR REPLACE FUNCTION public.audit_clean_payload(
  p_payload JSONB,
  p_ignored_columns TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_payload IS NULL THEN NULL
    ELSE p_payload - COALESCE(p_ignored_columns, ARRAY[]::TEXT[])
  END
$$;

CREATE OR REPLACE FUNCTION public.audit_pick_uuid(
  p_payload JSONB,
  p_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key TEXT;
  v_value TEXT;
BEGIN
  IF p_payload IS NULL OR p_keys IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY p_keys LOOP
    IF COALESCE(BTRIM(v_key), '') = '' THEN
      CONTINUE;
    END IF;

    v_value := NULLIF(BTRIM(p_payload ->> v_key), '');
    IF v_value IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      RETURN v_value::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_module TEXT := COALESCE(NULLIF(TG_ARGV[0], ''), TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME);
  v_reference_type TEXT := COALESCE(NULLIF(TG_ARGV[1], ''), TG_TABLE_NAME);
  v_branch_column TEXT := NULLIF(TG_ARGV[2], '');
  v_user_columns TEXT[] := string_to_array(COALESCE(NULLIF(TG_ARGV[3], ''), ''), ',');
  v_ignored_columns TEXT[] := string_to_array(COALESCE(NULLIF(TG_ARGV[4], ''), ''), ',');
  v_old_payload JSONB;
  v_new_payload JSONB;
  v_old_clean JSONB;
  v_new_clean JSONB;
  v_reference_id UUID;
  v_branch_id UUID;
  v_actor_user_id UUID;
  v_action TEXT;
BEGIN
  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'audit_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_old_payload := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new_payload := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_old_clean := public.audit_clean_payload(v_old_payload, v_ignored_columns);
  v_new_clean := public.audit_clean_payload(v_new_payload, v_ignored_columns);

  IF TG_OP = 'UPDATE' AND v_old_clean IS NOT DISTINCT FROM v_new_clean THEN
    RETURN NEW;
  END IF;

  v_reference_id := COALESCE(
    public.audit_pick_uuid(v_new_clean, ARRAY['id']),
    public.audit_pick_uuid(v_old_clean, ARRAY['id'])
  );

  IF v_branch_column IS NOT NULL THEN
    v_branch_id := COALESCE(
      public.audit_pick_uuid(v_new_clean, ARRAY[v_branch_column]),
      public.audit_pick_uuid(v_old_clean, ARRAY[v_branch_column])
    );
  END IF;

  v_actor_user_id := COALESCE(
    public.audit_pick_uuid(v_new_clean, v_user_columns),
    public.audit_pick_uuid(v_old_clean, v_user_columns),
    public.auth_user_profile_id()
  );

  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    WHEN 'DELETE' THEN 'delete'
    ELSE lower(TG_OP)
  END;

  INSERT INTO public.audit_logs (
    user_id,
    branch_id,
    module,
    action,
    reference_type,
    reference_id,
    old_values,
    new_values,
    created_at
  )
  VALUES (
    v_actor_user_id,
    v_branch_id,
    v_module,
    v_action,
    v_reference_type,
    v_reference_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_old_clean END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_new_clean END,
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'product',
  '',
  'created_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_product_variants ON public.product_variants;
CREATE TRIGGER trg_audit_product_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'product_variant',
  '',
  '',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_product_images ON public.product_images;
CREATE TRIGGER trg_audit_product_images
AFTER INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'product_image',
  '',
  '',
  ''
);

DROP TRIGGER IF EXISTS trg_audit_product_compatibility ON public.product_compatibility;
CREATE TRIGGER trg_audit_product_compatibility
AFTER INSERT OR UPDATE OR DELETE ON public.product_compatibility
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'product_compatibility',
  '',
  '',
  ''
);

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
AFTER INSERT OR UPDATE OR DELETE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'customers',
  'customer',
  'branch_id',
  '',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_suppliers ON public.suppliers;
CREATE TRIGGER trg_audit_suppliers
AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'suppliers',
  'supplier',
  '',
  '',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_branches ON public.branches;
CREATE TRIGGER trg_audit_branches
AFTER INSERT OR UPDATE OR DELETE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'branches',
  'branch',
  '',
  '',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_branch_product_prices ON public.branch_product_prices;
CREATE TRIGGER trg_audit_branch_product_prices
AFTER INSERT OR UPDATE OR DELETE ON public.branch_product_prices
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'branches',
  'branch_product_price',
  'branch_id',
  'created_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_stock_adjustments ON public.stock_adjustments;
CREATE TRIGGER trg_audit_stock_adjustments
AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_adjustment',
  'branch_id',
  'created_by,approved_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_stock_adjustment_items ON public.stock_adjustment_items;
CREATE TRIGGER trg_audit_stock_adjustment_items
AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustment_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_adjustment_item',
  '',
  '',
  ''
);

DROP TRIGGER IF EXISTS trg_audit_stock_counts ON public.stock_counts;
CREATE TRIGGER trg_audit_stock_counts
AFTER INSERT OR UPDATE OR DELETE ON public.stock_counts
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_count',
  'branch_id',
  'counted_by,approved_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_stock_transfers ON public.stock_transfers;
CREATE TRIGGER trg_audit_stock_transfers
AFTER INSERT OR UPDATE OR DELETE ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_transfer',
  'from_branch_id',
  'created_by,received_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_stock_transfer_items ON public.stock_transfer_items;
CREATE TRIGGER trg_audit_stock_transfer_items
AFTER INSERT OR UPDATE OR DELETE ON public.stock_transfer_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_transfer_item',
  '',
  '',
  ''
);

DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'inventory',
  'stock_movement',
  'branch_id',
  'created_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_sales ON public.sales;
CREATE TRIGGER trg_audit_sales
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'pos',
  'sale',
  'branch_id',
  'cashier_id,voided_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_returns ON public.returns;
CREATE TRIGGER trg_audit_returns
AFTER INSERT OR UPDATE OR DELETE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'returns',
  'return',
  'branch_id',
  'requested_by,approved_by',
  'updated_at'
);

CREATE OR REPLACE VIEW public.v_audit_activity_history AS
WITH login_events AS (
  SELECT
    'login_history'::TEXT AS event_source,
    'login_history'::TEXT AS activity_kind,
    lh.id AS event_id,
    lh.logged_in_at AS event_at,
    lh.user_id,
    lh.branch_id,
    'auth'::TEXT AS module,
    COALESCE(lh.status, 'success') AS action,
    'login'::TEXT AS reference_type,
    lh.id AS reference_id,
    jsonb_strip_nulls(jsonb_build_object(
      'status', lh.status,
      'login_method', lh.login_method,
      'device_name', lh.device_name,
      'ip_address', lh.ip_address,
      'user_agent', lh.user_agent,
      'session_id', lh.session_id
    )) AS event_payload,
    NULL::JSONB AS old_values,
    jsonb_strip_nulls(jsonb_build_object(
      'status', lh.status,
      'login_method', lh.login_method,
      'device_name', lh.device_name,
      'ip_address', lh.ip_address,
      'user_agent', lh.user_agent,
      'session_id', lh.session_id
    )) AS new_values,
    CONCAT(
      INITCAP(COALESCE(lh.status, 'success')),
      ' login',
      CASE
        WHEN COALESCE(NULLIF(lh.login_method, ''), '') <> '' THEN ' via ' || lh.login_method
        ELSE ''
      END
    ) AS summary
  FROM public.login_history AS lh
),
audit_events AS (
  SELECT
    'audit_logs'::TEXT AS event_source,
    CASE
      WHEN al.action = 'delete' THEN 'deleted_record'
      WHEN al.module = 'pos' AND COALESCE(al.new_values ->> 'status', '') = 'voided' THEN 'void_log'
      WHEN al.module = 'returns' AND COALESCE(al.new_values ->> 'status', '') IN ('refunded', 'exchanged') THEN 'refund_log'
      WHEN al.reference_type IN ('stock_adjustment', 'stock_adjustment_item', 'stock_count', 'stock_transfer', 'stock_transfer_item', 'stock_movement') THEN 'stock_adjustment'
      WHEN al.reference_type = 'branch_product_price'
        OR COALESCE(al.old_values ->> 'selling_price', '') IS DISTINCT FROM COALESCE(al.new_values ->> 'selling_price', '')
        OR COALESCE(al.old_values ->> 'cost_price', '') IS DISTINCT FROM COALESCE(al.new_values ->> 'cost_price', '')
        OR COALESCE(al.old_values ->> 'price', '') IS DISTINCT FROM COALESCE(al.new_values ->> 'price', '')
        OR COALESCE(al.old_values ->> 'min_price', '') IS DISTINCT FROM COALESCE(al.new_values ->> 'min_price', '')
        OR COALESCE(al.old_values ->> 'max_price', '') IS DISTINCT FROM COALESCE(al.new_values ->> 'max_price', '')
        THEN 'price_change'
      WHEN al.reference_type IN ('product', 'product_variant', 'product_image', 'product_compatibility') THEN 'product_change'
      ELSE 'user_activity'
    END AS activity_kind,
    al.id AS event_id,
    al.created_at AS event_at,
    al.user_id,
    al.branch_id,
    al.module,
    al.action,
    al.reference_type,
    al.reference_id,
    jsonb_strip_nulls(jsonb_build_object(
      'module', al.module,
      'action', al.action,
      'reference_type', al.reference_type,
      'reference_id', al.reference_id,
      'old_values', al.old_values,
      'new_values', al.new_values
    )) AS event_payload,
    al.old_values,
    al.new_values,
    CASE
      WHEN al.action = 'delete' THEN 'Deleted ' || COALESCE(al.reference_type, al.module, 'record')
      WHEN al.module = 'pos' AND COALESCE(al.new_values ->> 'status', '') = 'voided' THEN 'Voided sale'
      WHEN al.module = 'returns' AND COALESCE(al.new_values ->> 'status', '') = 'refunded' THEN 'Finalized refund'
      WHEN al.module = 'returns' AND COALESCE(al.new_values ->> 'status', '') = 'exchanged' THEN 'Finalized exchange'
      WHEN al.reference_type = 'branch_product_price' THEN 'Updated branch price override'
      WHEN al.reference_type IN ('stock_adjustment', 'stock_adjustment_item') THEN 'Posted stock adjustment'
      WHEN al.reference_type = 'stock_count' THEN 'Posted stock count'
      WHEN al.reference_type IN ('stock_transfer', 'stock_transfer_item') THEN 'Recorded stock transfer'
      WHEN al.reference_type = 'stock_movement' THEN 'Recorded stock movement'
      WHEN al.reference_type IN ('product', 'product_variant', 'product_image', 'product_compatibility') THEN INITCAP(al.action) || 'd product data'
      ELSE INITCAP(al.action) || ' ' || COALESCE(al.reference_type, al.module, 'record')
    END AS summary
  FROM public.audit_logs AS al
)
SELECT
  activity.event_source,
  activity.activity_kind,
  activity.event_id,
  activity.event_at,
  activity.user_id,
  COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), ''),
    actor.username,
    actor.email,
    'System'
  ) AS actor_name,
  activity.branch_id,
  br.name AS branch_name,
  activity.module,
  activity.action,
  activity.reference_type,
  activity.reference_id,
  activity.summary,
  COALESCE(
    NULLIF(
      COALESCE(activity.new_values ->> 'name', activity.old_values ->> 'name', ''),
      ''
    ),
    NULLIF(
      COALESCE(activity.new_values ->> 'sku', activity.old_values ->> 'sku', ''),
      ''
    ),
    NULLIF(
      COALESCE(activity.new_values ->> 'invoice_number', activity.old_values ->> 'invoice_number', ''),
      ''
    ),
    NULLIF(
      COALESCE(activity.new_values ->> 'return_number', activity.old_values ->> 'return_number', ''),
      ''
    ),
    NULLIF(
      COALESCE(activity.new_values ->> 'transfer_number', activity.old_values ->> 'transfer_number', ''),
      ''
    )
  ) AS record_label,
  activity.event_payload,
  activity.old_values,
  activity.new_values
FROM (
  SELECT * FROM login_events
  UNION ALL
  SELECT * FROM audit_events
) AS activity
LEFT JOIN public.users AS actor
  ON actor.id = activity.user_id
LEFT JOIN public.branches AS br
  ON br.id = activity.branch_id;

GRANT EXECUTE ON FUNCTION public.audit_clean_payload(JSONB, TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_pick_uuid(JSONB, TEXT[]) TO anon, authenticated;

COMMIT;

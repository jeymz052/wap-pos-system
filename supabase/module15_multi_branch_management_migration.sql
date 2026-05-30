-- ============================================================
-- MODULE 15: MULTI-BRANCH MANAGEMENT
-- ============================================================
-- Adds branch profile enhancements, optional branch-level
-- pricing, and reusable branch / owner dashboard views.

BEGIN;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS manager_name TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN IF NOT EXISTS receipt_header TEXT,
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_pricing_mode_check'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_pricing_mode_check
      CHECK (pricing_mode IN ('global', 'branch_override'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.branch_product_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL,
  min_price NUMERIC(12, 2),
  max_price NUMERIC(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_product_prices_unique UNIQUE (branch_id, product_id),
  CONSTRAINT branch_product_prices_price_check CHECK (price >= 0),
  CONSTRAINT branch_product_prices_min_price_check CHECK (min_price IS NULL OR min_price >= 0),
  CONSTRAINT branch_product_prices_max_price_check CHECK (max_price IS NULL OR max_price >= 0),
  CONSTRAINT branch_product_prices_range_check CHECK (
    min_price IS NULL
    OR max_price IS NULL
    OR min_price <= max_price
  )
);

CREATE INDEX IF NOT EXISTS idx_branch_product_prices_branch_product
  ON public.branch_product_prices(branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_branch_product_prices_active
  ON public.branch_product_prices(branch_id, is_active);

ALTER TABLE public.branch_product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_product_prices_select" ON public.branch_product_prices;
DROP POLICY IF EXISTS "branch_product_prices_insert" ON public.branch_product_prices;
DROP POLICY IF EXISTS "branch_product_prices_update" ON public.branch_product_prices;
DROP POLICY IF EXISTS "branch_product_prices_delete" ON public.branch_product_prices;

CREATE POLICY "branch_product_prices_select" ON public.branch_product_prices
  FOR SELECT
  USING (
    public.can_access_branch(branch_id)
    AND (
      public.has_permission('branches', 'view')
      OR public.has_permission('inventory', 'view')
      OR public.has_permission('pos', 'view')
      OR public.has_permission('branches', 'manage')
    )
  );

CREATE POLICY "branch_product_prices_insert" ON public.branch_product_prices
  FOR INSERT
  WITH CHECK (
    public.can_access_branch(branch_id)
    AND (
      public.has_permission('branches', 'edit')
      OR public.has_permission('branches', 'manage')
    )
  );

CREATE POLICY "branch_product_prices_update" ON public.branch_product_prices
  FOR UPDATE
  USING (
    public.can_access_branch(branch_id)
    AND (
      public.has_permission('branches', 'edit')
      OR public.has_permission('branches', 'manage')
    )
  )
  WITH CHECK (
    public.can_access_branch(branch_id)
    AND (
      public.has_permission('branches', 'edit')
      OR public.has_permission('branches', 'manage')
    )
  );

CREATE POLICY "branch_product_prices_delete" ON public.branch_product_prices
  FOR DELETE
  USING (
    public.can_access_branch(branch_id)
    AND (
      public.has_permission('branches', 'edit')
      OR public.has_permission('branches', 'manage')
    )
  );

DROP TRIGGER IF EXISTS trg_branch_product_prices_touch_updated_at ON public.branch_product_prices;
CREATE TRIGGER trg_branch_product_prices_touch_updated_at
BEFORE UPDATE ON public.branch_product_prices
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.v_branch_inventory_summary AS
SELECT
  br.id AS branch_id,
  br.name AS branch_name,
  COUNT(DISTINCT stock.product_id) AS sku_count,
  COALESCE(SUM(stock.quantity), 0) AS total_quantity,
  COALESCE(SUM(stock.quantity * COALESCE(prod.cost_price, 0)), 0) AS inventory_cost_value,
  COALESCE(SUM(stock.quantity * COALESCE(
    override_price.price,
    prod.selling_price,
    0
  )), 0) AS inventory_retail_value,
  COUNT(*) FILTER (
    WHERE stock.quantity <= 0
  ) AS out_of_stock_count,
  COUNT(*) FILTER (
    WHERE stock.quantity > 0
      AND stock.quantity <= GREATEST(
        COALESCE(prod.reorder_level, 0),
        COALESCE(prod.critical_stock_level, 0)
      )
  ) AS low_stock_count
FROM public.branches AS br
LEFT JOIN public.inventory_stocks AS stock
  ON stock.branch_id = br.id
LEFT JOIN public.products AS prod
  ON prod.id = stock.product_id
LEFT JOIN public.branch_product_prices AS override_price
  ON override_price.branch_id = br.id
 AND override_price.product_id = stock.product_id
 AND override_price.is_active = TRUE
WHERE br.is_active = TRUE
GROUP BY br.id, br.name;

CREATE OR REPLACE VIEW public.v_branch_sales_summary AS
WITH sales_30d AS (
  SELECT
    s.branch_id,
    COUNT(*) AS transaction_count_30d,
    COALESCE(SUM(s.total_amount), 0) AS total_sales_30d,
    COALESCE(SUM(s.discount_amount), 0) AS discount_total_30d
  FROM public.sales AS s
  WHERE s.status = 'completed'
    AND s.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY s.branch_id
),
sales_mtd AS (
  SELECT
    s.branch_id,
    COUNT(*) AS transaction_count_mtd,
    COALESCE(SUM(s.total_amount), 0) AS total_sales_mtd,
    COALESCE(SUM(s.discount_amount), 0) AS discount_total_mtd,
    COALESCE(SUM(
      COALESCE(si.total_price, 0)
      - (COALESCE(si.cost_price, p.cost_price, 0) * COALESCE(si.quantity, 0))
    ), 0) AS gross_profit_mtd
  FROM public.sales AS s
  LEFT JOIN public.sale_items AS si
    ON si.sale_id = s.id
  LEFT JOIN public.products AS p
    ON p.id = si.product_id
  WHERE s.status = 'completed'
    AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
  GROUP BY s.branch_id
),
refunds_30d AS (
  SELECT
    r.branch_id,
    COALESCE(SUM(COALESCE(r.refund_amount, 0) + COALESCE(r.store_credit, 0)), 0) AS refund_total_30d
  FROM public.returns AS r
  WHERE r.created_at >= NOW() - INTERVAL '30 days'
    AND r.status IN ('refunded', 'exchanged')
  GROUP BY r.branch_id
),
expenses_mtd AS (
  SELECT
    e.branch_id,
    COALESCE(SUM(e.amount), 0) AS expense_total_mtd
  FROM public.expenses AS e
  WHERE e.status = 'approved'
    AND COALESCE(e.expense_type, 'operating') <> 'supplier_payment'
    AND DATE_TRUNC('month', e.expense_date::timestamp) = DATE_TRUNC('month', NOW())
  GROUP BY e.branch_id
)
SELECT
  br.id AS branch_id,
  br.name AS branch_name,
  COALESCE(s30.transaction_count_30d, 0) AS transaction_count_30d,
  COALESCE(s30.total_sales_30d, 0) AS total_sales_30d,
  COALESCE(s30.discount_total_30d, 0) AS discount_total_30d,
  COALESCE(r30.refund_total_30d, 0) AS refund_total_30d,
  COALESCE(sm.transaction_count_mtd, 0) AS transaction_count_mtd,
  COALESCE(sm.total_sales_mtd, 0) AS total_sales_mtd,
  COALESCE(sm.discount_total_mtd, 0) AS discount_total_mtd,
  COALESCE(sm.gross_profit_mtd, 0) AS gross_profit_mtd,
  COALESCE(em.expense_total_mtd, 0) AS expense_total_mtd,
  CASE
    WHEN COALESCE(s30.transaction_count_30d, 0) > 0
      THEN COALESCE(s30.total_sales_30d, 0) / s30.transaction_count_30d
    ELSE 0
  END AS average_ticket_30d
FROM public.branches AS br
LEFT JOIN sales_30d AS s30
  ON s30.branch_id = br.id
LEFT JOIN sales_mtd AS sm
  ON sm.branch_id = br.id
LEFT JOIN refunds_30d AS r30
  ON r30.branch_id = br.id
LEFT JOIN expenses_mtd AS em
  ON em.branch_id = br.id
WHERE br.is_active = TRUE;

CREATE OR REPLACE VIEW public.v_branch_transfer_summary AS
SELECT
  st.id,
  st.status,
  st.created_at,
  st.updated_at,
  st.from_branch_id,
  from_br.name AS from_branch_name,
  st.to_branch_id,
  to_br.name AS to_branch_name,
  st.created_by,
  st.received_by,
  st.notes,
  COALESCE(SUM(sti.quantity), 0) AS total_units,
  COUNT(DISTINCT sti.product_id) AS sku_count
FROM public.stock_transfers AS st
LEFT JOIN public.stock_transfer_items AS sti
  ON sti.stock_transfer_id = st.id
JOIN public.branches AS from_br
  ON from_br.id = st.from_branch_id
JOIN public.branches AS to_br
  ON to_br.id = st.to_branch_id
GROUP BY
  st.id,
  st.status,
  st.created_at,
  st.updated_at,
  st.from_branch_id,
  from_br.name,
  st.to_branch_id,
  to_br.name,
  st.created_by,
  st.received_by,
  st.notes;

CREATE OR REPLACE VIEW public.v_branch_staff_assignments AS
SELECT
  u.id AS user_id,
  u.branch_id,
  br.name AS branch_name,
  u.first_name,
  u.last_name,
  u.username,
  u.email,
  u.is_active,
  u.allow_login,
  u.data_access_scope,
  r.name AS role_name
FROM public.users AS u
LEFT JOIN public.branches AS br
  ON br.id = u.branch_id
LEFT JOIN public.roles AS r
  ON r.id = u.role_id;

CREATE OR REPLACE VIEW public.v_branch_performance_dashboard AS
SELECT
  br.id AS branch_id,
  br.name AS branch_name,
  br.code AS branch_code,
  br.manager_name,
  br.pricing_mode,
  inv.sku_count,
  inv.total_quantity,
  inv.inventory_cost_value,
  inv.inventory_retail_value,
  inv.low_stock_count,
  inv.out_of_stock_count,
  sales.transaction_count_30d,
  sales.total_sales_30d,
  sales.discount_total_30d,
  sales.refund_total_30d,
  sales.transaction_count_mtd,
  sales.total_sales_mtd,
  sales.discount_total_mtd,
  sales.gross_profit_mtd,
  sales.expense_total_mtd,
  sales.average_ticket_30d,
  (
    SELECT COUNT(*)
    FROM public.users AS u
    WHERE u.branch_id = br.id
      AND u.is_active = TRUE
  ) AS active_staff_count
FROM public.branches AS br
LEFT JOIN public.v_branch_inventory_summary AS inv
  ON inv.branch_id = br.id
LEFT JOIN public.v_branch_sales_summary AS sales
  ON sales.branch_id = br.id
WHERE br.is_active = TRUE;

CREATE OR REPLACE VIEW public.v_owner_dashboard AS
WITH totals AS (
  SELECT
    COUNT(*) FILTER (WHERE br.is_active = TRUE) AS active_branch_count,
    COUNT(*) AS total_branch_count,
    COALESCE(SUM(perf.total_sales_30d), 0) AS network_sales_30d,
    COALESCE(SUM(perf.gross_profit_mtd), 0) AS network_gross_profit_mtd,
    COALESCE(SUM(perf.inventory_cost_value), 0) AS network_inventory_cost_value,
    COALESCE(SUM(perf.low_stock_count), 0) AS network_low_stock_count,
    COALESCE(SUM(perf.out_of_stock_count), 0) AS network_out_of_stock_count,
    COALESCE(SUM(perf.active_staff_count), 0) AS network_staff_count
  FROM public.branches AS br
  LEFT JOIN public.v_branch_performance_dashboard AS perf
    ON perf.branch_id = br.id
),
top_branch AS (
  SELECT
    perf.branch_id AS top_branch_id,
    perf.branch_name AS top_branch_name,
    perf.total_sales_30d AS top_branch_sales_30d
  FROM public.v_branch_performance_dashboard AS perf
  ORDER BY perf.total_sales_30d DESC NULLS LAST, perf.branch_name
  LIMIT 1
),
transfer_totals AS (
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('received', 'cancelled')) AS open_transfer_count,
    COUNT(*) AS total_transfer_count
  FROM public.stock_transfers
)
SELECT
  totals.total_branch_count,
  totals.active_branch_count,
  totals.network_sales_30d,
  totals.network_gross_profit_mtd,
  totals.network_inventory_cost_value,
  totals.network_low_stock_count,
  totals.network_out_of_stock_count,
  totals.network_staff_count,
  COALESCE(top_branch.top_branch_id, NULL) AS top_branch_id,
  COALESCE(top_branch.top_branch_name, NULL) AS top_branch_name,
  COALESCE(top_branch.top_branch_sales_30d, 0) AS top_branch_sales_30d,
  transfer_totals.open_transfer_count,
  transfer_totals.total_transfer_count
FROM totals
CROSS JOIN transfer_totals
LEFT JOIN top_branch
  ON TRUE;

COMMIT;

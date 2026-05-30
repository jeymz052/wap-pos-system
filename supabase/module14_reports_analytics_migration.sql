-- ============================================================
-- MODULE 14: REPORTS & ANALYTICS
-- ============================================================
-- Adds reusable reporting views for sales, inventory, and
-- financial analytics on top of the operational modules.

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  group_key TEXT NOT NULL,
  report_id TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  date_from DATE,
  date_to DATE,
  search_term TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_id UUID NOT NULL REFERENCES public.report_presets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  day_of_week INT,
  day_of_month INT,
  run_time TIME NOT NULL DEFAULT '08:00',
  export_format TEXT NOT NULL DEFAULT 'pdf',
  delivery_channel TEXT NOT NULL DEFAULT 'download_center',
  recipients JSONB NOT NULL DEFAULT '[]'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_schedules_frequency_check CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT report_schedules_export_format_check CHECK (export_format IN ('pdf', 'xlsx', 'csv')),
  CONSTRAINT report_schedules_delivery_channel_check CHECK (delivery_channel IN ('download_center', 'email')),
  CONSTRAINT report_schedules_day_of_week_check CHECK (
    day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)
  ),
  CONSTRAINT report_schedules_day_of_month_check CHECK (
    day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)
  )
);

CREATE TABLE IF NOT EXISTS public.report_schedule_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES public.report_schedules(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES public.report_presets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  export_format TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  output_file_name TEXT,
  output_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  triggered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT report_schedule_runs_status_check CHECK (status IN ('completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_sales_branch_created_status
  ON public.sales(branch_id, created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_sale
  ON public.sale_items(product_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_payments_method_sale
  ON public.sale_payments(payment_method, sale_id);

CREATE INDEX IF NOT EXISTS idx_inventory_stocks_branch_product_qty
  ON public.inventory_stocks(branch_id, product_id, quantity);

CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_created_type
  ON public.stock_movements(branch_id, created_at DESC, movement_type);

CREATE INDEX IF NOT EXISTS idx_receivables_branch_status_due
  ON public.receivables(branch_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_status_created
  ON public.purchase_orders(branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_presets_created_by
  ON public.report_presets(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_presets_group_report
  ON public.report_presets(group_key, report_id);

CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run
  ON public.report_schedules(is_active, next_run_at);

CREATE INDEX IF NOT EXISTS idx_report_schedule_runs_schedule_started
  ON public.report_schedule_runs(schedule_id, started_at DESC);

CREATE OR REPLACE VIEW public.v_report_sales_daily AS
SELECT
  DATE(s.created_at) AS report_date,
  s.branch_id,
  b.name AS branch_name,
  COUNT(*) AS transaction_count,
  COALESCE(SUM(s.subtotal), 0) AS gross_sales,
  COALESCE(SUM(s.discount_amount), 0) AS discount_total,
  COALESCE(SUM(s.tax_amount), 0) AS tax_total,
  COALESCE(SUM(s.subtotal - s.discount_amount), 0) AS net_sales_before_refunds
FROM public.sales AS s
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY DATE(s.created_at), s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_monthly AS
SELECT
  DATE_TRUNC('month', s.created_at)::DATE AS report_month,
  s.branch_id,
  b.name AS branch_name,
  COUNT(*) AS transaction_count,
  COALESCE(SUM(s.subtotal), 0) AS gross_sales,
  COALESCE(SUM(s.discount_amount), 0) AS discount_total,
  COALESCE(SUM(s.tax_amount), 0) AS tax_total,
  COALESCE(SUM(s.subtotal - s.discount_amount), 0) AS net_sales_before_refunds
FROM public.sales AS s
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY DATE_TRUNC('month', s.created_at)::DATE, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_cashier AS
SELECT
  s.cashier_id,
  u.username AS cashier_username,
  u.first_name AS cashier_first_name,
  u.last_name AS cashier_last_name,
  s.branch_id,
  b.name AS branch_name,
  COUNT(DISTINCT s.id) AS transaction_count,
  COALESCE(SUM(si.quantity), 0) AS item_count,
  COALESCE(SUM(s.subtotal), 0) AS gross_sales,
  COALESCE(SUM(s.discount_amount), 0) AS discount_total,
  COALESCE(SUM(s.subtotal - s.discount_amount), 0) AS net_sales_before_refunds
FROM public.sales AS s
LEFT JOIN public.sale_items AS si
  ON si.sale_id = s.id
LEFT JOIN public.users AS u
  ON u.id = s.cashier_id
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY s.cashier_id, u.username, u.first_name, u.last_name, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_branch AS
SELECT
  s.branch_id,
  b.name AS branch_name,
  COUNT(*) AS transaction_count,
  COALESCE(SUM(s.subtotal), 0) AS gross_sales,
  COALESCE(SUM(s.discount_amount), 0) AS discount_total,
  COALESCE(SUM(s.subtotal - s.discount_amount), 0) AS net_sales_before_refunds
FROM public.sales AS s
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_category AS
SELECT
  p.category_id,
  c.name AS category_name,
  s.branch_id,
  b.name AS branch_name,
  COALESCE(SUM(si.quantity), 0) AS quantity_sold,
  COALESCE(SUM(si.total_price), 0) AS gross_sales,
  COALESCE(SUM(si.discount_amount), 0) AS discount_total,
  COALESCE(SUM(si.total_price - si.discount_amount), 0) AS net_sales_before_refunds,
  COALESCE(SUM((COALESCE(si.cost_price, p.cost_price, 0)) * si.quantity), 0) AS cost_of_sales
FROM public.sale_items AS si
JOIN public.sales AS s
  ON s.id = si.sale_id
JOIN public.products AS p
  ON p.id = si.product_id
LEFT JOIN public.categories AS c
  ON c.id = p.category_id
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY p.category_id, c.name, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_brand AS
SELECT
  p.brand_id,
  brd.name AS brand_name,
  s.branch_id,
  b.name AS branch_name,
  COALESCE(SUM(si.quantity), 0) AS quantity_sold,
  COALESCE(SUM(si.total_price), 0) AS gross_sales,
  COALESCE(SUM(si.discount_amount), 0) AS discount_total,
  COALESCE(SUM(si.total_price - si.discount_amount), 0) AS net_sales_before_refunds,
  COALESCE(SUM((COALESCE(si.cost_price, p.cost_price, 0)) * si.quantity), 0) AS cost_of_sales
FROM public.sale_items AS si
JOIN public.sales AS s
  ON s.id = si.sale_id
JOIN public.products AS p
  ON p.id = si.product_id
LEFT JOIN public.brands AS brd
  ON brd.id = p.brand_id
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY p.brand_id, brd.name, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_product AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  c.name AS category_name,
  brd.name AS brand_name,
  s.branch_id,
  b.name AS branch_name,
  COALESCE(SUM(si.quantity), 0) AS quantity_sold,
  COALESCE(SUM(si.total_price), 0) AS gross_sales,
  COALESCE(SUM(si.discount_amount), 0) AS discount_total,
  COALESCE(SUM(si.total_price - si.discount_amount), 0) AS net_sales_before_refunds,
  COALESCE(SUM((COALESCE(si.cost_price, p.cost_price, 0)) * si.quantity), 0) AS cost_of_sales
FROM public.sale_items AS si
JOIN public.sales AS s
  ON s.id = si.sale_id
JOIN public.products AS p
  ON p.id = si.product_id
LEFT JOIN public.categories AS c
  ON c.id = p.category_id
LEFT JOIN public.brands AS brd
  ON brd.id = p.brand_id
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY p.id, p.sku, p.name, c.name, brd.name, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_sales_by_payment_method AS
SELECT
  sp.payment_method,
  s.branch_id,
  b.name AS branch_name,
  COUNT(DISTINCT sp.sale_id) AS transaction_count,
  COALESCE(SUM(sp.amount), 0) AS payment_total
FROM public.sale_payments AS sp
JOIN public.sales AS s
  ON s.id = sp.sale_id
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
WHERE s.status = 'completed'
GROUP BY sp.payment_method, s.branch_id, b.name;

CREATE OR REPLACE VIEW public.v_report_discounts AS
SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.created_at,
  s.branch_id,
  b.name AS branch_name,
  s.cashier_id,
  u.username AS cashier_username,
  u.first_name AS cashier_first_name,
  u.last_name AS cashier_last_name,
  s.discount_type,
  s.discount_value,
  s.discount_amount,
  s.subtotal,
  s.total_amount
FROM public.sales AS s
LEFT JOIN public.branches AS b
  ON b.id = s.branch_id
LEFT JOIN public.users AS u
  ON u.id = s.cashier_id
WHERE s.status = 'completed'
  AND COALESCE(s.discount_amount, 0) > 0;

CREATE OR REPLACE VIEW public.v_report_refunds AS
SELECT
  r.id AS return_id,
  r.return_number,
  r.created_at,
  r.branch_id,
  b.name AS branch_name,
  r.sale_id,
  r.customer_id,
  r.customer_name,
  r.status,
  r.request_type,
  r.refund_method,
  r.refund_amount,
  r.store_credit,
  r.reason,
  r.refunded_at
FROM public.returns AS r
LEFT JOIN public.branches AS b
  ON b.id = r.branch_id;

CREATE OR REPLACE VIEW public.v_report_inventory_stock AS
SELECT
  s.branch_id,
  br.name AS branch_name,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  c.name AS category_name,
  b.name AS brand_name,
  s.quantity AS current_stock,
  p.reorder_level,
  p.critical_stock_level,
  p.cost_price,
  p.selling_price,
  (s.quantity * p.cost_price) AS inventory_cost_value,
  (s.quantity * p.selling_price) AS inventory_retail_value,
  CASE
    WHEN s.quantity <= 0 THEN 'out_of_stock'
    WHEN s.quantity <= GREATEST(COALESCE(p.reorder_level, 0), COALESCE(p.critical_stock_level, 0)) THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status
FROM public.inventory_stocks AS s
JOIN public.products AS p
  ON p.id = s.product_id
LEFT JOIN public.categories AS c
  ON c.id = p.category_id
LEFT JOIN public.brands AS b
  ON b.id = p.brand_id
JOIN public.branches AS br
  ON br.id = s.branch_id;

CREATE OR REPLACE VIEW public.v_report_inventory_valuation AS
SELECT
  branch_id,
  branch_name,
  COUNT(*) AS sku_count,
  COALESCE(SUM(current_stock), 0) AS quantity_on_hand,
  COALESCE(SUM(inventory_cost_value), 0) AS total_cost_value,
  COALESCE(SUM(inventory_retail_value), 0) AS total_retail_value
FROM public.v_report_inventory_stock
GROUP BY branch_id, branch_name;

CREATE OR REPLACE VIEW public.v_report_stock_movement AS
SELECT
  sm.id,
  sm.created_at,
  sm.branch_id,
  br.name AS branch_name,
  sm.product_id,
  p.sku,
  p.name AS product_name,
  sm.movement_type,
  sm.quantity,
  sm.quantity_before,
  sm.quantity_after,
  sm.reference_type,
  sm.reference_id,
  sm.notes,
  sm.created_by,
  u.username AS created_by_username
FROM public.stock_movements AS sm
JOIN public.products AS p
  ON p.id = sm.product_id
JOIN public.branches AS br
  ON br.id = sm.branch_id
LEFT JOIN public.users AS u
  ON u.id = sm.created_by;

CREATE OR REPLACE VIEW public.v_report_stock_adjustments AS
SELECT
  sa.id AS stock_adjustment_id,
  sa.created_at,
  sa.branch_id,
  br.name AS branch_name,
  sa.reason,
  sa.status,
  sa.notes,
  sai.product_id,
  p.sku,
  p.name AS product_name,
  sai.quantity_before,
  sai.quantity_after,
  sai.difference,
  sa.created_by,
  creator.username AS created_by_username,
  sa.approved_by,
  approver.username AS approved_by_username
FROM public.stock_adjustments AS sa
JOIN public.stock_adjustment_items AS sai
  ON sai.stock_adjustment_id = sa.id
JOIN public.products AS p
  ON p.id = sai.product_id
JOIN public.branches AS br
  ON br.id = sa.branch_id
LEFT JOIN public.users AS creator
  ON creator.id = sa.created_by
LEFT JOIN public.users AS approver
  ON approver.id = sa.approved_by;

CREATE OR REPLACE VIEW public.v_report_item_velocity AS
WITH sales_window AS (
  SELECT
    s.branch_id,
    si.product_id,
    MAX(s.created_at) AS last_sold_at,
    COALESCE(SUM(si.quantity) FILTER (WHERE s.created_at >= NOW() - INTERVAL '30 days'), 0) AS qty_sold_30d,
    COALESCE(SUM(si.quantity) FILTER (WHERE s.created_at >= NOW() - INTERVAL '90 days'), 0) AS qty_sold_90d,
    COALESCE(SUM(si.total_price) FILTER (WHERE s.created_at >= NOW() - INTERVAL '90 days'), 0) AS revenue_90d
  FROM public.sales AS s
  JOIN public.sale_items AS si
    ON si.sale_id = s.id
  WHERE s.status = 'completed'
  GROUP BY s.branch_id, si.product_id
)
SELECT
  stock.branch_id,
  br.name AS branch_name,
  stock.product_id,
  p.sku,
  p.name AS product_name,
  c.name AS category_name,
  b.name AS brand_name,
  stock.quantity AS stock_on_hand,
  COALESCE(sw.qty_sold_30d, 0) AS qty_sold_30d,
  COALESCE(sw.qty_sold_90d, 0) AS qty_sold_90d,
  COALESCE(sw.revenue_90d, 0) AS revenue_90d,
  sw.last_sold_at,
  CASE
    WHEN stock.quantity > 0 AND COALESCE(sw.qty_sold_90d, 0) = 0 THEN 'dead_stock'
    WHEN stock.quantity > 0 AND COALESCE(sw.qty_sold_90d, 0) <= 3 THEN 'slow_moving'
    WHEN COALESCE(sw.qty_sold_30d, 0) >= 10 THEN 'fast_moving'
    ELSE 'normal'
  END AS movement_class
FROM public.inventory_stocks AS stock
JOIN public.products AS p
  ON p.id = stock.product_id
LEFT JOIN public.categories AS c
  ON c.id = p.category_id
LEFT JOIN public.brands AS b
  ON b.id = p.brand_id
JOIN public.branches AS br
  ON br.id = stock.branch_id
LEFT JOIN sales_window AS sw
  ON sw.branch_id = stock.branch_id
 AND sw.product_id = stock.product_id;

CREATE OR REPLACE VIEW public.v_report_financial_summary AS
WITH sales_totals AS (
  SELECT
    s.branch_id,
    COALESCE(SUM(s.subtotal), 0) AS gross_sales,
    COALESCE(SUM(s.discount_amount), 0) AS discount_total,
    COALESCE(SUM((COALESCE(si.cost_price, p.cost_price, 0)) * si.quantity), 0) AS cost_of_sales
  FROM public.sales AS s
  LEFT JOIN public.sale_items AS si
    ON si.sale_id = s.id
  LEFT JOIN public.products AS p
    ON p.id = si.product_id
  WHERE s.status = 'completed'
  GROUP BY s.branch_id
),
refund_totals AS (
  SELECT
    branch_id,
    COALESCE(SUM(COALESCE(refund_amount, 0) + COALESCE(store_credit, 0)), 0) AS refund_total
  FROM public.returns
  WHERE status IN ('refunded', 'exchanged')
  GROUP BY branch_id
),
expense_totals AS (
  SELECT
    branch_id,
    COALESCE(SUM(amount), 0) AS approved_expenses
  FROM public.expenses
  WHERE status = 'approved'
    AND COALESCE(expense_type, 'operating') <> 'supplier_payment'
  GROUP BY branch_id
)
SELECT
  br.id AS branch_id,
  br.name AS branch_name,
  COALESCE(st.gross_sales, 0) AS gross_sales,
  COALESCE(st.discount_total, 0) AS discount_total,
  COALESCE(rt.refund_total, 0) AS refund_total,
  COALESCE(st.gross_sales, 0) - COALESCE(st.discount_total, 0) - COALESCE(rt.refund_total, 0) AS net_sales,
  COALESCE(st.cost_of_sales, 0) AS cost_of_sales,
  COALESCE(st.gross_sales, 0) - COALESCE(st.discount_total, 0) - COALESCE(rt.refund_total, 0) - COALESCE(st.cost_of_sales, 0) AS gross_profit,
  COALESCE(et.approved_expenses, 0) AS approved_expenses,
  COALESCE(st.gross_sales, 0) - COALESCE(st.discount_total, 0) - COALESCE(rt.refund_total, 0) - COALESCE(st.cost_of_sales, 0) - COALESCE(et.approved_expenses, 0) AS net_profit
FROM public.branches AS br
LEFT JOIN sales_totals AS st
  ON st.branch_id = br.id
LEFT JOIN refund_totals AS rt
  ON rt.branch_id = br.id
LEFT JOIN expense_totals AS et
  ON et.branch_id = br.id
WHERE br.is_active = TRUE;

CREATE OR REPLACE VIEW public.v_report_supplier_payables AS
SELECT
  po.branch_id,
  br.name AS branch_name,
  po.supplier_id,
  s.code AS supplier_code,
  s.name AS supplier_name,
  po.id AS purchase_order_id,
  po.po_number,
  po.status,
  po.created_at,
  po.total_amount,
  po.paid_amount,
  GREATEST(COALESCE(po.total_amount, 0) - COALESCE(po.paid_amount, 0), 0) AS balance_due
FROM public.purchase_orders AS po
JOIN public.suppliers AS s
  ON s.id = po.supplier_id
JOIN public.branches AS br
  ON br.id = po.branch_id
WHERE po.status NOT IN ('draft', 'cancelled')
  AND COALESCE(po.total_amount, 0) > COALESCE(po.paid_amount, 0);

CREATE OR REPLACE VIEW public.v_report_customer_receivables AS
SELECT
  r.branch_id,
  br.name AS branch_name,
  r.customer_id,
  c.code AS customer_code,
  c.name AS customer_name,
  r.sale_id,
  r.invoice_number,
  r.created_at,
  r.due_date,
  r.status,
  r.total_amount,
  r.paid_amount,
  r.balance,
  GREATEST(CURRENT_DATE - COALESCE(r.due_date, CURRENT_DATE), 0) AS days_past_due
FROM public.receivables AS r
JOIN public.customers AS c
  ON c.id = r.customer_id
JOIN public.branches AS br
  ON br.id = r.branch_id
WHERE COALESCE(r.balance, 0) > 0;

CREATE OR REPLACE VIEW public.v_report_cash_drawer_summary AS
SELECT
  cs.id AS shift_id,
  cs.shift_number,
  cs.branch_id,
  b.name AS branch_name,
  cs.cashier_id,
  cashier.username AS cashier_username,
  cashier.first_name AS cashier_first_name,
  cashier.last_name AS cashier_last_name,
  cs.status,
  cs.starting_cash,
  cs.total_cash_sales,
  cs.total_noncash,
  COALESCE(movement_totals.cash_in_total, 0) AS cash_in_total,
  COALESCE(movement_totals.cash_out_total, 0) AS cash_out_total,
  cs.expected_cash,
  cs.actual_cash,
  cs.cash_difference,
  cs.opened_at,
  cs.closed_at,
  cs.created_at
FROM public.cash_shifts AS cs
LEFT JOIN public.branches AS b
  ON b.id = cs.branch_id
LEFT JOIN public.users AS cashier
  ON cashier.id = cs.cashier_id
LEFT JOIN (
  SELECT
    shift_id,
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0) AS cash_in_total,
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0) AS cash_out_total
  FROM public.cash_movements
  GROUP BY shift_id
) AS movement_totals
  ON movement_totals.shift_id = cs.id;

DROP TRIGGER IF EXISTS trg_report_presets_touch_updated_at ON public.report_presets;
CREATE TRIGGER trg_report_presets_touch_updated_at
BEFORE UPDATE ON public.report_presets
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_report_schedules_touch_updated_at ON public.report_schedules;
CREATE TRIGGER trg_report_schedules_touch_updated_at
BEFORE UPDATE ON public.report_schedules
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.v_report_schedule_overview AS
SELECT
  rs.id,
  rs.name,
  rs.frequency,
  rs.day_of_week,
  rs.day_of_month,
  rs.run_time,
  rs.export_format,
  rs.delivery_channel,
  rs.recipients,
  rs.is_active,
  rs.last_run_at,
  rs.next_run_at,
  rs.created_at,
  rs.branch_id,
  b.name AS branch_name,
  rs.preset_id,
  rp.name AS preset_name,
  rp.group_key,
  rp.report_id,
  rs.created_by,
  u.username AS created_by_username
FROM public.report_schedules AS rs
JOIN public.report_presets AS rp
  ON rp.id = rs.preset_id
LEFT JOIN public.branches AS b
  ON b.id = rs.branch_id
LEFT JOIN public.users AS u
  ON u.id = rs.created_by;

COMMIT;

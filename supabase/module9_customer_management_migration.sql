-- ============================================================
-- MODULE 9: CUSTOMER MANAGEMENT
-- ============================================================
-- Extends customer profiles, vehicle records, warranty tracking,
-- and customer credit automation for the POS and receivables
-- workspaces.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS allow_credit BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_credit_terms_days INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_alert_days INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_purchases_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases_count INT DEFAULT 0;

UPDATE public.customers
SET contact_number = COALESCE(NULLIF(contact_number, ''), phone)
WHERE contact_number IS NULL;

ALTER TABLE public.customer_vehicles
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS make TEXT,
  ADD COLUMN IF NOT EXISTS model_name TEXT,
  ADD COLUMN IF NOT EXISTS engine_number TEXT,
  ADD COLUMN IF NOT EXISTS chassis_number TEXT,
  ADD COLUMN IF NOT EXISTS odometer_km INT,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.customer_warranty_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  sale_item_id UUID REFERENCES public.sale_items(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES public.customer_vehicles(id) ON DELETE SET NULL,
  warranty_claim_id UUID REFERENCES public.warranty_claims(id) ON DELETE SET NULL,
  warranty_number TEXT UNIQUE NOT NULL,
  serial_number TEXT,
  purchase_date DATE NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  coverage_notes TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer_id ON public.customer_vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_primary ON public.customer_vehicles(customer_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_customer_warranty_records_customer_id ON public.customer_warranty_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_warranty_records_sale_id ON public.customer_warranty_records(sale_id);
CREATE INDEX IF NOT EXISTS idx_customer_warranty_records_product_id ON public.customer_warranty_records(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_warranty_records_expiry_date ON public.customer_warranty_records(expiry_date);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_touch_updated_at ON public.customers;
CREATE TRIGGER trg_customers_touch_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_vehicles_touch_updated_at ON public.customer_vehicles;
CREATE TRIGGER trg_customer_vehicles_touch_updated_at
BEFORE UPDATE ON public.customer_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_warranty_records_touch_updated_at ON public.customer_warranty_records;
CREATE TRIGGER trg_customer_warranty_records_touch_updated_at
BEFORE UPDATE ON public.customer_warranty_records
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.recalculate_customer_current_balance(target_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_customer_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.customers AS c
  SET
    current_balance = COALESCE((
      SELECT SUM(GREATEST(COALESCE(r.total_amount, 0) - COALESCE(r.paid_amount, 0), 0))
      FROM public.receivables AS r
      WHERE r.customer_id = target_customer_id
        AND r.status <> 'paid'
    ), 0),
    updated_at = NOW()
  WHERE c.id = target_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_customer_sales_metrics(target_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_customer_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.customers AS c
  SET
    last_purchase_at = sales_meta.last_purchase_at,
    total_purchases_amount = sales_meta.total_purchases_amount,
    total_purchases_count = sales_meta.total_purchases_count,
    updated_at = NOW()
  FROM (
    SELECT
      s.customer_id,
      MAX(s.created_at) AS last_purchase_at,
      COALESCE(SUM(s.total_amount), 0) AS total_purchases_amount,
      COUNT(*)::INT AS total_purchases_count
    FROM public.sales AS s
    WHERE s.customer_id = target_customer_id
      AND s.status = 'completed'
    GROUP BY s.customer_id
  ) AS sales_meta
  WHERE c.id = sales_meta.customer_id;

  UPDATE public.customers
  SET
    last_purchase_at = NULL,
    total_purchases_amount = 0,
    total_purchases_count = 0,
    updated_at = NOW()
  WHERE id = target_customer_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.sales AS s
      WHERE s.customer_id = target_customer_id
        AND s.status = 'completed'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_receivable_paid_amount_from_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_receivable_id UUID;
  target_customer_id UUID;
  next_paid_amount NUMERIC(12, 2);
  next_due_date DATE;
  next_total_amount NUMERIC(12, 2);
BEGIN
  target_receivable_id := COALESCE(NEW.receivable_id, OLD.receivable_id);

  IF target_receivable_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(SUM(rp.amount), 0),
    r.total_amount,
    r.due_date,
    r.customer_id
  INTO
    next_paid_amount,
    next_total_amount,
    next_due_date,
    target_customer_id
  FROM public.receivables AS r
  LEFT JOIN public.receivable_payments AS rp ON rp.receivable_id = r.id
  WHERE r.id = target_receivable_id
  GROUP BY r.id;

  UPDATE public.receivables AS r
  SET
    paid_amount = COALESCE(next_paid_amount, 0),
    status = CASE
      WHEN COALESCE(next_paid_amount, 0) >= COALESCE(next_total_amount, 0) THEN 'paid'::invoice_status
      WHEN next_due_date IS NOT NULL AND next_due_date < CURRENT_DATE THEN 'overdue'::invoice_status
      WHEN COALESCE(next_paid_amount, 0) > 0 THEN 'partial'::invoice_status
      ELSE 'unpaid'::invoice_status
    END,
    updated_at = NOW()
  WHERE r.id = target_receivable_id;

  PERFORM public.recalculate_customer_current_balance(target_customer_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receivable_paid_amount_from_payments ON public.receivable_payments;
CREATE TRIGGER trg_sync_receivable_paid_amount_from_payments
AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_receivable_paid_amount_from_payments();

CREATE OR REPLACE FUNCTION public.sync_customer_balance_from_receivables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_customer_current_balance(OLD.customer_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_customer_current_balance(NEW.customer_id);

  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recalculate_customer_current_balance(OLD.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_balance_from_receivables ON public.receivables;
CREATE TRIGGER trg_sync_customer_balance_from_receivables
AFTER INSERT OR UPDATE OR DELETE ON public.receivables
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_balance_from_receivables();

CREATE OR REPLACE FUNCTION public.sync_customer_sales_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_customer_sales_metrics(OLD.customer_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_customer_sales_metrics(NEW.customer_id);

  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recalculate_customer_sales_metrics(OLD.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_sales_metrics ON public.sales;
CREATE TRIGGER trg_sync_customer_sales_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_sales_metrics();

CREATE OR REPLACE FUNCTION public.ensure_single_primary_vehicle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.customer_vehicles
    SET is_primary = FALSE,
        updated_at = NOW()
    WHERE customer_id = NEW.customer_id
      AND id <> NEW.id
      AND is_primary = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_vehicles_single_primary ON public.customer_vehicles;
CREATE TRIGGER trg_customer_vehicles_single_primary
BEFORE INSERT OR UPDATE ON public.customer_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_vehicle();

CREATE OR REPLACE VIEW public.v_customer_credit_overview AS
SELECT
  c.id AS customer_id,
  c.code AS customer_code,
  c.name AS customer_name,
  c.customer_type,
  c.branch_id,
  c.allow_credit,
  c.credit_limit,
  c.current_balance,
  GREATEST(COALESCE(c.credit_limit, 0) - COALESCE(c.current_balance, 0), 0) AS available_credit,
  c.default_credit_terms_days,
  c.credit_alert_days,
  c.last_purchase_at,
  c.total_purchases_amount,
  c.total_purchases_count,
  COUNT(DISTINCT r.id) FILTER (WHERE COALESCE(r.balance, 0) > 0) AS open_receivable_count,
  COUNT(DISTINCT r.id) FILTER (WHERE COALESCE(r.balance, 0) > 0 AND r.due_date < CURRENT_DATE) AS overdue_receivable_count,
  COALESCE(SUM(r.balance) FILTER (WHERE COALESCE(r.balance, 0) > 0), 0) AS outstanding_balance,
  COALESCE(SUM(r.balance) FILTER (WHERE COALESCE(r.balance, 0) > 0 AND r.due_date < CURRENT_DATE), 0) AS overdue_balance
FROM public.customers AS c
LEFT JOIN public.receivables AS r ON r.customer_id = c.id
GROUP BY
  c.id, c.code, c.name, c.customer_type, c.branch_id, c.allow_credit, c.credit_limit,
  c.current_balance, c.default_credit_terms_days, c.credit_alert_days,
  c.last_purchase_at, c.total_purchases_amount, c.total_purchases_count;

CREATE OR REPLACE VIEW public.v_customer_statement_of_account AS
WITH receivable_entries AS (
  SELECT
    c.id AS customer_id,
    r.branch_id,
    r.created_at AS entry_date,
    'invoice'::TEXT AS entry_type,
    r.invoice_number AS reference_number,
    r.sale_id AS reference_id,
    COALESCE(r.total_amount, 0) AS debit_amount,
    0::NUMERIC(12, 2) AS credit_amount,
    COALESCE(r.balance, 0) AS open_balance,
    r.status::TEXT AS status,
    r.due_date,
    r.notes
  FROM public.customers AS c
  JOIN public.receivables AS r ON r.customer_id = c.id
), payment_entries AS (
  SELECT
    c.id AS customer_id,
    r.branch_id,
    rp.paid_at AS entry_date,
    'payment'::TEXT AS entry_type,
    COALESCE(rp.reference_no, r.invoice_number) AS reference_number,
    rp.id AS reference_id,
    0::NUMERIC(12, 2) AS debit_amount,
    COALESCE(rp.amount, 0) AS credit_amount,
    GREATEST(COALESCE(r.balance, 0), 0) AS open_balance,
    r.status::TEXT AS status,
    r.due_date,
    rp.notes
  FROM public.customers AS c
  JOIN public.receivables AS r ON r.customer_id = c.id
  JOIN public.receivable_payments AS rp ON rp.receivable_id = r.id
)
SELECT *
FROM (
  SELECT * FROM receivable_entries
  UNION ALL
  SELECT * FROM payment_entries
) AS statement_rows;

COMMIT;

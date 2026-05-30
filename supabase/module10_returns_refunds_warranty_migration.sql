-- ============================================================
-- MODULE 10: RETURNS, REFUNDS & WARRANTY
-- ============================================================
-- Expands the base returns schema with approval workflow,
-- exchange metadata, stock disposition tracking, store credit,
-- warranty claim references, and reusable reporting views.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_credit_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS returned_quantity INT NOT NULL DEFAULT 0;

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'refund',
  ADD COLUMN IF NOT EXISTS search_mode TEXT NOT NULL DEFAULT 'receipt',
  ADD COLUMN IF NOT EXISTS sale_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS stock_handling TEXT NOT NULL DEFAULT 'restock',
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference_no TEXT,
  ADD COLUMN IF NOT EXISTS exchange_reference_no TEXT,
  ADD COLUMN IF NOT EXISTS exchange_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exchange_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exchanged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warranty_started_at TIMESTAMPTZ;

ALTER TABLE public.return_items
  ADD COLUMN IF NOT EXISTS approved_quantity INT,
  ADD COLUMN IF NOT EXISTS stock_action TEXT NOT NULL DEFAULT 'restock',
  ADD COLUMN IF NOT EXISTS exchange_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exchange_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty_record_id UUID REFERENCES public.customer_warranty_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_claim_id UUID REFERENCES public.warranty_claims(id) ON DELETE SET NULL;

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS claim_number TEXT,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_item_id UUID REFERENCES public.sale_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_item_id UUID REFERENCES public.return_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_record_id UUID REFERENCES public.customer_warranty_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_condition TEXT,
  ADD COLUMN IF NOT EXISTS vendor_reference_no TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_claims_claim_number
  ON public.warranty_claims(claim_number)
  WHERE claim_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_branch_status ON public.returns(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON public.returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_requested_at ON public.returns(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item_id ON public.return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_warranty_claim_id ON public.return_items(warranty_claim_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_branch_status ON public.warranty_claims(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_customer_id ON public.warranty_claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_return_id ON public.warranty_claims(return_id);

CREATE OR REPLACE FUNCTION public.generate_claim_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'WCL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 1000000))::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_returns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_returns_touch_updated_at ON public.returns;
CREATE TRIGGER trg_returns_touch_updated_at
BEFORE UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.touch_returns_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_claims_touch_updated_at ON public.warranty_claims;
CREATE TRIGGER trg_warranty_claims_touch_updated_at
BEFORE UPDATE ON public.warranty_claims
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.v_return_quantity_available(target_sale_item_id UUID)
RETURNS INT
LANGUAGE sql
AS $$
  SELECT GREATEST(
    COALESCE(si.quantity, 0) - COALESCE(si.returned_quantity, 0),
    0
  )::INT
  FROM public.sale_items AS si
  WHERE si.id = target_sale_item_id
$$;

CREATE OR REPLACE VIEW public.v_returns_overview AS
SELECT
  r.id,
  r.return_number,
  r.branch_id,
  r.sale_id,
  r.sale_invoice_number,
  r.customer_id,
  r.customer_name,
  r.status,
  r.request_type,
  r.reason,
  r.refund_method,
  r.refund_amount,
  r.store_credit,
  r.stock_handling,
  r.approval_required,
  r.requested_by,
  req.username AS requested_by_username,
  r.approved_by,
  app.username AS approved_by_username,
  r.requested_at,
  r.approved_at,
  r.refunded_at,
  r.exchanged_at,
  r.warranty_started_at,
  r.created_at,
  COUNT(ri.id) AS item_count,
  COALESCE(SUM(COALESCE(ri.quantity, 0)), 0) AS total_units,
  COALESCE(SUM(COALESCE(ri.quantity, 0) * COALESCE(ri.unit_price, 0)), 0) AS calculated_return_value
FROM public.returns AS r
LEFT JOIN public.return_items AS ri ON ri.return_id = r.id
LEFT JOIN public.users AS req ON req.id = r.requested_by
LEFT JOIN public.users AS app ON app.id = r.approved_by
GROUP BY
  r.id,
  req.username,
  app.username;

CREATE OR REPLACE VIEW public.v_warranty_claims_overview AS
SELECT
  wc.id,
  wc.claim_number,
  wc.return_id,
  wc.return_item_id,
  wc.branch_id,
  wc.sale_id,
  wc.sale_item_id,
  wc.product_id,
  p.name AS product_name,
  p.sku AS product_sku,
  wc.customer_id,
  c.name AS customer_name,
  wc.claim_date,
  wc.expiry_date,
  wc.status,
  wc.description,
  wc.resolution,
  wc.received_condition,
  wc.vendor_reference_no,
  wc.processed_at,
  wc.completed_at,
  wc.created_at,
  wc.updated_at
FROM public.warranty_claims AS wc
LEFT JOIN public.products AS p ON p.id = wc.product_id
LEFT JOIN public.customers AS c ON c.id = wc.customer_id;

COMMIT;

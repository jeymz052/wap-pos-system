-- ============================================================
-- MODULE 11: SALES ORDERS, QUOTATIONS & WHOLESALE
-- ============================================================
-- Adds operational sales documents, stock reservation support,
-- customer-specific pricing, bulk discount rules, and quotation
-- delivery tracking on top of the base schema.

BEGIN;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_type TEXT NOT NULL DEFAULT 'quotation',
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS discount_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS discount_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS pricing_notes TEXT;

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_fulfillment_date DATE,
  fulfillment_type TEXT NOT NULL DEFAULT 'pickup',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  converted_to_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_orders_status_check CHECK (
    status IN ('draft', 'confirmed', 'reserved', 'partially_fulfilled', 'fulfilled', 'cancelled')
  )
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quotation_item_id UUID REFERENCES public.quotation_items(id) ON DELETE SET NULL,
  quantity INT NOT NULL,
  reserved_quantity INT NOT NULL DEFAULT 0,
  fulfilled_quantity INT NOT NULL DEFAULT 0,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  line_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_source TEXT NOT NULL DEFAULT 'retail',
  pricing_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_product_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL DEFAULT 'fixed',
  fixed_price NUMERIC(12, 2),
  discount_percent NUMERIC(8, 2),
  minimum_quantity INT NOT NULL DEFAULT 1,
  effective_from DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_product_pricing_price_check CHECK (
    COALESCE(fixed_price, 0) > 0 OR COALESCE(discount_percent, 0) > 0
  )
);

CREATE TABLE IF NOT EXISTS public.product_bulk_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  minimum_quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2),
  discount_percent NUMERIC(8, 2),
  customer_type public.customer_type,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_bulk_pricing_price_check CHECK (
    COALESCE(unit_price, 0) > 0 OR COALESCE(discount_percent, 0) > 0
  )
);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_item_id UUID REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  reserved_quantity INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  converted_to_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_reservations_status_check CHECK (status IN ('active', 'released', 'converted', 'expired')),
  CONSTRAINT stock_reservations_owner_check CHECK (
    sales_order_id IS NOT NULL OR quotation_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.quotation_email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_email_logs_status_check CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_product_pricing_rule_with_start
  ON public.customer_product_pricing(customer_id, product_id, minimum_quantity, effective_from)
  WHERE effective_from IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_product_pricing_rule_without_start
  ON public.customer_product_pricing(customer_id, product_id, minimum_quantity)
  WHERE effective_from IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bulk_pricing_rule_with_customer_type
  ON public.product_bulk_pricing(product_id, minimum_quantity, customer_type)
  WHERE customer_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bulk_pricing_rule_without_customer_type
  ON public.product_bulk_pricing(product_id, minimum_quantity)
  WHERE customer_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_branch_status ON public.sales_orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON public.sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_quotation_id ON public.sales_orders(quotation_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id ON public.sales_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_active_lookup ON public.stock_reservations(branch_id, product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_sales_order_id ON public.stock_reservations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_quotation_email_logs_quote_id ON public.quotation_email_logs(quotation_id);

DROP TRIGGER IF EXISTS trg_sales_orders_touch_updated_at ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_touch_updated_at
BEFORE UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_sales_order_items_touch_updated_at ON public.sales_order_items;
CREATE TRIGGER trg_sales_order_items_touch_updated_at
BEFORE UPDATE ON public.sales_order_items
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_customer_product_pricing_touch_updated_at ON public.customer_product_pricing;
CREATE TRIGGER trg_customer_product_pricing_touch_updated_at
BEFORE UPDATE ON public.customer_product_pricing
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_product_bulk_pricing_touch_updated_at ON public.product_bulk_pricing;
CREATE TRIGGER trg_product_bulk_pricing_touch_updated_at
BEFORE UPDATE ON public.product_bulk_pricing
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_stock_reservations_touch_updated_at ON public.stock_reservations;
CREATE TRIGGER trg_stock_reservations_touch_updated_at
BEFORE UPDATE ON public.stock_reservations
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.v_stock_reservation_summary AS
SELECT
  sr.branch_id,
  sr.product_id,
  COUNT(*) FILTER (WHERE sr.status = 'active') AS active_reservation_count,
  COALESCE(SUM(sr.reserved_quantity) FILTER (WHERE sr.status = 'active'), 0) AS reserved_quantity
FROM public.stock_reservations AS sr
GROUP BY sr.branch_id, sr.product_id;

CREATE OR REPLACE VIEW public.v_inventory_available_for_sale AS
SELECT
  s.branch_id,
  s.product_id,
  s.quantity AS on_hand_quantity,
  COALESCE(r.reserved_quantity, 0) AS reserved_quantity,
  GREATEST(s.quantity - COALESCE(r.reserved_quantity, 0), 0) AS available_quantity
FROM public.inventory_stocks AS s
LEFT JOIN public.v_stock_reservation_summary AS r
  ON r.branch_id = s.branch_id
 AND r.product_id = s.product_id;

CREATE OR REPLACE FUNCTION public.recalculate_sales_order_reserved_quantities(target_sales_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_sales_order_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.sales_order_items AS soi
  SET
    reserved_quantity = COALESCE(reserved_meta.reserved_quantity, 0),
    updated_at = NOW()
  FROM (
    SELECT
      sr.sales_order_item_id,
      COALESCE(SUM(sr.reserved_quantity) FILTER (WHERE sr.status = 'active'), 0) AS reserved_quantity
    FROM public.stock_reservations AS sr
    WHERE sr.sales_order_id = target_sales_order_id
    GROUP BY sr.sales_order_item_id
  ) AS reserved_meta
  WHERE soi.id = reserved_meta.sales_order_item_id;

  UPDATE public.sales_order_items
  SET
    reserved_quantity = 0,
    updated_at = NOW()
  WHERE sales_order_id = target_sales_order_id
    AND id NOT IN (
      SELECT sr.sales_order_item_id
      FROM public.stock_reservations AS sr
      WHERE sr.sales_order_id = target_sales_order_id
        AND sr.status = 'active'
        AND sr.sales_order_item_id IS NOT NULL
    );

  UPDATE public.sales_orders
  SET
    status = CASE
      WHEN status = 'cancelled' THEN status
      WHEN EXISTS (
        SELECT 1
        FROM public.sales_order_items AS soi
        WHERE soi.sales_order_id = target_sales_order_id
          AND soi.reserved_quantity > 0
      ) THEN 'reserved'
      WHEN status = 'reserved' THEN 'confirmed'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = target_sales_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sales_order_reservations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_sales_order_reserved_quantities(OLD.sales_order_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_sales_order_reserved_quantities(NEW.sales_order_id);

  IF TG_OP = 'UPDATE' AND OLD.sales_order_id IS DISTINCT FROM NEW.sales_order_id THEN
    PERFORM public.recalculate_sales_order_reserved_quantities(OLD.sales_order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_order_reservations ON public.stock_reservations;
CREATE TRIGGER trg_sync_sales_order_reservations
AFTER INSERT OR UPDATE OR DELETE ON public.stock_reservations
FOR EACH ROW
EXECUTE FUNCTION public.sync_sales_order_reservations();

COMMIT;

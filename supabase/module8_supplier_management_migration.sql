-- ============================================================
-- MODULE 8: SUPPLIER MANAGEMENT
-- ============================================================
-- Adds supplier balance synchronization and reusable supplier
-- performance analytics for the supplier workspace and reports.

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_supplier_current_balance(target_supplier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_supplier_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.suppliers AS s
  SET
    current_balance = COALESCE((
      SELECT SUM(GREATEST(COALESCE(po.total_amount, 0) - COALESCE(po.paid_amount, 0), 0))
      FROM public.purchase_orders AS po
      WHERE po.supplier_id = target_supplier_id
        AND po.status <> 'cancelled'
    ), 0),
    updated_at = NOW()
  WHERE s.id = target_supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_po_paid_amount_from_supplier_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_po_id UUID;
  target_supplier_id UUID;
BEGIN
  target_po_id := COALESCE(NEW.po_id, OLD.po_id);

  IF target_po_id IS NOT NULL THEN
    UPDATE public.purchase_orders AS po
    SET
      paid_amount = COALESCE((
        SELECT SUM(sp.amount)
        FROM public.supplier_payments AS sp
        WHERE sp.po_id = target_po_id
      ), 0),
      updated_at = NOW()
    WHERE po.id = target_po_id
    RETURNING po.supplier_id INTO target_supplier_id;

    PERFORM public.recalculate_supplier_current_balance(target_supplier_id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
    PERFORM public.recalculate_supplier_current_balance(OLD.supplier_id);
    PERFORM public.recalculate_supplier_current_balance(NEW.supplier_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_supplier_current_balance(OLD.supplier_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_supplier_current_balance(NEW.supplier_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_po_paid_amount_from_supplier_payments ON public.supplier_payments;
CREATE TRIGGER trg_sync_po_paid_amount_from_supplier_payments
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_po_paid_amount_from_supplier_payments();

CREATE OR REPLACE FUNCTION public.sync_supplier_balance_from_purchase_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_supplier_current_balance(OLD.supplier_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_supplier_current_balance(NEW.supplier_id);

  IF TG_OP = 'UPDATE' AND OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
    PERFORM public.recalculate_supplier_current_balance(OLD.supplier_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supplier_balance_from_purchase_orders ON public.purchase_orders;
CREATE TRIGGER trg_sync_supplier_balance_from_purchase_orders
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_supplier_balance_from_purchase_orders();

CREATE OR REPLACE VIEW public.v_supplier_performance AS
WITH po_base AS (
  SELECT
    po.id,
    po.supplier_id,
    po.branch_id,
    po.po_number,
    po.status,
    po.created_at,
    po.expected_date,
    po.received_date,
    COALESCE(po.total_amount, 0) AS total_amount,
    COALESCE(po.paid_amount, 0) AS paid_amount,
    GREATEST(COALESCE(po.total_amount, 0) - COALESCE(po.paid_amount, 0), 0) AS open_balance,
    CASE
      WHEN po.expected_date IS NOT NULL AND po.received_date IS NOT NULL
       AND po.received_date <= po.expected_date THEN 1 ELSE 0
    END AS is_on_time,
    CASE
      WHEN po.received_date IS NOT NULL
      THEN GREATEST(DATE_PART('day', po.received_date::timestamp - po.created_at), 0)
      ELSE NULL
    END AS lead_days
  FROM public.purchase_orders AS po
  WHERE po.status <> 'cancelled'
),
item_rollup AS (
  SELECT
    poi.po_id,
    SUM(COALESCE(poi.quantity, 0)) AS ordered_units,
    SUM(COALESCE(poi.received_qty, 0)) AS received_units
  FROM public.purchase_order_items AS poi
  GROUP BY poi.po_id
)
SELECT
  s.id AS supplier_id,
  s.code AS supplier_code,
  s.name AS supplier_name,
  s.supplier_type,
  COUNT(DISTINCT pb.id) AS purchase_order_count,
  COUNT(DISTINCT CASE WHEN pb.expected_date IS NOT NULL AND pb.received_date IS NOT NULL THEN pb.id END) AS completed_delivery_count,
  COUNT(DISTINCT CASE WHEN COALESCE(pb.open_balance, 0) > 0 THEN pb.id END) AS open_invoice_count,
  COUNT(DISTINCT p.id) AS product_count,
  COALESCE(SUM(pb.total_amount), 0) AS total_purchase_amount,
  COALESCE(SUM(pb.paid_amount), 0) AS total_paid_amount,
  COALESCE(SUM(pb.open_balance), 0) AS payable_balance,
  COALESCE(AVG(CASE WHEN pb.expected_date IS NOT NULL AND pb.received_date IS NOT NULL THEN pb.is_on_time * 100.0 END), 0) AS on_time_delivery_rate,
  COALESCE(
    CASE
      WHEN SUM(COALESCE(ir.ordered_units, 0)) > 0
      THEN SUM(COALESCE(ir.received_units, 0)) * 100.0 / SUM(COALESCE(ir.ordered_units, 0))
      ELSE 0
    END,
    0
  ) AS fill_rate,
  COALESCE(AVG(pb.lead_days), 0) AS average_lead_days,
  COALESCE(AVG(NULLIF(pb.total_amount, 0)), 0) AS average_order_value,
  CASE
    WHEN COALESCE(SUM(pb.total_amount), 0) > 0
    THEN COALESCE(SUM(pb.paid_amount), 0) * 100.0 / SUM(pb.total_amount)
    ELSE 0
  END AS payment_completion_rate,
  MAX(pb.created_at) AS last_purchase_at,
  MAX(sp.paid_at) AS last_payment_at
FROM public.suppliers AS s
LEFT JOIN po_base AS pb ON pb.supplier_id = s.id
LEFT JOIN item_rollup AS ir ON ir.po_id = pb.id
LEFT JOIN public.products AS p ON p.supplier_id = s.id
LEFT JOIN public.supplier_payments AS sp ON sp.supplier_id = s.id
GROUP BY s.id, s.code, s.name, s.supplier_type;

COMMIT;

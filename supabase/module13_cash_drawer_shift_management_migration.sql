-- ============================================================
-- MODULE 13: CASH DRAWER & SHIFT MANAGEMENT
-- ============================================================
-- Extends POS shift handling with cash in/out logging, closeout
-- approval metadata, printable reporting support, and summary
-- views for cashier accountability.

BEGIN;

ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS shift_number TEXT,
  ADD COLUMN IF NOT EXISTS closing_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

UPDATE public.cash_shifts
SET shift_number = CONCAT(
  'SHIFT-',
  TO_CHAR(COALESCE(opened_at, created_at, NOW()), 'YYYYMMDD'),
  '-',
  UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 8))
)
WHERE shift_number IS NULL;

ALTER TABLE public.cash_shifts
  ALTER COLUMN shift_number SET NOT NULL;

ALTER TABLE public.cash_shifts
  DROP CONSTRAINT IF EXISTS cash_shifts_shift_number_key;

ALTER TABLE public.cash_shifts
  ADD CONSTRAINT cash_shifts_shift_number_key UNIQUE (shift_number);

ALTER TABLE public.cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_type_check;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_type_check CHECK (type IN ('cash_in', 'cash_out'));

CREATE INDEX IF NOT EXISTS idx_cash_shifts_branch_cashier_status
  ON public.cash_shifts(branch_id, cashier_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_shift_number
  ON public.cash_shifts(shift_number);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_pending_approval
  ON public.cash_shifts(status, closed_at DESC)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift_created_at
  ON public.cash_movements(shift_id, created_at DESC);

CREATE OR REPLACE VIEW public.v_cash_shift_report AS
SELECT
  cs.id,
  cs.shift_number,
  cs.branch_id,
  b.name AS branch_name,
  cs.cashier_id,
  cashier.first_name AS cashier_first_name,
  cashier.last_name AS cashier_last_name,
  cashier.username AS cashier_username,
  cs.status,
  cs.starting_cash,
  cs.total_cash_sales,
  cs.total_noncash,
  COALESCE(movement_meta.cash_in_total, 0) AS cash_in_total,
  COALESCE(movement_meta.cash_out_total, 0) AS cash_out_total,
  cs.expected_cash,
  cs.actual_cash,
  cs.cash_difference,
  cs.notes,
  cs.closing_submitted_at,
  cs.closed_at,
  cs.approved_by,
  approver.first_name AS approver_first_name,
  approver.last_name AS approver_last_name,
  approver.username AS approver_username,
  cs.approved_at,
  cs.approval_notes,
  cs.opened_at,
  cs.created_at
FROM public.cash_shifts AS cs
LEFT JOIN public.branches AS b
  ON b.id = cs.branch_id
LEFT JOIN public.users AS cashier
  ON cashier.id = cs.cashier_id
LEFT JOIN public.users AS approver
  ON approver.id = cs.approved_by
LEFT JOIN (
  SELECT
    shift_id,
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0) AS cash_in_total,
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0) AS cash_out_total
  FROM public.cash_movements
  GROUP BY shift_id
) AS movement_meta
  ON movement_meta.shift_id = cs.id;

COMMIT;

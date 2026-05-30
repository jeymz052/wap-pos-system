-- ============================================================
-- MODULE 12: EXPENSES MANAGEMENT
-- ============================================================
-- Extends the base expenses schema with operational expense
-- types, supplier/staff linkage, receipt metadata, approval
-- auditing, and reporting views for the expenses workspace.

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_payment_id UUID REFERENCES public.supplier_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'operating',
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS receipt_file_name TEXT,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_expense_type_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_expense_type_check CHECK (
    expense_type IN ('operating', 'supplier_payment', 'salary', 'rent', 'utilities', 'delivery', 'other')
  );

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_type_owner_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_type_owner_check CHECK (
    (expense_type <> 'supplier_payment' OR supplier_id IS NOT NULL)
    AND (expense_type <> 'salary' OR staff_user_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_expenses_branch_status_date ON public.expenses(branch_id, status, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON public.expenses(expense_category_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON public.expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_staff_user_id ON public.expenses(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_payment_id ON public.expenses(supplier_payment_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_type ON public.expenses(expense_type);

DROP TRIGGER IF EXISTS trg_expenses_touch_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_touch_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_expense_approval_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actor_auth_id UUID;
  actor_profile_id UUID;
BEGIN
  actor_auth_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF actor_auth_id IS NOT NULL THEN
      SELECT id INTO actor_profile_id
      FROM public.users
      WHERE auth_id = actor_auth_id
      LIMIT 1;

      IF NEW.created_by IS NULL THEN
        NEW.created_by := actor_profile_id;
      END IF;
    END IF;

    IF NEW.status = 'approved' THEN
      NEW.approved_at := COALESCE(NEW.approved_at, NOW());
      NEW.rejected_at := NULL;
      NEW.rejected_by := NULL;
    ELSIF NEW.status = 'rejected' THEN
      NEW.rejected_at := COALESCE(NEW.rejected_at, NOW());
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
    END IF;

    RETURN NEW;
  END IF;

  IF actor_auth_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.has_permission('expenses', 'approve')
      OR public.has_permission('expenses', 'manage')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to change expense approval status.';
    END IF;

    SELECT id INTO actor_profile_id
    FROM public.users
    WHERE auth_id = actor_auth_id
    LIMIT 1;

    IF NEW.status = 'approved' THEN
      NEW.approved_by := COALESCE(NEW.approved_by, actor_profile_id);
      NEW.approved_at := COALESCE(NEW.approved_at, NOW());
      NEW.rejected_by := NULL;
      NEW.rejected_at := NULL;
    ELSIF NEW.status = 'rejected' THEN
      NEW.rejected_by := COALESCE(NEW.rejected_by, actor_profile_id);
      NEW.rejected_at := COALESCE(NEW.rejected_at, NOW());
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    ELSE
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.rejected_by := NULL;
      NEW.rejected_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_enforce_approval ON public.expenses;
CREATE TRIGGER trg_expenses_enforce_approval
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_expense_approval_rules();

INSERT INTO public.expense_categories (name, description)
VALUES
  ('Supplier Payment', 'Supplier settlement and payable disbursements'),
  ('Salary', 'Staff salary and payroll-related expense'),
  ('Utilities', 'Electricity, water, internet, and utility bills'),
  ('Delivery', 'Shipping, logistics, and third-party delivery fees')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;

CREATE OR REPLACE VIEW public.v_expense_report_summary AS
SELECT
  e.branch_id,
  e.expense_category_id,
  ec.name AS category_name,
  e.expense_type,
  e.status,
  DATE_TRUNC('month', e.expense_date)::DATE AS expense_month,
  COUNT(*) AS expense_count,
  COALESCE(SUM(e.amount), 0) AS total_amount
FROM public.expenses AS e
LEFT JOIN public.expense_categories AS ec
  ON ec.id = e.expense_category_id
GROUP BY
  e.branch_id,
  e.expense_category_id,
  ec.name,
  e.expense_type,
  e.status,
  DATE_TRUNC('month', e.expense_date)::DATE;

CREATE OR REPLACE VIEW public.v_expense_approval_queue AS
SELECT
  e.id,
  e.branch_id,
  b.name AS branch_name,
  e.expense_date,
  e.expense_type,
  e.status,
  e.amount,
  e.description,
  e.reference_number,
  e.receipt_url,
  e.approval_notes,
  e.created_at,
  ec.name AS category_name,
  s.name AS supplier_name,
  creator.first_name AS creator_first_name,
  creator.last_name AS creator_last_name,
  creator.username AS creator_username
FROM public.expenses AS e
LEFT JOIN public.branches AS b
  ON b.id = e.branch_id
LEFT JOIN public.expense_categories AS ec
  ON ec.id = e.expense_category_id
LEFT JOIN public.suppliers AS s
  ON s.id = e.supplier_id
LEFT JOIN public.users AS creator
  ON creator.id = e.created_by
WHERE e.status = 'pending';

COMMIT;

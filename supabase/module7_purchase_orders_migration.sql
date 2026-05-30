-- Module 7: Purchase Orders & Stock Receiving
-- Apply after the base schema and RBAC helper functions are provisioned.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status') THEN
    CREATE TYPE po_status AS ENUM (
      'draft',
      'pending_approval',
      'approved',
      'ordered',
      'partially_received',
      'fully_received',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number         TEXT UNIQUE NOT NULL,
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  status            po_status DEFAULT 'draft',
  expected_date     DATE,
  received_date     DATE,
  supplier_invoice  TEXT,
  invoice_image_url TEXT,
  subtotal          NUMERIC(12, 2) DEFAULT 0,
  discount_amount   NUMERIC(12, 2) DEFAULT 0,
  tax_amount        NUMERIC(12, 2) DEFAULT 0,
  total_amount      NUMERIC(12, 2) DEFAULT 0,
  paid_amount       NUMERIC(12, 2) DEFAULT 0,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL,
  received_qty    INT DEFAULT 0,
  unit_cost       NUMERIC(12, 2) NOT NULL,
  total_cost      NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  po_id           UUID REFERENCES purchase_orders(id),
  amount          NUMERIC(12, 2) NOT NULL,
  payment_method  payment_method DEFAULT 'cash',
  reference_no    TEXT,
  paid_at         TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_branch_id ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON purchase_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);

ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_order_items_select" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_delete" ON purchase_order_items;
DROP POLICY IF EXISTS "supplier_payments_select" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_insert" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_update" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_delete" ON supplier_payments;

CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT
  USING (
    public.has_permission('purchasing', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT
  WITH CHECK (
    public.has_permission('purchasing', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE
  USING (
    (
      public.has_permission('purchasing', 'edit')
      OR public.has_permission('purchasing', 'approve')
      OR public.has_permission('purchasing', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('purchasing', 'edit')
      OR public.has_permission('purchasing', 'approve')
      OR public.has_permission('purchasing', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "purchase_orders_delete" ON purchase_orders
  FOR DELETE
  USING (
    (
      public.has_permission('purchasing', 'delete')
      OR public.has_permission('purchasing', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "purchase_order_items_select" ON purchase_order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND public.has_permission('purchasing', 'view')
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "purchase_order_items_insert" ON purchase_order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND (
          public.has_permission('purchasing', 'create')
          OR public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "purchase_order_items_update" ON purchase_order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND (
          public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND (
          public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "purchase_order_items_delete" ON purchase_order_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.po_id
        AND (
          public.has_permission('purchasing', 'delete')
          OR public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "supplier_payments_select" ON supplier_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND (
          public.has_permission('payables', 'view')
          OR public.has_permission('purchasing', 'view')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "supplier_payments_insert" ON supplier_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND (
          public.has_permission('payables', 'create')
          OR public.has_permission('payables', 'edit')
          OR public.has_permission('payables', 'manage')
          OR public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "supplier_payments_update" ON supplier_payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND (
          public.has_permission('payables', 'edit')
          OR public.has_permission('payables', 'manage')
          OR public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND (
          public.has_permission('payables', 'edit')
          OR public.has_permission('payables', 'manage')
          OR public.has_permission('purchasing', 'edit')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "supplier_payments_delete" ON supplier_payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND (
          public.has_permission('payables', 'manage')
          OR public.has_permission('purchasing', 'manage')
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

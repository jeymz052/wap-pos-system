-- ============================================================
-- WAP POS - RBAC and branch RLS policies
-- Run this in Supabase SQL Editor after the schema is created.
-- This script is idempotent and intended to be the source of
-- truth for authorization helpers and row-level policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable RLS on all tables that are queried directly
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS returns ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Helper functions
-- These are SECURITY DEFINER so policies can safely reuse them
-- without recursive RLS checks on public.users.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.branch_id
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(r.name)
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_data_access_scope()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(u.data_access_scope, 'branch_only')
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.auth_user_role_name() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.roles r
      ON r.id = u.role_id
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = r.id
     AND rp.is_allowed = TRUE
    LEFT JOIN public.permissions p
      ON p.id = rp.permission_id
    WHERE u.auth_id = auth.uid()
      AND (
        lower(r.name) = 'super_admin'
        OR (lower(p.module) = lower(p_module) AND lower(p.action) = lower(p_action))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR public.auth_user_data_access_scope() = 'all_data'
      OR p_branch_id = public.auth_user_branch_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_branch_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role_name() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_data_access_scope() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. Drop existing policies so the script can be re-run safely
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "roles_select" ON roles;
DROP POLICY IF EXISTS "permissions_select" ON permissions;
DROP POLICY IF EXISTS "role_permissions_select" ON role_permissions;

DROP POLICY IF EXISTS "branches_select" ON branches;
DROP POLICY IF EXISTS "branches_insert" ON branches;
DROP POLICY IF EXISTS "branches_update" ON branches;
DROP POLICY IF EXISTS "branches_delete" ON branches;

DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON suppliers;

DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_delete" ON customers;

DROP POLICY IF EXISTS "inventory_stocks_select" ON inventory_stocks;
DROP POLICY IF EXISTS "inventory_stocks_insert" ON inventory_stocks;
DROP POLICY IF EXISTS "inventory_stocks_update" ON inventory_stocks;
DROP POLICY IF EXISTS "inventory_stocks_delete" ON inventory_stocks;

DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;
DROP POLICY IF EXISTS "sales_delete" ON sales;
DROP POLICY IF EXISTS "branch_sales_access" ON sales;

DROP POLICY IF EXISTS "sale_items_select" ON sale_items;
DROP POLICY IF EXISTS "sale_items_insert" ON sale_items;
DROP POLICY IF EXISTS "sale_items_update" ON sale_items;
DROP POLICY IF EXISTS "sale_items_delete" ON sale_items;

DROP POLICY IF EXISTS "sale_payments_select" ON sale_payments;
DROP POLICY IF EXISTS "sale_payments_insert" ON sale_payments;
DROP POLICY IF EXISTS "sale_payments_update" ON sale_payments;
DROP POLICY IF EXISTS "sale_payments_delete" ON sale_payments;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete" ON purchase_orders;

DROP POLICY IF EXISTS "supplier_payments_select" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_insert" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_update" ON supplier_payments;
DROP POLICY IF EXISTS "supplier_payments_delete" ON supplier_payments;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

DROP POLICY IF EXISTS "receivables_select" ON receivables;
DROP POLICY IF EXISTS "receivables_insert" ON receivables;
DROP POLICY IF EXISTS "receivables_update" ON receivables;
DROP POLICY IF EXISTS "receivables_delete" ON receivables;

DROP POLICY IF EXISTS "receivable_payments_select" ON receivable_payments;
DROP POLICY IF EXISTS "receivable_payments_insert" ON receivable_payments;
DROP POLICY IF EXISTS "receivable_payments_update" ON receivable_payments;
DROP POLICY IF EXISTS "receivable_payments_delete" ON receivable_payments;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
DROP POLICY IF EXISTS "users_own_notifications" ON notifications;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

DROP POLICY IF EXISTS "cash_shifts_select" ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_insert" ON cash_shifts;
DROP POLICY IF EXISTS "cash_shifts_update" ON cash_shifts;

DROP POLICY IF EXISTS "stock_movements_select" ON stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert" ON stock_movements;

DROP POLICY IF EXISTS "returns_select" ON returns;
DROP POLICY IF EXISTS "returns_insert" ON returns;
DROP POLICY IF EXISTS "returns_update" ON returns;
DROP POLICY IF EXISTS "returns_delete" ON returns;

-- ------------------------------------------------------------
-- 4. RBAC system tables
-- Read-only to authenticated sessions. Seed writes should happen
-- through SQL editor or the service-role-backed API route.
-- ------------------------------------------------------------
CREATE POLICY "roles_select" ON roles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "permissions_select" ON permissions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "role_permissions_select" ON role_permissions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ------------------------------------------------------------
-- 5. Scope-aware application policies
-- Branch scope is enforced by can_access_branch().
-- Fine-grained module access is enforced by has_permission().
-- ------------------------------------------------------------
CREATE POLICY "branches_select" ON branches
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.can_access_branch(id)
  );

CREATE POLICY "branches_insert" ON branches
  FOR INSERT
  WITH CHECK (public.has_permission('branches', 'create'));

CREATE POLICY "branches_update" ON branches
  FOR UPDATE
  USING (public.has_permission('branches', 'edit'))
  WITH CHECK (public.has_permission('branches', 'edit'));

CREATE POLICY "branches_delete" ON branches
  FOR DELETE
  USING (public.has_permission('branches', 'delete'));

CREATE POLICY "users_select" ON users
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      id = public.auth_user_profile_id()
      OR public.can_access_branch(branch_id)
    )
  );

CREATE POLICY "users_insert" ON users
  FOR INSERT
  WITH CHECK (
    public.has_permission('users', 'create')
    AND (
      branch_id IS NULL
      OR public.can_access_branch(branch_id)
    )
  );

CREATE POLICY "users_update" ON users
  FOR UPDATE
  USING (
    id = public.auth_user_profile_id()
    OR (
      public.has_permission('users', 'edit')
      AND public.can_access_branch(branch_id)
    )
  )
  WITH CHECK (
    id = public.auth_user_profile_id()
    OR (
      public.has_permission('users', 'edit')
      AND (
        branch_id IS NULL
        OR public.can_access_branch(branch_id)
      )
    )
  );

CREATE POLICY "users_delete" ON users
  FOR DELETE
  USING (
    public.has_permission('users', 'delete')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "products_select" ON products
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_permission('inventory', 'view')
      OR public.has_permission('pos', 'view')
      OR public.has_permission('purchasing', 'view')
    )
  );

CREATE POLICY "products_insert" ON products
  FOR INSERT
  WITH CHECK (public.has_permission('inventory', 'create'));

CREATE POLICY "products_update" ON products
  FOR UPDATE
  USING (
    public.has_permission('inventory', 'edit')
    OR public.has_permission('inventory', 'manage')
  )
  WITH CHECK (
    public.has_permission('inventory', 'edit')
    OR public.has_permission('inventory', 'manage')
  );

CREATE POLICY "products_delete" ON products
  FOR DELETE
  USING (
    public.has_permission('inventory', 'delete')
    OR public.has_permission('inventory', 'manage')
  );

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_permission('suppliers', 'view')
      OR public.has_permission('purchasing', 'view')
      OR public.has_permission('payables', 'view')
      OR public.has_permission('expenses', 'view')
    )
  );

CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT
  WITH CHECK (
    public.has_permission('suppliers', 'create')
    OR public.has_permission('suppliers', 'manage')
  );

CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE
  USING (
    public.has_permission('suppliers', 'edit')
    OR public.has_permission('suppliers', 'manage')
  )
  WITH CHECK (
    public.has_permission('suppliers', 'edit')
    OR public.has_permission('suppliers', 'manage')
  );

CREATE POLICY "suppliers_delete" ON suppliers
  FOR DELETE
  USING (
    public.has_permission('suppliers', 'delete')
    OR public.has_permission('suppliers', 'manage')
  );

CREATE POLICY "customers_select" ON customers
  FOR SELECT
  USING (
    (
      public.has_permission('customers', 'view')
      OR public.has_permission('receivables', 'view')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "customers_insert" ON customers
  FOR INSERT
  WITH CHECK (
    public.has_permission('customers', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "customers_update" ON customers
  FOR UPDATE
  USING (
    (public.has_permission('customers', 'edit') OR public.has_permission('customers', 'manage'))
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (public.has_permission('customers', 'edit') OR public.has_permission('customers', 'manage'))
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "customers_delete" ON customers
  FOR DELETE
  USING (
    (public.has_permission('customers', 'delete') OR public.has_permission('customers', 'manage'))
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "inventory_stocks_select" ON inventory_stocks
  FOR SELECT
  USING (
    (
      public.has_permission('inventory', 'view')
      OR public.has_permission('pos', 'view')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "inventory_stocks_insert" ON inventory_stocks
  FOR INSERT
  WITH CHECK (
    (
      public.has_permission('inventory', 'create')
      OR public.has_permission('inventory', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "inventory_stocks_update" ON inventory_stocks
  FOR UPDATE
  USING (
    (
      public.has_permission('inventory', 'adjust_stock')
      OR public.has_permission('inventory', 'receive_stock')
      OR public.has_permission('inventory', 'transfer_stock')
      OR public.has_permission('inventory', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('inventory', 'adjust_stock')
      OR public.has_permission('inventory', 'receive_stock')
      OR public.has_permission('inventory', 'transfer_stock')
      OR public.has_permission('inventory', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "inventory_stocks_delete" ON inventory_stocks
  FOR DELETE
  USING (
    public.has_permission('inventory', 'manage')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "sales_select" ON sales
  FOR SELECT
  USING (
    public.has_permission('pos', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "sales_insert" ON sales
  FOR INSERT
  WITH CHECK (
    public.has_permission('pos', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "sales_update" ON sales
  FOR UPDATE
  USING (
    (
      public.has_permission('pos', 'edit')
      OR public.has_permission('pos', 'void')
      OR public.has_permission('pos', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('pos', 'edit')
      OR public.has_permission('pos', 'void')
      OR public.has_permission('pos', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "sale_items_select" ON sale_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND public.has_permission('pos', 'view')
        AND public.can_access_branch(s.branch_id)
    )
  );

CREATE POLICY "sale_items_insert" ON sale_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND public.has_permission('pos', 'create')
        AND public.can_access_branch(s.branch_id)
    )
  );

CREATE POLICY "sale_items_update" ON sale_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND (
          public.has_permission('pos', 'edit')
          OR public.has_permission('pos', 'manage')
        )
        AND public.can_access_branch(s.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND (
          public.has_permission('pos', 'edit')
          OR public.has_permission('pos', 'manage')
        )
        AND public.can_access_branch(s.branch_id)
    )
  );

CREATE POLICY "sale_payments_select" ON sale_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND public.has_permission('pos', 'view')
        AND public.can_access_branch(s.branch_id)
    )
  );

CREATE POLICY "sale_payments_insert" ON sale_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND public.has_permission('pos', 'create')
        AND public.can_access_branch(s.branch_id)
    )
  );

CREATE POLICY "sale_payments_update" ON sale_payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND (
          public.has_permission('pos', 'edit')
          OR public.has_permission('pos', 'manage')
        )
        AND public.can_access_branch(s.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_payments.sale_id
        AND (
          public.has_permission('pos', 'edit')
          OR public.has_permission('pos', 'manage')
        )
        AND public.can_access_branch(s.branch_id)
    )
  );

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

CREATE POLICY "supplier_payments_select" ON supplier_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = supplier_payments.po_id
        AND public.has_permission('payables', 'view')
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
        )
        AND public.can_access_branch(po.branch_id)
    )
  );

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT
  USING (
    public.has_permission('expenses', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT
  WITH CHECK (
    public.has_permission('expenses', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING (
    (
      public.has_permission('expenses', 'edit')
      OR public.has_permission('expenses', 'approve')
      OR public.has_permission('expenses', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('expenses', 'edit')
      OR public.has_permission('expenses', 'approve')
      OR public.has_permission('expenses', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE
  USING (
    public.has_permission('expenses', 'manage')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "receivables_select" ON receivables
  FOR SELECT
  USING (
    public.has_permission('receivables', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "receivables_insert" ON receivables
  FOR INSERT
  WITH CHECK (
    public.has_permission('receivables', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "receivables_update" ON receivables
  FOR UPDATE
  USING (
    (
      public.has_permission('receivables', 'edit')
      OR public.has_permission('receivables', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('receivables', 'edit')
      OR public.has_permission('receivables', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "receivables_delete" ON receivables
  FOR DELETE
  USING (
    public.has_permission('receivables', 'manage')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "receivable_payments_select" ON receivable_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.receivables r
      WHERE r.id = receivable_payments.receivable_id
        AND public.has_permission('receivables', 'view')
        AND public.can_access_branch(r.branch_id)
    )
  );

CREATE POLICY "receivable_payments_insert" ON receivable_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.receivables r
      WHERE r.id = receivable_payments.receivable_id
        AND (
          public.has_permission('receivables', 'create')
          OR public.has_permission('receivables', 'edit')
          OR public.has_permission('receivables', 'manage')
        )
        AND public.can_access_branch(r.branch_id)
    )
  );

CREATE POLICY "receivable_payments_update" ON receivable_payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.receivables r
      WHERE r.id = receivable_payments.receivable_id
        AND (
          public.has_permission('receivables', 'edit')
          OR public.has_permission('receivables', 'manage')
        )
        AND public.can_access_branch(r.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.receivables r
      WHERE r.id = receivable_payments.receivable_id
        AND (
          public.has_permission('receivables', 'edit')
          OR public.has_permission('receivables', 'manage')
        )
        AND public.can_access_branch(r.branch_id)
    )
  );

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT
  USING (
    user_id = public.auth_user_profile_id()
    OR (
      branch_id IS NOT NULL
      AND public.can_access_branch(branch_id)
      AND public.has_permission('reports', 'view')
    )
  );

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT
  WITH CHECK (
    user_id = public.auth_user_profile_id()
    OR (
      branch_id IS NOT NULL
      AND public.can_access_branch(branch_id)
    )
  );

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE
  USING (user_id = public.auth_user_profile_id())
  WITH CHECK (user_id = public.auth_user_profile_id());

CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE
  USING (user_id = public.auth_user_profile_id());

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT
  USING (
    public.has_permission('audit_logs', 'view')
    AND (
      branch_id IS NULL
      OR public.can_access_branch(branch_id)
    )
  );

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      branch_id IS NULL
      OR public.can_access_branch(branch_id)
    )
  );

CREATE POLICY "cash_shifts_select" ON cash_shifts
  FOR SELECT
  USING (
    public.has_permission('pos', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "cash_shifts_insert" ON cash_shifts
  FOR INSERT
  WITH CHECK (
    (
      public.has_permission('pos', 'create')
      OR public.has_permission('pos', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "cash_shifts_update" ON cash_shifts
  FOR UPDATE
  USING (
    (
      public.has_permission('pos', 'edit')
      OR public.has_permission('pos', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('pos', 'edit')
      OR public.has_permission('pos', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "stock_movements_select" ON stock_movements
  FOR SELECT
  USING (
    public.has_permission('inventory', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "stock_movements_insert" ON stock_movements
  FOR INSERT
  WITH CHECK (
    (
      public.has_permission('inventory', 'receive_stock')
      OR public.has_permission('inventory', 'adjust_stock')
      OR public.has_permission('inventory', 'transfer_stock')
      OR public.has_permission('inventory', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "returns_select" ON returns
  FOR SELECT
  USING (
    public.has_permission('returns', 'view')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "returns_insert" ON returns
  FOR INSERT
  WITH CHECK (
    public.has_permission('returns', 'create')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "returns_update" ON returns
  FOR UPDATE
  USING (
    (
      public.has_permission('returns', 'approve')
      OR public.has_permission('returns', 'manage')
    )
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    (
      public.has_permission('returns', 'approve')
      OR public.has_permission('returns', 'manage')
    )
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "returns_delete" ON returns
  FOR DELETE
  USING (
    public.has_permission('returns', 'manage')
    AND public.can_access_branch(branch_id)
  );

-- ------------------------------------------------------------
-- 6. Verification queries
-- ------------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'roles', 'permissions', 'role_permissions',
    'branches', 'users', 'products', 'suppliers', 'customers',
    'inventory_stocks', 'sales', 'sale_items', 'sale_payments',
    'purchase_orders', 'supplier_payments', 'expenses',
    'receivables', 'receivable_payments', 'notifications',
    'audit_logs', 'cash_shifts', 'stock_movements', 'returns'
  )
ORDER BY tablename, policyname;

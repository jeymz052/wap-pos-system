-- ============================================================
-- WAP POS – RBAC Seed Data
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Idempotent: safe to run multiple times
-- ============================================================

-- ── 1. ROLES ─────────────────────────────────────────────────────────────────

INSERT INTO roles (name, description, is_system) VALUES
  ('super_admin',     'Full system access to all modules and settings',               true),
  ('admin',           'Manage daily operations, staff, customers, receivables, payables, and reports', true),
  ('cashier',         'Process POS sales, print receipts, view own transactions',     true),
  ('inventory_staff', 'Manage inventory, stock movements, and barcode printing',      true),
  ('accountant',      'Manage financial reports, expenses, receivables, payables, and cash drawer reports', true),
  ('branch_staff',    'Access limited to assigned branch only',                       true)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      is_system   = EXCLUDED.is_system;

-- ── 2. PERMISSIONS ───────────────────────────────────────────────────────────

INSERT INTO permissions (module, action, description) VALUES
  -- Dashboard
  ('dashboard',     'view',           'View dashboard and summary'),

  -- POS / Sales
  ('pos',           'view',           'View POS and sales transactions'),
  ('pos',           'create',         'Process sales and checkout'),
  ('pos',           'edit',           'Edit held or pending sales'),
  ('pos',           'void',           'Void completed transactions'),
  ('pos',           'apply_discount', 'Apply discounts to items or orders'),
  ('pos',           'hold_order',     'Place orders on hold'),
  ('pos',           'print_receipt',  'Print transaction receipts'),
  ('pos',           'manage',         'Full POS management and monitoring access'),

  -- Inventory
  ('inventory',     'view',           'View product list and stock levels'),
  ('inventory',     'view_cost_price','View product cost price and margin-sensitive inventory values'),
  ('inventory',     'create',         'Add new products to the catalogue'),
  ('inventory',     'edit',           'Edit existing product details'),
  ('inventory',     'delete',         'Delete or deactivate products'),
  ('inventory',     'receive_stock',  'Receive stock from purchase orders'),
  ('inventory',     'adjust_stock',   'Adjust stock quantities manually'),
  ('inventory',     'transfer_stock', 'Transfer stock between branches'),
  ('inventory',     'print_barcode',  'Print barcodes and product labels'),
  ('inventory',     'manage',         'Full inventory management access'),

  -- Purchasing
  ('purchasing',    'view',           'View purchase orders and history'),
  ('purchasing',    'create',         'Create new purchase orders'),
  ('purchasing',    'edit',           'Edit draft or pending purchase orders'),
  ('purchasing',    'approve',        'Approve purchase orders'),
  ('purchasing',    'delete',         'Delete draft purchase orders'),
  ('purchasing',    'manage',         'Full purchasing management access'),

  -- Sales Orders & Quotations
  ('sales_orders',  'view',           'View quotations, sales orders, and pricing rules'),
  ('sales_orders',  'create',         'Create quotations and sales orders'),
  ('sales_orders',  'edit',           'Edit quotations, sales orders, and reservations'),
  ('sales_orders',  'approve',        'Approve quotations or convert them to sales'),
  ('sales_orders',  'email',          'Send quotations via email'),
  ('sales_orders',  'manage',         'Full quotation and sales order management access'),

  -- Suppliers
  ('suppliers',     'view',           'View supplier list and details'),
  ('suppliers',     'create',         'Add new suppliers'),
  ('suppliers',     'edit',           'Edit supplier information'),
  ('suppliers',     'delete',         'Delete or deactivate suppliers'),
  ('suppliers',     'manage',         'Full supplier management access'),

  -- Customers
  ('customers',     'view',           'View customer list and profiles'),
  ('customers',     'create',         'Add new customer records'),
  ('customers',     'edit',           'Edit customer information'),
  ('customers',     'delete',         'Delete or deactivate customers'),
  ('customers',     'manage',         'Full customer management access'),

  -- Reports
  ('reports',       'view',           'Access and view all reports'),
  ('reports',       'create',         'Generate and schedule reports'),
  ('reports',       'export',         'Export reports to PDF or Excel'),
  ('reports',       'manage',         'Full reports management access'),

  -- Notifications
  ('notifications', 'view',           'View in-app notifications and alert history'),
  ('notifications', 'manage',         'Manage alert generation and notification delivery'),

  -- Settings
  ('settings',      'view',           'View system settings'),
  ('settings',      'edit',           'Edit system settings'),
  ('settings',      'manage',         'Full settings management access'),

  -- Users / Staff Accounts
  ('users',         'view',           'View staff accounts and profiles'),
  ('users',         'create',         'Create new staff accounts'),
  ('users',         'edit',           'Edit staff account details and roles'),
  ('users',         'delete',         'Delete or deactivate staff accounts'),
  ('users',         'manage',         'Full user and role management access'),

  -- Branches
  ('branches',      'view',           'View branch list and details'),
  ('branches',      'create',         'Create new branches'),
  ('branches',      'edit',           'Edit branch information'),
  ('branches',      'delete',         'Delete or deactivate branches'),
  ('branches',      'manage',         'Full branch management access'),

  -- Subscriptions
  ('subscriptions', 'view',           'View subscription plans and status'),
  ('subscriptions', 'manage',         'Manage subscription and billing'),

  -- Audit Logs
  ('audit_logs',    'view',           'View system audit logs'),

  -- Returns & Refunds
  ('returns',       'view',           'View return and refund requests'),
  ('returns',       'create',         'Create new return requests'),
  ('returns',       'approve',        'Approve or reject return requests'),
  ('returns',       'refund',         'Finalize customer refunds and issue store credit'),
  ('returns',       'manage',         'Full returns and refund management'),

  -- Expenses
  ('expenses',      'view',           'View expense records'),
  ('expenses',      'create',         'Record new expenses'),
  ('expenses',      'edit',           'Edit expense records'),
  ('expenses',      'approve',        'Approve or reject expense claims'),
  ('expenses',      'manage',         'Full expense management access'),

  -- Receivables
  ('receivables',   'view',           'View customer receivables and collections'),
  ('receivables',   'create',         'Create customer receivables and collection records'),
  ('receivables',   'edit',           'Edit receivables and received payments'),
  ('receivables',   'manage',         'Full receivables management access'),

  -- Payables
  ('payables',      'view',           'View supplier payables and payment history'),
  ('payables',      'create',         'Create supplier payable and payment records'),
  ('payables',      'edit',           'Edit payables and supplier payments'),
  ('payables',      'manage',         'Full payables management access')

ON CONFLICT (module, action) DO UPDATE
  SET description = EXCLUDED.description;

-- ── 3. ROLE → PERMISSION MAPPINGS ────────────────────────────────────────────

WITH
  r AS (SELECT id, name FROM roles),
  p AS (SELECT id, module, action FROM permissions),

  -- 4.1 SUPER ADMIN: every single permission
  super_admin_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r CROSS JOIN p
    WHERE  r.name = 'super_admin'
  ),

  -- 4.2 ADMIN / MANAGER: daily operations role
  admin_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r JOIN p ON (
        (p.module = 'dashboard'     AND p.action IN ('view'))
     OR (p.module = 'pos'           AND p.action IN ('view','create','edit','void','apply_discount','hold_order','print_receipt','manage'))
     OR (p.module = 'inventory'     AND p.action IN ('view','view_cost_price','create','edit','receive_stock','adjust_stock','transfer_stock','print_barcode','manage'))
     OR (p.module = 'purchasing'    AND p.action IN ('view','create','edit','approve','manage'))
     OR (p.module = 'sales_orders'  AND p.action IN ('view','create','edit','approve','email','manage'))
     OR (p.module = 'suppliers'     AND p.action IN ('view','create','edit','manage'))
     OR (p.module = 'customers'     AND p.action IN ('view','create','edit','manage'))
     OR (p.module = 'reports'       AND p.action IN ('view','create','export','manage'))
     OR (p.module = 'notifications' AND p.action IN ('view','manage'))
     OR (p.module = 'settings'      AND p.action IN ('view','edit'))
     OR (p.module = 'users'         AND p.action IN ('view','create','edit'))
     OR (p.module = 'branches'      AND p.action IN ('view'))
     OR (p.module = 'returns'       AND p.action IN ('view','create','approve','refund','manage'))
     OR (p.module = 'expenses'      AND p.action IN ('view','create','edit','approve','manage'))
     OR (p.module = 'receivables'   AND p.action IN ('view','create','edit','manage'))
     OR (p.module = 'payables'      AND p.action IN ('view','create','edit','manage'))
     OR (p.module = 'audit_logs'    AND p.action IN ('view'))
    )
    WHERE r.name = 'admin'
  ),

  -- 4.3 CASHIER: POS-only + limited customer/inventory view
  cashier_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r JOIN p ON (
        (p.module = 'pos'           AND p.action IN ('view','create','apply_discount','hold_order','print_receipt'))
     OR (p.module = 'sales_orders'  AND p.action IN ('view','create','approve'))
     OR (p.module = 'inventory'     AND p.action IN ('view'))
     OR (p.module = 'customers'     AND p.action IN ('view','create'))
     OR (p.module = 'reports'       AND p.action IN ('view'))
     OR (p.module = 'notifications' AND p.action IN ('view'))
    )
    WHERE r.name = 'cashier'
  ),

  -- 4.4 INVENTORY STAFF: full inventory + stock receiving + barcode printing
  inventory_staff_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r JOIN p ON (
        (p.module = 'inventory'     AND p.action IN ('view','view_cost_price','create','edit','receive_stock','adjust_stock','transfer_stock','print_barcode','manage'))
     OR (p.module = 'purchasing'    AND p.action IN ('view','create'))
     OR (p.module = 'sales_orders'  AND p.action IN ('view'))
     OR (p.module = 'suppliers'     AND p.action IN ('view'))
     OR (p.module = 'reports'       AND p.action IN ('view'))
     OR (p.module = 'notifications' AND p.action IN ('view'))
    )
    WHERE r.name = 'inventory_staff'
  ),

  -- 4.5 ACCOUNTANT: financial reports, expenses, receivables, payables, and cash drawer reporting
  accountant_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r JOIN p ON (
        (p.module = 'reports'       AND p.action IN ('view','create','export'))
     OR (p.module = 'inventory'     AND p.action IN ('view_cost_price'))
     OR (p.module = 'expenses'      AND p.action IN ('view','create','edit','approve'))
     OR (p.module = 'receivables'   AND p.action IN ('view','create','edit'))
     OR (p.module = 'payables'      AND p.action IN ('view','create','edit'))
     OR (p.module = 'purchasing'    AND p.action IN ('view'))
     OR (p.module = 'sales_orders'  AND p.action IN ('view'))
     OR (p.module = 'customers'     AND p.action IN ('view'))
     OR (p.module = 'suppliers'     AND p.action IN ('view'))
     OR (p.module = 'pos'           AND p.action IN ('view'))
     OR (p.module = 'notifications' AND p.action IN ('view'))
    )
    WHERE r.name = 'accountant'
  ),

  -- 4.6 BRANCH STAFF: minimal — limited to assigned branch (enforced via data_access_scope)
  branch_staff_perms AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM   r JOIN p ON (
        (p.module = 'pos'           AND p.action IN ('view','create','print_receipt'))
     OR (p.module = 'sales_orders'  AND p.action IN ('view','create'))
     OR (p.module = 'inventory'     AND p.action IN ('view'))
     OR (p.module = 'customers'     AND p.action IN ('view','create'))
     OR (p.module = 'reports'       AND p.action IN ('view'))
     OR (p.module = 'notifications' AND p.action IN ('view'))
    )
    WHERE r.name = 'branch_staff'
  ),

  all_mappings AS (
    SELECT * FROM super_admin_perms
    UNION ALL SELECT * FROM admin_perms
    UNION ALL SELECT * FROM cashier_perms
    UNION ALL SELECT * FROM inventory_staff_perms
    UNION ALL SELECT * FROM accountant_perms
    UNION ALL SELECT * FROM branch_staff_perms
  )

INSERT INTO role_permissions (role_id, permission_id, is_allowed)
SELECT role_id, permission_id, TRUE
FROM   all_mappings
ON CONFLICT (role_id, permission_id) DO UPDATE
  SET is_allowed = TRUE;

-- ── 4. VERIFICATION QUERY ─────────────────────────────────────────────────────
-- Run this after seeding to confirm counts

SELECT
  r.name                          AS role,
  COUNT(rp.id)                    AS permission_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_allowed = TRUE
GROUP BY r.name
ORDER BY permission_count DESC;

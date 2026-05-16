-- ============================================================
-- WAP POS – Motorparts Shop POS + Inventory System
-- Complete Supabase PostgreSQL Schema
-- Tech Stack: React + Next.js + TypeScript + Supabase
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'super_admin', 'admin', 'cashier',
  'inventory_staff', 'accountant', 'branch_staff'
);

CREATE TYPE subscription_plan AS ENUM ('starter', 'professional', 'enterprise');

CREATE TYPE product_status AS ENUM ('active', 'inactive');

CREATE TYPE stock_movement_type AS ENUM (
  'sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out',
  'return_in', 'return_out', 'damage', 'initial'
);

CREATE TYPE po_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'ordered',
  'partially_received', 'fully_received', 'cancelled'
);

CREATE TYPE payment_method AS ENUM (
  'cash', 'card', 'bank_transfer', 'gcash', 'ewallet',
  'customer_credit', 'split'
);

CREATE TYPE sale_status AS ENUM ('completed', 'held', 'voided', 'refunded');

CREATE TYPE return_status AS ENUM (
  'requested', 'approved', 'rejected', 'refunded',
  'exchanged', 'warranty_processing'
);

CREATE TYPE customer_type AS ENUM ('retail', 'wholesale', 'mechanic', 'reseller', 'walk_in');

CREATE TYPE supplier_type AS ENUM (
  'retailer', 'distributor', 'wholesaler', 'manufacturer', 'service_provider'
);

CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE shift_status AS ENUM ('open', 'closed', 'pending_approval');

CREATE TYPE notification_type AS ENUM (
  'low_stock', 'out_of_stock', 'pending_po', 'credit_due',
  'supplier_payment_due', 'shift_closing', 'unusual_discount',
  'negative_stock', 'expiring_warranty'
);

CREATE TYPE quotation_status AS ENUM (
  'draft', 'sent', 'approved', 'converted', 'expired', 'cancelled'
);

CREATE TYPE invoice_status AS ENUM (
  'unpaid', 'partial', 'paid', 'overdue'
);

CREATE TYPE barcode_type AS ENUM ('barcode', 'qr_code');

-- ============================================================
-- MODULE 1: BRANCHES
-- ============================================================

CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  code          TEXT UNIQUE NOT NULL,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  is_main       BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 2: SUBSCRIPTIONS & SAAS
-- ============================================================

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan            subscription_plan NOT NULL DEFAULT 'starter',
  branch_limit    INT NOT NULL DEFAULT 1,
  user_limit      INT NOT NULL DEFAULT 3,
  product_limit   INT NOT NULL DEFAULT 500,
  is_trial        BOOLEAN DEFAULT FALSE,
  trial_ends_at   TIMESTAMPTZ,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  payment_status  TEXT DEFAULT 'paid', -- paid, unpaid, overdue
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscription_invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES subscriptions(id),
  amount          NUMERIC(12, 2) NOT NULL,
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  status          TEXT DEFAULT 'unpaid',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 3: USERS & ROLES
-- ============================================================

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module      TEXT NOT NULL,   -- e.g. 'inventory', 'pos', 'reports'
  action      TEXT NOT NULL,   -- e.g. 'view', 'create', 'edit', 'delete'
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (module, action)
);

CREATE TABLE role_permissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  is_allowed    BOOLEAN DEFAULT TRUE,
  UNIQUE (role_id, permission_id)
);

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id             UUID UNIQUE, -- Supabase auth.users id
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  username            TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  phone               TEXT,
  employee_id         TEXT,
  role_id             UUID REFERENCES roles(id),
  branch_id           UUID REFERENCES branches(id),
  data_access_scope   TEXT DEFAULT 'branch_only', -- all_data, branch_only, custom
  cashier_pin         TEXT,                        -- hashed PIN for quick login
  is_active           BOOLEAN DEFAULT TRUE,
  allow_login         BOOLEAN DEFAULT TRUE,
  two_factor_enabled  BOOLEAN DEFAULT FALSE,
  password_expires_at TIMESTAMPTZ,
  max_login_attempts  INT DEFAULT 5,
  session_timeout_min INT DEFAULT 30,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE login_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  ip_address  TEXT,
  user_agent  TEXT,
  status      TEXT DEFAULT 'success', -- success, failed, locked
  logged_in_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 4: CATEGORIES, BRANDS, COMPATIBILITY
-- ============================================================

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES categories(id),
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE motorcycle_models (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand       TEXT NOT NULL,
  model_name  TEXT NOT NULL,
  engine_type TEXT,
  year_from   INT,
  year_to     INT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 5: SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  supplier_type   supplier_type DEFAULT 'distributor',
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  tax_number      TEXT,
  payment_terms   INT DEFAULT 30, -- days
  credit_limit    NUMERIC(12, 2) DEFAULT 0,
  current_balance NUMERIC(12, 2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 6: CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  customer_type   customer_type DEFAULT 'retail',
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  credit_limit    NUMERIC(12, 2) DEFAULT 0,
  current_balance NUMERIC(12, 2) DEFAULT 0,
  loyalty_points  INT DEFAULT 0,
  salesperson_id  UUID REFERENCES users(id),
  branch_id       UUID REFERENCES branches(id),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_vehicles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  motorcycle_model_id UUID REFERENCES motorcycle_models(id),
  plate_number     TEXT,
  year_model       INT,
  color            TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 7: PRODUCTS & INVENTORY
-- ============================================================

CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  part_number           TEXT,
  sku                   TEXT UNIQUE NOT NULL,
  barcode               TEXT UNIQUE,
  category_id           UUID REFERENCES categories(id),
  brand_id              UUID REFERENCES brands(id),
  supplier_id           UUID REFERENCES suppliers(id),
  supplier_code         TEXT,
  unit_type             TEXT DEFAULT 'pcs',
  cost_price            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wholesale_price       NUMERIC(12, 2),
  minimum_price         NUMERIC(12, 2),
  reorder_level         INT DEFAULT 0,
  critical_stock_level  INT DEFAULT 0,
  shelf_location        TEXT,
  warranty_period_days  INT DEFAULT 0,
  has_serial_tracking   BOOLEAN DEFAULT FALSE,
  has_batch_tracking    BOOLEAN DEFAULT FALSE,
  has_expiry_tracking   BOOLEAN DEFAULT FALSE,
  status                product_status DEFAULT 'active',
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  is_primary  BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_compatibility (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  motorcycle_model_id UUID NOT NULL REFERENCES motorcycle_models(id) ON DELETE CASCADE,
  notes               TEXT,
  UNIQUE (product_id, motorcycle_model_id)
);

CREATE TABLE inventory_stocks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity     INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, branch_id)
);

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  movement_type   stock_movement_type NOT NULL,
  quantity        INT NOT NULL, -- positive = in, negative = out
  quantity_before INT NOT NULL,
  quantity_after  INT NOT NULL,
  reference_type  TEXT,   -- sale, purchase_order, adjustment, transfer, return
  reference_id    UUID,   -- FK to the related record
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_branch_id  UUID NOT NULL REFERENCES branches(id),
  to_branch_id    UUID NOT NULL REFERENCES branches(id),
  status          TEXT DEFAULT 'pending', -- pending, in_transit, received, cancelled
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  received_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_transfer_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  quantity          INT NOT NULL,
  notes             TEXT
);

CREATE TABLE stock_adjustments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  reason      TEXT NOT NULL,
  notes       TEXT,
  status      TEXT DEFAULT 'pending', -- pending, approved, rejected
  approved_by UUID REFERENCES users(id),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_adjustment_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_adjustment_id  UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id           UUID NOT NULL REFERENCES products(id),
  quantity_before      INT NOT NULL,
  quantity_after       INT NOT NULL,
  difference           INT GENERATED ALWAYS AS (quantity_after - quantity_before) STORED,
  notes                TEXT
);

-- ============================================================
-- MODULE 8: BARCODES & LABELS
-- ============================================================

CREATE TABLE barcode_labels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value TEXT NOT NULL,
  barcode_type  barcode_type DEFAULT 'barcode',
  label_size    TEXT DEFAULT '58x30', -- e.g. "58x30", "100x50"
  include_price BOOLEAN DEFAULT TRUE,
  include_brand BOOLEAN DEFAULT TRUE,
  include_sku   BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 9: PURCHASE ORDERS
-- ============================================================

CREATE TABLE purchase_orders (
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

CREATE TABLE purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL,
  received_qty    INT DEFAULT 0,
  unit_cost       NUMERIC(12, 2) NOT NULL,
  total_cost      NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes           TEXT
);

CREATE TABLE supplier_payments (
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

-- ============================================================
-- MODULE 10: SALES / POS
-- ============================================================

CREATE TABLE cash_shifts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id        UUID NOT NULL REFERENCES branches(id),
  cashier_id       UUID NOT NULL REFERENCES users(id),
  status           shift_status DEFAULT 'open',
  starting_cash    NUMERIC(12, 2) DEFAULT 0,
  expected_cash    NUMERIC(12, 2) DEFAULT 0,
  actual_cash      NUMERIC(12, 2),
  cash_difference  NUMERIC(12, 2),
  total_cash_sales NUMERIC(12, 2) DEFAULT 0,
  total_noncash    NUMERIC(12, 2) DEFAULT 0,
  notes            TEXT,
  approved_by      UUID REFERENCES users(id),
  opened_at        TIMESTAMPTZ DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cash_movements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id    UUID NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL, -- 'cash_in', 'cash_out'
  amount      NUMERIC(12, 2) NOT NULL,
  reason      TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  TEXT UNIQUE NOT NULL,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  cashier_id      UUID NOT NULL REFERENCES users(id),
  shift_id        UUID REFERENCES cash_shifts(id),
  customer_id     UUID REFERENCES customers(id),
  status          sale_status DEFAULT 'completed',
  subtotal        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_type   TEXT,         -- 'percent' or 'fixed'
  discount_value  NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  tax_rate        NUMERIC(5, 2) DEFAULT 0,
  tax_amount      NUMERIC(12, 2) DEFAULT 0,
  total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(12, 2) DEFAULT 0,
  change_amount   NUMERIC(12, 2) DEFAULT 0,
  notes           TEXT,
  voided_by       UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sale_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL,
  unit_price      NUMERIC(12, 2) NOT NULL,
  discount_type   TEXT,
  discount_value  NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total_price     NUMERIC(12, 2) NOT NULL,
  cost_price      NUMERIC(12, 2), -- snapshot at time of sale
  notes           TEXT
);

CREATE TABLE sale_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method  payment_method NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL,
  reference_no    TEXT,         -- GCash ref, card trace, etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 11: QUOTATIONS & SALES ORDERS
-- ============================================================

CREATE TABLE quotations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number    TEXT UNIQUE NOT NULL,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  customer_id     UUID REFERENCES customers(id),
  status          quotation_status DEFAULT 'draft',
  valid_until     DATE,
  subtotal        NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  tax_amount      NUMERIC(12, 2) DEFAULT 0,
  total_amount    NUMERIC(12, 2) DEFAULT 0,
  notes           TEXT,
  converted_to_sale_id UUID REFERENCES sales(id),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quotation_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id),
  quantity      INT NOT NULL,
  unit_price    NUMERIC(12, 2) NOT NULL,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total_price   NUMERIC(12, 2) NOT NULL,
  notes         TEXT
);

-- ============================================================
-- MODULE 12: RETURNS & WARRANTY
-- ============================================================

CREATE TABLE returns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number   TEXT UNIQUE NOT NULL,
  sale_id         UUID REFERENCES sales(id),
  customer_id     UUID REFERENCES customers(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  status          return_status DEFAULT 'requested',
  reason          TEXT NOT NULL,
  refund_method   payment_method,
  refund_amount   NUMERIC(12, 2) DEFAULT 0,
  store_credit    NUMERIC(12, 2) DEFAULT 0,
  notes           TEXT,
  requested_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE return_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id       UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  sale_item_id    UUID REFERENCES sale_items(id),
  quantity        INT NOT NULL,
  unit_price      NUMERIC(12, 2) NOT NULL,
  condition       TEXT DEFAULT 'good', -- good, damaged, defective
  restock         BOOLEAN DEFAULT TRUE,
  notes           TEXT
);

CREATE TABLE warranty_claims (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id       UUID REFERENCES returns(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  customer_id     UUID REFERENCES customers(id),
  claim_date      DATE NOT NULL,
  expiry_date     DATE,
  status          TEXT DEFAULT 'pending',
  description     TEXT,
  resolution      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 13: EXPENSES
-- ============================================================

CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id            UUID NOT NULL REFERENCES branches(id),
  expense_category_id  UUID REFERENCES expense_categories(id),
  amount               NUMERIC(12, 2) NOT NULL,
  description          TEXT NOT NULL,
  expense_date         DATE NOT NULL,
  payment_method       payment_method DEFAULT 'cash',
  receipt_url          TEXT,
  status               expense_status DEFAULT 'pending',
  approved_by          UUID REFERENCES users(id),
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 14: RECEIVABLES (Customer Credit)
-- ============================================================

CREATE TABLE receivables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  TEXT UNIQUE NOT NULL,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  sale_id         UUID REFERENCES sales(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  total_amount    NUMERIC(12, 2) NOT NULL,
  paid_amount     NUMERIC(12, 2) DEFAULT 0,
  balance         NUMERIC(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  due_date        DATE,
  status          invoice_status DEFAULT 'unpaid',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receivable_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receivable_id   UUID NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL,
  payment_method  payment_method NOT NULL,
  reference_no    TEXT,
  paid_at         TIMESTAMPTZ DEFAULT NOW(),
  received_by     UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 15: NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branches(id),
  notification_type notification_type NOT NULL,
  title             TEXT NOT NULL,
  message           TEXT,
  reference_type    TEXT,
  reference_id      UUID,
  is_read           BOOLEAN DEFAULT FALSE,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 16: AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id),
  branch_id     UUID REFERENCES branches(id),
  module        TEXT NOT NULL,      -- e.g. 'inventory', 'sales', 'users'
  action        TEXT NOT NULL,      -- e.g. 'create', 'update', 'delete', 'void'
  reference_type TEXT,
  reference_id  UUID,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODULE 17: SETTINGS
-- ============================================================

CREATE TABLE settings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id             UUID REFERENCES branches(id), -- NULL = global
  key                   TEXT NOT NULL,
  value                 TEXT,
  updated_by            UUID REFERENCES users(id),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, key)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Products
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_brand_id ON products(brand_id);
CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_status ON products(status);

-- Inventory
CREATE INDEX idx_inventory_stocks_product_branch ON inventory_stocks(product_id, branch_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_branch ON stock_movements(branch_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);

-- Sales
CREATE INDEX idx_sales_branch_id ON sales(branch_id);
CREATE INDEX idx_sales_cashier_id ON sales(cashier_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);

-- Purchase Orders
CREATE INDEX idx_po_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_po_branch_id ON purchase_orders(branch_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_created_at ON purchase_orders(created_at);

-- Customers & Suppliers
CREATE INDEX idx_customers_type ON customers(customer_type);
CREATE INDEX idx_customers_branch_id ON customers(branch_id);
CREATE INDEX idx_suppliers_type ON suppliers(supplier_type);

-- Receivables & Payables
CREATE INDEX idx_receivables_customer_id ON receivables(customer_id);
CREATE INDEX idx_receivables_status ON receivables(status);
CREATE INDEX idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);

-- Notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_module ON audit_logs(module);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Shifts
CREATE INDEX idx_cash_shifts_cashier_id ON cash_shifts(cashier_id);
CREATE INDEX idx_cash_shifts_branch_id ON cash_shifts(branch_id);
CREATE INDEX idx_cash_shifts_status ON cash_shifts(status);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Enable for all tables
-- ============================================================

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES (Branch-based access)
-- NOTE: Adjust these based on your auth strategy.
-- These assume you store branch_id on the user JWT custom claim
-- or look it up from the users table via auth.uid().
-- ============================================================

-- Example: Users can only see their own notifications
CREATE POLICY "users_own_notifications"
  ON notifications FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Example: Sales visible to users of same branch (super_admin sees all)
CREATE POLICY "branch_sales_access"
  ON sales FOR SELECT
  USING (
    branch_id = (SELECT branch_id FROM users WHERE auth_id = auth.uid())
    OR
    (SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.auth_id = auth.uid()) = 'super_admin'
  );

-- ============================================================
-- AUTH HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_auth_user_email(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  resolved_email TEXT;
BEGIN
  SELECT u.email
    INTO resolved_email
  FROM auth.users u
  WHERE lower(u.email) = lower(identifier)
     OR lower(COALESCE(u.raw_user_meta_data->>'username', '')) = lower(identifier)
     OR lower(COALESCE(u.raw_user_meta_data->>'user_name', '')) = lower(identifier)
     OR lower(COALESCE(u.raw_user_meta_data->>'handle', '')) = lower(identifier)
     OR lower(COALESCE(u.raw_user_meta_data->>'display_name', '')) = lower(identifier)
  ORDER BY u.created_at DESC
  LIMIT 1;

  RETURN resolved_email;
END;
$$;

CREATE OR REPLACE FUNCTION sync_authenticated_user_profile()
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  resolved_user users%ROWTYPE;
  resolved_role_id UUID;
  metadata_username TEXT;
  metadata_full_name TEXT;
  metadata_first_name TEXT;
  metadata_last_name TEXT;
  metadata_role TEXT;
  resolved_first_name TEXT;
  resolved_last_name TEXT;
  resolved_username TEXT;
BEGIN
  SELECT * INTO auth_user
  FROM auth.users
  WHERE id = auth.uid();

  IF auth_user.id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user found';
  END IF;

  metadata_username := NULLIF(COALESCE(
    auth_user.raw_user_meta_data->>'username',
    auth_user.raw_user_meta_data->>'user_name',
    auth_user.raw_user_meta_data->>'handle',
    auth_user.raw_user_meta_data->>'display_name'
  ), '');

  metadata_full_name := NULLIF(COALESCE(
    auth_user.raw_user_meta_data->>'full_name',
    auth_user.raw_user_meta_data->>'name',
    auth_user.raw_user_meta_data->>'display_name'
  ), '');

  metadata_first_name := NULLIF(COALESCE(
    auth_user.raw_user_meta_data->>'first_name',
    split_part(COALESCE(metadata_full_name, metadata_username, split_part(auth_user.email, '@', 1)), ' ', 1)
  ), '');

  metadata_last_name := NULLIF(COALESCE(
    auth_user.raw_user_meta_data->>'last_name',
    CASE
      WHEN position(' ' in COALESCE(metadata_full_name, '')) > 0 THEN trim(substring(metadata_full_name from position(' ' in metadata_full_name) + 1))
      ELSE NULL
    END,
    'User'
  ), '');

  metadata_role := NULLIF(COALESCE(
    auth_user.raw_user_meta_data->>'role',
    auth_user.raw_user_meta_data->>'role_name',
    auth_user.raw_user_meta_data->>'user_role',
    auth_user.raw_app_meta_data->>'role',
    auth_user.raw_app_meta_data->>'role_name',
    auth_user.raw_app_meta_data->>'user_role'
  ), '');

  resolved_username := NULLIF(COALESCE(metadata_username, split_part(auth_user.email, '@', 1)), '');
  resolved_first_name := COALESCE(metadata_first_name, resolved_username, 'User');
  resolved_last_name := COALESCE(metadata_last_name, 'User');

  IF metadata_role IS NOT NULL THEN
    SELECT id INTO resolved_role_id
    FROM roles
    WHERE lower(name) = lower(metadata_role)
    LIMIT 1;
  END IF;

  INSERT INTO users (
    auth_id,
    first_name,
    last_name,
    username,
    email,
    role_id,
    branch_id,
    is_active,
    allow_login
  )
  VALUES (
    auth_user.id,
    resolved_first_name,
    resolved_last_name,
    resolved_username,
    auth_user.email,
    resolved_role_id,
    NULL,
    TRUE,
    TRUE
  )
  ON CONFLICT (auth_id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        role_id = COALESCE(EXCLUDED.role_id, users.role_id),
        updated_at = NOW()
  RETURNING * INTO resolved_user;

  RETURN resolved_user;
END;
$$;

CREATE OR REPLACE FUNCTION sync_auth_user_profile_by_id(
  p_auth_user_id UUID,
  p_email TEXT DEFAULT NULL,
  p_user_metadata JSONB DEFAULT '{}'::JSONB,
  p_app_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  resolved_user users%ROWTYPE;
  resolved_role_id UUID;
  metadata_username TEXT;
  metadata_full_name TEXT;
  metadata_first_name TEXT;
  metadata_last_name TEXT;
  metadata_role TEXT;
  resolved_first_name TEXT;
  resolved_last_name TEXT;
  resolved_username TEXT;
  resolved_email TEXT;
BEGIN
  SELECT * INTO auth_user
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF auth_user.id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for supplied id';
  END IF;

  resolved_email := COALESCE(NULLIF(p_email, ''), auth_user.email);

  metadata_username := NULLIF(COALESCE(
    p_user_metadata->>'username',
    p_user_metadata->>'user_name',
    p_user_metadata->>'handle',
    p_user_metadata->>'display_name',
    auth_user.raw_user_meta_data->>'username',
    auth_user.raw_user_meta_data->>'user_name',
    auth_user.raw_user_meta_data->>'handle',
    auth_user.raw_user_meta_data->>'display_name'
  ), '');

  metadata_full_name := NULLIF(COALESCE(
    p_user_metadata->>'full_name',
    p_user_metadata->>'name',
    p_user_metadata->>'display_name',
    auth_user.raw_user_meta_data->>'full_name',
    auth_user.raw_user_meta_data->>'name',
    auth_user.raw_user_meta_data->>'display_name'
  ), '');

  metadata_first_name := NULLIF(COALESCE(
    p_user_metadata->>'first_name',
    auth_user.raw_user_meta_data->>'first_name',
    split_part(COALESCE(metadata_full_name, metadata_username, split_part(resolved_email, '@', 1)), ' ', 1)
  ), '');

  metadata_last_name := NULLIF(COALESCE(
    p_user_metadata->>'last_name',
    auth_user.raw_user_meta_data->>'last_name',
    CASE
      WHEN position(' ' in COALESCE(metadata_full_name, '')) > 0 THEN trim(substring(metadata_full_name from position(' ' in metadata_full_name) + 1))
      ELSE NULL
    END,
    'User'
  ), '');

  metadata_role := NULLIF(COALESCE(
    p_user_metadata->>'role',
    p_user_metadata->>'role_name',
    p_user_metadata->>'user_role',
    p_app_metadata->>'role',
    p_app_metadata->>'role_name',
    p_app_metadata->>'user_role',
    auth_user.raw_user_meta_data->>'role',
    auth_user.raw_user_meta_data->>'role_name',
    auth_user.raw_user_meta_data->>'user_role',
    auth_user.raw_app_meta_data->>'role',
    auth_user.raw_app_meta_data->>'role_name',
    auth_user.raw_app_meta_data->>'user_role'
  ), '');

  resolved_username := NULLIF(COALESCE(metadata_username, split_part(resolved_email, '@', 1)), '');
  resolved_first_name := COALESCE(metadata_first_name, resolved_username, 'User');
  resolved_last_name := COALESCE(metadata_last_name, 'User');

  IF metadata_role IS NOT NULL THEN
    SELECT id INTO resolved_role_id
    FROM roles
    WHERE lower(name) = lower(metadata_role)
    LIMIT 1;
  END IF;

  INSERT INTO users (
    auth_id,
    first_name,
    last_name,
    username,
    email,
    role_id,
    branch_id,
    is_active,
    allow_login
  )
  VALUES (
    auth_user.id,
    resolved_first_name,
    resolved_last_name,
    resolved_username,
    resolved_email,
    resolved_role_id,
    NULL,
    TRUE,
    TRUE
  )
  ON CONFLICT (auth_id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        role_id = COALESCE(EXCLUDED.role_id, users.role_id),
        updated_at = NOW()
  RETURNING * INTO resolved_user;

  RETURN resolved_user;
END;
$$;

grant execute on function public.resolve_auth_user_email(text) to anon, authenticated;
grant execute on function public.sync_authenticated_user_profile() to anon, authenticated;
grant execute on function public.sync_auth_user_profile_by_id(uuid, text, jsonb, jsonb) to anon, authenticated;
-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Low stock products per branch
CREATE OR REPLACE VIEW v_low_stock AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.sku,
  p.barcode,
  c.name AS category,
  b.name AS brand,
  s.branch_id,
  br.name AS branch_name,
  s.quantity AS current_stock,
  p.reorder_level,
  p.critical_stock_level,
  CASE
    WHEN s.quantity = 0 THEN 'out_of_stock'
    WHEN s.quantity <= p.critical_stock_level THEN 'critical'
    WHEN s.quantity <= p.reorder_level THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status
FROM inventory_stocks s
JOIN products p ON s.product_id = p.id
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN brands b ON p.brand_id = b.id
JOIN branches br ON s.branch_id = br.id
WHERE p.status = 'active';

-- Daily sales summary
CREATE OR REPLACE VIEW v_daily_sales_summary AS
SELECT
  DATE(s.created_at) AS sale_date,
  s.branch_id,
  br.name AS branch_name,
  COUNT(s.id) AS total_transactions,
  SUM(s.total_amount) AS gross_sales,
  SUM(s.discount_amount) AS total_discounts,
  SUM(s.tax_amount) AS total_tax,
  SUM(s.total_amount - s.discount_amount) AS net_sales
FROM sales s
JOIN branches br ON s.branch_id = br.id
WHERE s.status = 'completed'
GROUP BY DATE(s.created_at), s.branch_id, br.name;

-- Customer balance summary
CREATE OR REPLACE VIEW v_customer_balances AS
SELECT
  c.id,
  c.code,
  c.name,
  c.customer_type,
  c.credit_limit,
  COALESCE(SUM(r.balance), 0) AS outstanding_balance,
  c.credit_limit - COALESCE(SUM(r.balance), 0) AS available_credit
FROM customers c
LEFT JOIN receivables r ON c.id = r.customer_id AND r.status != 'paid'
GROUP BY c.id, c.code, c.name, c.customer_type, c.credit_limit;

-- Supplier payable summary
CREATE OR REPLACE VIEW v_supplier_payables AS
SELECT
  s.id,
  s.code,
  s.name,
  s.supplier_type,
  COALESCE(SUM(po.total_amount - po.paid_amount), 0) AS total_payable
FROM suppliers s
LEFT JOIN purchase_orders po ON s.id = po.supplier_id
  AND po.status NOT IN ('draft', 'cancelled')
  AND po.paid_amount < po.total_amount
GROUP BY s.id, s.code, s.name, s.supplier_type;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.po_number = 'PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(NEXTVAL('po_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;
CREATE TRIGGER trg_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW WHEN (NEW.po_number IS NULL)
  EXECUTE FUNCTION generate_po_number();

-- Auto-generate invoice number for sales
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number = 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(NEXTVAL('invoice_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;
CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON sales
  FOR EACH ROW WHEN (NEW.invoice_number IS NULL)
  EXECUTE FUNCTION generate_invoice_number();

-- Auto-generate return number
CREATE OR REPLACE FUNCTION generate_return_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.return_number = 'RET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(NEXTVAL('return_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1;
CREATE TRIGGER trg_return_number
  BEFORE INSERT ON returns
  FOR EACH ROW WHEN (NEW.return_number IS NULL)
  EXECUTE FUNCTION generate_return_number();

-- ============================================================
-- SEED DATA: Default Roles & Permissions
-- ============================================================

INSERT INTO roles (name, description, is_system) VALUES
  ('Super Admin', 'Full system access', TRUE),
  ('Admin', 'Manage daily operations, receivables, payables, staff, and reports', TRUE),
  ('Cashier', 'POS checkout only', TRUE),
  ('Inventory Staff', 'Stock management', TRUE),
  ('Accountant', 'Financial reports, expenses, receivables, payables, and cash drawer reports', TRUE),
  ('Branch Staff', 'Limited to assigned branch', TRUE);

INSERT INTO expense_categories (name, description) VALUES
  ('Utilities', 'Electricity, water, internet'),
  ('Rent', 'Shop rent'),
  ('Salaries', 'Staff salaries'),
  ('Delivery', 'Delivery and freight'),
  ('Supplies', 'Office and shop supplies'),
  ('Maintenance', 'Equipment and shop maintenance'),
  ('Marketing', 'Advertising and promotions'),
  ('Others', 'Miscellaneous expenses');

-- ============================================================
-- END OF WAP POS SCHEMA
-- ============================================================

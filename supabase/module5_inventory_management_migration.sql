-- Module 5: Product & Inventory Management enhancements
-- Apply after the base schema if your Supabase project is already provisioned.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_count_status') THEN
    CREATE TYPE stock_count_status AS ENUM ('draft', 'posted', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'serial_tracking_status') THEN
    CREATE TYPE serial_tracking_status AS ENUM ('available', 'sold', 'returned', 'damaged', 'transferred');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  variant_value TEXT NOT NULL,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  additional_cost NUMERIC(12, 2) DEFAULT 0,
  additional_price NUMERIC(12, 2) DEFAULT 0,
  additional_wholesale_price NUMERIC(12, 2) DEFAULT 0,
  minimum_price NUMERIC(12, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, variant_name, variant_value)
);

CREATE TABLE IF NOT EXISTS product_variant_stocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (variant_id, branch_id)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  quantity_received INT NOT NULL DEFAULT 0,
  quantity_on_hand INT NOT NULL DEFAULT 0,
  cost_price NUMERIC(12, 2),
  expiry_date DATE,
  supplier_id UUID REFERENCES suppliers(id),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, branch_id, batch_number)
);

CREATE TABLE IF NOT EXISTS inventory_serial_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL UNIQUE,
  status serial_tracking_status DEFAULT 'available',
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  status stock_count_status DEFAULT 'draft',
  notes TEXT,
  counted_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  system_quantity INT NOT NULL,
  counted_quantity INT NOT NULL,
  variance INT GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_stocks_variant_branch ON product_variant_stocks(variant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_branch ON inventory_batches(product_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry_date ON inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_serial_numbers_product_branch ON inventory_serial_numbers(product_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_branch_id ON stock_counts(branch_id);

ALTER TABLE IF EXISTS product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_variant_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_serial_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_counts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW v_inventory_valuation AS
SELECT
  s.branch_id,
  br.name AS branch_name,
  p.id AS product_id,
  p.name AS product_name,
  p.sku,
  s.quantity,
  p.cost_price,
  p.selling_price,
  (s.quantity * p.cost_price) AS total_cost_value,
  (s.quantity * p.selling_price) AS total_retail_value
FROM inventory_stocks s
JOIN products p ON s.product_id = p.id
JOIN branches br ON s.branch_id = br.id;

CREATE OR REPLACE VIEW v_expiring_inventory_batches AS
SELECT
  b.id,
  b.product_id,
  p.name AS product_name,
  p.sku,
  b.branch_id,
  br.name AS branch_name,
  b.batch_number,
  b.quantity_received,
  b.quantity_on_hand,
  b.expiry_date,
  b.created_at
FROM inventory_batches b
JOIN products p ON b.product_id = p.id
JOIN branches br ON b.branch_id = br.id
WHERE b.expiry_date IS NOT NULL
  AND b.quantity_on_hand > 0;

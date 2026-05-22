-- Module 4: Barcode Scanning & Printing
-- Safe incremental migration for existing Supabase projects.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'barcode_source_type'
  ) THEN
    CREATE TYPE barcode_source_type AS ENUM ('primary', 'sku', 'supplier', 'alias', 'qr');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS product_barcodes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_value    TEXT NOT NULL,
  normalized_value TEXT NOT NULL UNIQUE,
  barcode_type     barcode_type DEFAULT 'barcode',
  source_type      barcode_source_type DEFAULT 'alias',
  is_primary       BOOLEAN DEFAULT FALSE,
  supplier_name    TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE barcode_labels
  ADD COLUMN IF NOT EXISTS width_mm NUMERIC(8, 2) DEFAULT 58,
  ADD COLUMN IF NOT EXISTS height_mm NUMERIC(8, 2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS print_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS include_product_name BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_shelf_location BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON product_barcodes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_normalized_value ON product_barcodes(normalized_value);
CREATE INDEX IF NOT EXISTS idx_barcode_labels_product_id ON barcode_labels(product_id);

ALTER TABLE product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcode_labels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_product_barcodes_updated_at'
  ) THEN
    CREATE TRIGGER trg_product_barcodes_updated_at
      BEFORE UPDATE ON product_barcodes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

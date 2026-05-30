-- ============================================================
-- MODULE 19: SETTINGS & CONFIGURATION
-- ============================================================
-- Centralizes settings defaults for shop profile, receipts,
-- tax, currency, payment methods, discounts, barcode/printer
-- preferences, and adds persistent backup/import-export logs.

BEGIN;

INSERT INTO public.permissions (module, action, description)
VALUES
  ('settings', 'view', 'View system settings and configuration'),
  ('settings', 'edit', 'Edit system settings and configuration'),
  ('settings', 'manage', 'Manage settings, backups, and data exchange')
ON CONFLICT (module, action) DO UPDATE
SET description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.system_backup_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  backup_scope TEXT NOT NULL DEFAULT 'full_system',
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  notes TEXT,
  triggered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_backup_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  CONSTRAINT system_backup_runs_scope_check CHECK (backup_scope IN ('full_system', 'branch_only', 'settings_only'))
);

CREATE TABLE IF NOT EXISTS public.data_exchange_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  module_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL DEFAULT 'csv',
  row_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  initiated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT data_exchange_logs_direction_check CHECK (direction IN ('import', 'export')),
  CONSTRAINT data_exchange_logs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_system_backup_runs_created
  ON public.system_backup_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_backup_runs_branch_created
  ON public.system_backup_runs(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_exchange_logs_created
  ON public.data_exchange_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_exchange_logs_direction_module
  ON public.data_exchange_logs(direction, module_name, created_at DESC);

ALTER TABLE public.system_backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_exchange_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_backup_runs_select" ON public.system_backup_runs;
DROP POLICY IF EXISTS "system_backup_runs_insert" ON public.system_backup_runs;
DROP POLICY IF EXISTS "system_backup_runs_update" ON public.system_backup_runs;
DROP POLICY IF EXISTS "system_backup_runs_delete" ON public.system_backup_runs;

CREATE POLICY "system_backup_runs_select" ON public.system_backup_runs
  FOR SELECT
  USING (
    public.has_permission('settings', 'view')
    OR public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
    OR public.has_permission('reports', 'view')
  );

CREATE POLICY "system_backup_runs_insert" ON public.system_backup_runs
  FOR INSERT
  WITH CHECK (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
  );

CREATE POLICY "system_backup_runs_update" ON public.system_backup_runs
  FOR UPDATE
  USING (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
  )
  WITH CHECK (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
  );

CREATE POLICY "system_backup_runs_delete" ON public.system_backup_runs
  FOR DELETE
  USING (
    public.has_permission('settings', 'manage')
  );

DROP POLICY IF EXISTS "data_exchange_logs_select" ON public.data_exchange_logs;
DROP POLICY IF EXISTS "data_exchange_logs_insert" ON public.data_exchange_logs;
DROP POLICY IF EXISTS "data_exchange_logs_update" ON public.data_exchange_logs;
DROP POLICY IF EXISTS "data_exchange_logs_delete" ON public.data_exchange_logs;

CREATE POLICY "data_exchange_logs_select" ON public.data_exchange_logs
  FOR SELECT
  USING (
    public.has_permission('settings', 'view')
    OR public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
    OR public.has_permission('reports', 'view')
    OR public.has_permission('reports', 'export')
  );

CREATE POLICY "data_exchange_logs_insert" ON public.data_exchange_logs
  FOR INSERT
  WITH CHECK (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
    OR public.has_permission('reports', 'export')
  );

CREATE POLICY "data_exchange_logs_update" ON public.data_exchange_logs
  FOR UPDATE
  USING (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
    OR public.has_permission('reports', 'export')
  )
  WITH CHECK (
    public.has_permission('settings', 'edit')
    OR public.has_permission('settings', 'manage')
    OR public.has_permission('reports', 'export')
  );

CREATE POLICY "data_exchange_logs_delete" ON public.data_exchange_logs
  FOR DELETE
  USING (
    public.has_permission('settings', 'manage')
  );

DROP TRIGGER IF EXISTS trg_system_backup_runs_touch_updated_at ON public.system_backup_runs;
DROP TRIGGER IF EXISTS trg_data_exchange_logs_touch_updated_at ON public.data_exchange_logs;

DROP TRIGGER IF EXISTS trg_audit_settings ON public.settings;
CREATE TRIGGER trg_audit_settings
AFTER INSERT OR UPDATE OR DELETE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'settings',
  'setting',
  'branch_id',
  'updated_by',
  'updated_at'
);

DROP TRIGGER IF EXISTS trg_audit_system_backup_runs ON public.system_backup_runs;
CREATE TRIGGER trg_audit_system_backup_runs
AFTER INSERT OR UPDATE OR DELETE ON public.system_backup_runs
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'settings',
  'system_backup_run',
  'branch_id',
  'triggered_by',
  ''
);

DROP TRIGGER IF EXISTS trg_audit_data_exchange_logs ON public.data_exchange_logs;
CREATE TRIGGER trg_audit_data_exchange_logs
AFTER INSERT OR UPDATE OR DELETE ON public.data_exchange_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_row_change(
  'settings',
  'data_exchange_log',
  'branch_id',
  'initiated_by',
  ''
);

INSERT INTO public.settings (branch_id, key, value)
VALUES
  (NULL, 'shop_name', 'WAP Motorparts Trading'),
  (NULL, 'shop_legal_name', 'WAP Motorparts Trading'),
  (NULL, 'shop_address', '45 Industry St., Caloocan City, Metro Manila, Philippines'),
  (NULL, 'shop_phone', '(02) 8674-1234'),
  (NULL, 'shop_email', 'info@wapmotorparts.com'),
  (NULL, 'shop_tax_id', '103-456-789-000'),
  (NULL, 'shop_footer_note', 'Thank you for supporting your local branch.'),
  (NULL, 'receipt_header_text', 'WAP Motorparts Trading'),
  (NULL, 'receipt_footer_text', 'Thank you for your purchase!'),
  (NULL, 'receipt_show_logo', 'true'),
  (NULL, 'receipt_show_cashier', 'true'),
  (NULL, 'receipt_show_qr', 'false'),
  (NULL, 'receipt_paper_size', '80mm'),
  (NULL, 'tax_mode', 'vat_inclusive'),
  (NULL, 'tax_name', 'VAT'),
  (NULL, 'tax_rate_percent', '12'),
  (NULL, 'tax_registration_no', 'VAT-103-456-789-000'),
  (NULL, 'currency_code', 'PHP'),
  (NULL, 'currency_symbol', 'PHP'),
  (NULL, 'currency_locale', 'en-PH'),
  (NULL, 'currency_decimal_places', '2'),
  (NULL, 'payment_methods_enabled', '["Cash","GCash","Credit Card","Debit Card","Bank Transfer"]'),
  (NULL, 'payment_method_default', 'Cash'),
  (NULL, 'payment_reference_required', '["Bank Transfer","Credit Card","Debit Card"]'),
  (NULL, 'discounts_enabled', 'true'),
  (NULL, 'discount_max_percent', '20'),
  (NULL, 'discount_max_amount', '1000'),
  (NULL, 'discount_requires_approval', 'false'),
  (NULL, 'discount_allow_stack', 'false'),
  (NULL, 'barcode_format', 'CODE128'),
  (NULL, 'barcode_label_width_mm', '50'),
  (NULL, 'barcode_label_height_mm', '25'),
  (NULL, 'barcode_include_price', 'true'),
  (NULL, 'barcode_include_sku', 'true'),
  (NULL, 'printer_name', 'Main Counter Thermal'),
  (NULL, 'printer_type', 'Thermal 80mm'),
  (NULL, 'printer_auto_print_receipt', 'false'),
  (NULL, 'printer_copies', '1'),
  (NULL, 'backup_schedule', 'Daily'),
  (NULL, 'backup_time', '02:00 AM'),
  (NULL, 'backup_retention_days', '30'),
  (NULL, 'backup_auto_enabled', 'true'),
  (NULL, 'backup_include_images', 'true'),
  (NULL, 'backup_email_reports', 'false'),
  (NULL, 'data_export_format', 'csv'),
  (NULL, 'data_import_overwrite_existing', 'true'),
  (NULL, 'default_branch_id', '')
ON CONFLICT (branch_id, key) DO NOTHING;

COMMIT;

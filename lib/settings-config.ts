export const SETTINGS_DEFAULTS: Record<string, string> = {
  shop_name: "WAP Motorparts Trading",
  shop_legal_name: "WAP Motorparts Trading",
  shop_address: "45 Industry St., Caloocan City, Metro Manila, Philippines",
  shop_phone: "(02) 8674-1234",
  shop_email: "info@wapmotorparts.com",
  shop_tax_id: "103-456-789-000",
  shop_footer_note: "Thank you for supporting your local branch.",
  receipt_header_text: "WAP Motorparts Trading",
  receipt_footer_text: "Thank you for your purchase!",
  receipt_show_logo: "true",
  receipt_show_cashier: "true",
  receipt_show_qr: "false",
  receipt_paper_size: "80mm",
  tax_mode: "vat_inclusive",
  tax_name: "VAT",
  tax_rate_percent: "12",
  tax_registration_no: "VAT-103-456-789-000",
  currency_code: "PHP",
  currency_symbol: "PHP",
  currency_locale: "en-PH",
  currency_decimal_places: "2",
  payment_methods_enabled: JSON.stringify(["Cash", "GCash", "Credit Card", "Debit Card", "Bank Transfer"]),
  payment_method_default: "Cash",
  payment_reference_required: JSON.stringify(["Bank Transfer", "Credit Card", "Debit Card"]),
  discounts_enabled: "true",
  discount_max_percent: "20",
  discount_max_amount: "1000",
  discount_requires_approval: "false",
  discount_allow_stack: "false",
  barcode_format: "CODE128",
  barcode_label_width_mm: "50",
  barcode_label_height_mm: "25",
  barcode_include_price: "true",
  barcode_include_sku: "true",
  printer_name: "Main Counter Thermal",
  printer_type: "Thermal 80mm",
  printer_auto_print_receipt: "false",
  printer_copies: "1",
  backup_schedule: "Daily",
  backup_time: "02:00 AM",
  backup_retention_days: "30",
  backup_auto_enabled: "true",
  backup_include_images: "true",
  backup_email_reports: "false",
  data_export_format: "csv",
  data_import_overwrite_existing: "true",
  default_branch_id: "",
};

export const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS);

export type SettingsMap = Record<string, string>;

export function mergeSettingsRows(
  rows: Array<{ key?: string | null; value?: string | null }> | null | undefined,
) {
  const settings: SettingsMap = { ...SETTINGS_DEFAULTS };

  for (const row of rows ?? []) {
    if (!row?.key) continue;
    settings[row.key] = row.value ?? "";
  }

  return settings;
}

export function readBooleanSetting(settings: SettingsMap, key: string) {
  return (settings[key] ?? SETTINGS_DEFAULTS[key] ?? "").toLowerCase() !== "false";
}

export function readJsonArraySetting(settings: SettingsMap, key: string) {
  const raw = settings[key] ?? SETTINGS_DEFAULTS[key] ?? "[]";

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export type DataModuleKey =
  | "products"
  | "customers"
  | "suppliers"
  | "branches"
  | "sales"
  | "inventory"
  | "users";

export const DATA_MODULE_LABELS: Record<DataModuleKey, string> = {
  products: "Products",
  customers: "Customers",
  suppliers: "Suppliers",
  branches: "Branches",
  sales: "Sales",
  inventory: "Inventory",
  users: "Users",
};

export type BarcodeKind = "barcode" | "qr_code";
export type BarcodeSourceType = "primary" | "sku" | "supplier" | "alias" | "qr";

export type BarcodeMappingRecord = {
  id: string;
  productId: string;
  barcodeValue: string;
  normalizedValue: string;
  barcodeType: BarcodeKind;
  sourceType: BarcodeSourceType;
  isPrimary: boolean;
  supplierName: string;
  notes: string;
  managedBy: "system" | "user";
};

export type BarcodeLabelConfig = {
  widthMm: number;
  heightMm: number;
  quantity: number;
  includeProductName: boolean;
  includeSku: boolean;
  includePrice: boolean;
  includeBrand: boolean;
  includeShelfLocation: boolean;
  barcodeType: BarcodeKind;
  barcodeFormat: "CODE128" | "CODE39" | "EAN13" | "UPC";
};

export type BarcodeLabelProduct = {
  productId: string;
  name: string;
  sku: string;
  barcodeValue: string;
  barcodeType: BarcodeKind;
  brandName: string;
  shelfLocation: string;
  sellingPrice: number;
};

export const barcodeSourceOptions: Array<{ value: BarcodeSourceType; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "sku", label: "SKU" },
  { value: "supplier", label: "Supplier" },
  { value: "alias", label: "Alias" },
  { value: "qr", label: "QR" },
];

export const barcodeTypeOptions: Array<{ value: BarcodeKind; label: string }> = [
  { value: "barcode", label: "Barcode" },
  { value: "qr_code", label: "QR Code" },
];

export const barcodeFormatOptions: Array<BarcodeLabelConfig["barcodeFormat"]> = [
  "CODE128",
  "CODE39",
  "EAN13",
  "UPC",
];

export const barcodeLabelPresets = [
  { id: "58x30", label: "58 x 30 mm", widthMm: 58, heightMm: 30 },
  { id: "50x25", label: "50 x 25 mm", widthMm: 50, heightMm: 25 },
  { id: "70x35", label: "70 x 35 mm", widthMm: 70, heightMm: 35 },
  { id: "100x50", label: "100 x 50 mm", widthMm: 100, heightMm: 50 },
];

export const defaultBarcodeLabelConfig: BarcodeLabelConfig = {
  widthMm: 58,
  heightMm: 30,
  quantity: 1,
  includeProductName: true,
  includeSku: true,
  includePrice: true,
  includeBrand: true,
  includeShelfLocation: true,
  barcodeType: "barcode",
  barcodeFormat: "CODE128",
};

export function normalizeBarcodeValue(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function sanitizeBarcodeValue(value: string) {
  return value.trim().replace(/\s+/g, " ").trim();
}

export function buildSuggestedBarcodeValue(input: {
  sku?: string;
  partNumber?: string;
  supplierCode?: string;
  productId?: string;
}) {
  const base = input.sku || input.partNumber || input.supplierCode || input.productId || `${Date.now()}`;
  const normalized = normalizeBarcodeValue(base).replace(/[^A-Z0-9\-_.]/g, "");
  return normalized.startsWith("WAP-") ? normalized : `WAP-${normalized || "ITEM"}`;
}

export function formatBarcodeSource(sourceType: BarcodeSourceType) {
  switch (sourceType) {
    case "primary":
      return "Primary";
    case "sku":
      return "SKU";
    case "supplier":
      return "Supplier";
    case "alias":
      return "Alias";
    case "qr":
      return "QR";
    default:
      return "Barcode";
  }
}

export function formatBarcodeType(type: BarcodeKind) {
  return type === "qr_code" ? "QR Code" : "Barcode";
}

export function coerceBarcodeFormat(
  requested: BarcodeLabelConfig["barcodeFormat"],
  value: string
): BarcodeLabelConfig["barcodeFormat"] {
  const normalized = normalizeBarcodeValue(value);
  if (requested === "EAN13" && /^\d{13}$/.test(normalized)) return requested;
  if (requested === "UPC" && /^\d{12}$/.test(normalized)) return requested;
  if (requested === "CODE39" && /^[0-9A-Z\-.$/+% ]+$/.test(normalized)) return requested;
  return "CODE128";
}

export function formatLabelSize(widthMm: number, heightMm: number) {
  return `${widthMm} x ${heightMm} mm`;
}

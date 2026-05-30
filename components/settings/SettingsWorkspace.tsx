"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArchiveRestore,
  Building2,
  CheckCircle2,
  Coins,
  Download,
  LoaderCircle,
  Receipt,
  Settings2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CfgInput, CfgSaveBar, CfgSelect, CfgToggle } from "@/components/settings/CfgShared";
import BranchSection from "@/components/settings/BranchSection";
import {
  DATA_MODULE_LABELS,
  type DataModuleKey,
  SETTINGS_DEFAULTS,
  type SettingsMap,
  readBooleanSetting,
  readJsonArraySetting,
} from "@/lib/settings-config";

type BranchSummary = {
  id: string;
  name: string;
  code: string;
  timezone?: string | null;
  pricing_mode?: string | null;
  is_active?: boolean | null;
};

type BackupRun = {
  id: string;
  status: string;
  backup_scope: string;
  file_name: string;
  file_size_bytes?: number | null;
  created_at: string;
};

type ExchangeLog = {
  id: string;
  direction: string;
  module_name: string;
  file_name: string;
  row_count: number;
  status: string;
  created_at: string;
};

type WorkspacePayload = {
  settings: SettingsMap;
  branches: BranchSummary[];
  backupRuns: BackupRun[];
  exchangeLogs: ExchangeLog[];
  actor: {
    canEdit: boolean;
    canManageBranches: boolean;
  };
};

type ToastState = { ok: boolean; msg: string } | null;

const PAYMENT_OPTIONS = ["Cash", "GCash", "Credit Card", "Debit Card", "Bank Transfer", "Cheque"];
const IMPORT_MODULES: Array<Extract<DataModuleKey, "products" | "customers" | "suppliers" | "branches">> = [
  "products",
  "customers",
  "suppliers",
  "branches",
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBytes(value?: number | null) {
  if (!value) return "n/a";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SettingsWorkspace() {
  const [settings, setSettings] = useState<SettingsMap>({ ...SETTINGS_DEFAULTS });
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [backupRuns, setBackupRuns] = useState<BackupRun[]>([]);
  const [exchangeLogs, setExchangeLogs] = useState<ExchangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [exportModule, setExportModule] = useState<DataModuleKey>("products");
  const [importModule, setImportModule] = useState<Extract<DataModuleKey, "products" | "customers" | "suppliers" | "branches">>("products");
  const [importFile, setImportFile] = useState<File | null>(null);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  function setSetting(key: string, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedFetch("/api/settings", { method: "GET" });
      const payload = (await response.json()) as WorkspacePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load settings.");
      }

      setSettings(payload.settings ?? { ...SETTINGS_DEFAULTS });
      setBranches(payload.branches ?? []);
      setBackupRuns(payload.backupRuns ?? []);
      setExchangeLogs(payload.exchangeLogs ?? []);
      setCanEdit(Boolean(payload.actor?.canEdit));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load settings.";
      showToast(false, message);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function saveEntries(saveId: string, entries: Record<string, unknown>) {
    setSavingKey(saveId);
    try {
      const response = await authorizedFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "save_settings", entries }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }
      showToast(true, payload.message ?? "Settings saved.");
      await loadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save settings.";
      showToast(false, message);
    } finally {
      setSavingKey(null);
    }
  }

  async function restoreDefaults() {
    setSavingKey("defaults");
    try {
      const response = await authorizedFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "reset_defaults" }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to restore defaults.");
      }
      showToast(true, payload.message ?? "Defaults restored.");
      await loadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore defaults.";
      showToast(false, message);
    } finally {
      setSavingKey(null);
    }
  }

  async function runBackup() {
    setSavingKey("backup-run");
    try {
      const response = await authorizedFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "run_backup" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        backup?: { fileName: string; content: string };
      };
      if (!response.ok || !payload.backup) {
        throw new Error(payload.error ?? "Unable to run backup.");
      }

      const blob = new Blob([payload.backup.content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.backup.fileName;
      link.click();
      URL.revokeObjectURL(url);

      showToast(true, "Backup generated and downloaded.");
      await loadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run backup.";
      showToast(false, message);
    } finally {
      setSavingKey(null);
    }
  }

  async function exportData() {
    setSavingKey("export");
    try {
      const response = await authorizedFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "export_data", module: exportModule }),
      });
      const payload = (await response.json()) as {
        error?: string;
        fileName?: string;
        rows?: Array<Record<string, unknown>>;
      };
      if (!response.ok || !payload.rows || !payload.fileName) {
        throw new Error(payload.error ?? "Unable to export data.");
      }

      const sheet = XLSX.utils.json_to_sheet(payload.rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, DATA_MODULE_LABELS[exportModule]);
      XLSX.writeFile(workbook, payload.fileName);

      showToast(true, `${DATA_MODULE_LABELS[exportModule]} exported successfully.`);
      await loadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export data.";
      showToast(false, message);
    } finally {
      setSavingKey(null);
    }
  }

  async function importData() {
    if (!importFile) {
      showToast(false, "Please select a file first.");
      return;
    }

    setSavingKey("import");
    try {
      const buffer = await importFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const response = await authorizedFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "import_data", module: importModule, rows }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to import data.");
      }

      setImportFile(null);
      showToast(true, payload.message ?? "Import completed.");
      await loadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import data.";
      showToast(false, message);
    } finally {
      setSavingKey(null);
    }
  }

  function toggleJsonList(key: string, value: string) {
    const current = new Set(readJsonArraySetting(settings, key));
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setSetting(key, JSON.stringify(Array.from(current)));
  }

  const enabledPayments = readJsonArraySetting(settings, "payment_methods_enabled");
  const referenceRequired = readJsonArraySetting(settings, "payment_reference_required");

  if (loading) {
    return (
      <div className="settings19-page">
        <div className="settings19-loading">
          <LoaderCircle size={18} className="settings19-spin" />
          <span>Loading settings workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="settings19-page">
      <section className="settings19-hero">
        <div>
          <p className="settings19-eyebrow">Module 19</p>
          <h1>Settings & Configuration</h1>
          <p>
            Configure shop identity, receipts, tax, currency, payment methods, discounts,
            barcode/printer behavior, branch defaults, backups, and controlled data exchange.
          </p>
        </div>
        <div className="settings19-hero__actions">
          <button
            type="button"
            className="settings19-btn settings19-btn--ghost"
            onClick={() => void loadWorkspace()}
          >
            <Settings2 size={15} />
            Refresh
          </button>
          {canEdit ? (
            <button
              type="button"
              className="settings19-btn settings19-btn--danger"
              onClick={() => void restoreDefaults()}
              disabled={savingKey === "defaults"}
            >
              {savingKey === "defaults" ? <LoaderCircle size={15} className="settings19-spin" /> : <ArchiveRestore size={15} />}
              Restore Defaults
            </button>
          ) : null}
        </div>
      </section>

      <section className="settings19-stats">
        <article className="settings19-stat">
          <Building2 size={18} />
          <div>
            <span>Active Branches</span>
            <strong>{branches.filter((branch) => branch.is_active !== false).length}</strong>
          </div>
        </article>
        <article className="settings19-stat">
          <ShieldCheck size={18} />
          <div>
            <span>Backup Runs</span>
            <strong>{backupRuns.length}</strong>
          </div>
        </article>
        <article className="settings19-stat">
          <Download size={18} />
          <div>
            <span>Import / Export Logs</span>
            <strong>{exchangeLogs.length}</strong>
          </div>
        </article>
      </section>

      <section className="settings19-grid">
        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><Building2 size={16} /></div>
            <div>
              <h2>Shop Profile</h2>
              <p>Business identity and receipt footer details.</p>
            </div>
          </div>
          <div className="cfg-2col">
            <div className="cfg-fields">
              <CfgInput label="Shop Name" value={settings.shop_name ?? ""} onChange={(v) => setSetting("shop_name", v)} disabled={!canEdit} />
              <CfgInput label="Legal / Registered Name" value={settings.shop_legal_name ?? ""} onChange={(v) => setSetting("shop_legal_name", v)} disabled={!canEdit} />
              <CfgInput label="Phone" value={settings.shop_phone ?? ""} onChange={(v) => setSetting("shop_phone", v)} disabled={!canEdit} />
              <CfgInput label="Email" value={settings.shop_email ?? ""} onChange={(v) => setSetting("shop_email", v)} disabled={!canEdit} />
              <CfgInput label="Tax ID / TIN" value={settings.shop_tax_id ?? ""} onChange={(v) => setSetting("shop_tax_id", v)} disabled={!canEdit} />
            </div>
            <div className="cfg-fields">
              <CfgInput label="Business Address" value={settings.shop_address ?? ""} onChange={(v) => setSetting("shop_address", v)} disabled={!canEdit} />
              <CfgInput label="Footer Note" value={settings.shop_footer_note ?? ""} onChange={(v) => setSetting("shop_footer_note", v)} disabled={!canEdit} />
            </div>
          </div>
          {canEdit ? (
            <CfgSaveBar
              onSave={() =>
                void saveEntries("shop", {
                  shop_name: settings.shop_name,
                  shop_legal_name: settings.shop_legal_name,
                  shop_phone: settings.shop_phone,
                  shop_email: settings.shop_email,
                  shop_tax_id: settings.shop_tax_id,
                  shop_address: settings.shop_address,
                  shop_footer_note: settings.shop_footer_note,
                })
              }
              saving={savingKey === "shop"}
            />
          ) : null}
        </article>

        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><Receipt size={16} /></div>
            <div>
              <h2>Receipt & Tax</h2>
              <p>Thermal layout, tax label, and VAT behavior.</p>
            </div>
          </div>
          <div className="cfg-2col">
            <div className="cfg-fields">
              <CfgInput label="Receipt Header" value={settings.receipt_header_text ?? ""} onChange={(v) => setSetting("receipt_header_text", v)} disabled={!canEdit} />
              <CfgInput label="Receipt Footer" value={settings.receipt_footer_text ?? ""} onChange={(v) => setSetting("receipt_footer_text", v)} disabled={!canEdit} />
              <CfgSelect label="Paper Size" value={settings.receipt_paper_size ?? "80mm"} onChange={(v) => setSetting("receipt_paper_size", v)} disabled={!canEdit} options={["58mm", "80mm", "A4", "PDF"]} />
              <CfgSelect label="Tax Mode" value={settings.tax_mode ?? "vat_inclusive"} onChange={(v) => setSetting("tax_mode", v)} disabled={!canEdit} options={["vat_inclusive", "vat_exclusive", "no_tax"]} />
              <CfgInput label="Tax Label" value={settings.tax_name ?? ""} onChange={(v) => setSetting("tax_name", v)} disabled={!canEdit} />
              <CfgInput label="Tax Rate (%)" value={settings.tax_rate_percent ?? ""} onChange={(v) => setSetting("tax_rate_percent", v)} type="number" disabled={!canEdit} />
              <CfgInput label="Registration Number" value={settings.tax_registration_no ?? ""} onChange={(v) => setSetting("tax_registration_no", v)} disabled={!canEdit} />
            </div>
            <div className="cfg-toggles">
              <CfgToggle label="Show Logo" sub="Include store branding on receipts" value={readBooleanSetting(settings, "receipt_show_logo")} onChange={(v) => setSetting("receipt_show_logo", String(v))} disabled={!canEdit} />
              <CfgToggle label="Show Cashier Name" sub="Print the cashier on completed receipts" value={readBooleanSetting(settings, "receipt_show_cashier")} onChange={(v) => setSetting("receipt_show_cashier", String(v))} disabled={!canEdit} />
              <CfgToggle label="Show QR Reference" sub="Print QR / reference block for digital payments" value={readBooleanSetting(settings, "receipt_show_qr")} onChange={(v) => setSetting("receipt_show_qr", String(v))} disabled={!canEdit} />
            </div>
          </div>
          {canEdit ? (
            <CfgSaveBar
              onSave={() =>
                void saveEntries("receipt", {
                  receipt_header_text: settings.receipt_header_text,
                  receipt_footer_text: settings.receipt_footer_text,
                  receipt_paper_size: settings.receipt_paper_size,
                  receipt_show_logo: settings.receipt_show_logo,
                  receipt_show_cashier: settings.receipt_show_cashier,
                  receipt_show_qr: settings.receipt_show_qr,
                  tax_mode: settings.tax_mode,
                  tax_name: settings.tax_name,
                  tax_rate_percent: settings.tax_rate_percent,
                  tax_registration_no: settings.tax_registration_no,
                })
              }
              saving={savingKey === "receipt"}
            />
          ) : null}
        </article>

        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><Coins size={16} /></div>
            <div>
              <h2>Currency & Payments</h2>
              <p>Display currency and accepted payment rails.</p>
            </div>
          </div>
          <div className="cfg-2col">
            <div className="cfg-fields">
              <CfgSelect label="Currency Code" value={settings.currency_code ?? "PHP"} onChange={(v) => setSetting("currency_code", v)} disabled={!canEdit} options={["PHP", "USD", "EUR", "SGD"]} />
              <CfgInput label="Currency Symbol" value={settings.currency_symbol ?? ""} onChange={(v) => setSetting("currency_symbol", v)} disabled={!canEdit} />
              <CfgSelect label="Locale" value={settings.currency_locale ?? "en-PH"} onChange={(v) => setSetting("currency_locale", v)} disabled={!canEdit} options={["en-PH", "en-US", "en-SG", "en-GB"]} />
              <CfgSelect label="Decimal Places" value={settings.currency_decimal_places ?? "2"} onChange={(v) => setSetting("currency_decimal_places", v)} disabled={!canEdit} options={["0", "2", "3"]} />
              <CfgSelect label="Default Payment Method" value={settings.payment_method_default ?? "Cash"} onChange={(v) => setSetting("payment_method_default", v)} disabled={!canEdit} options={PAYMENT_OPTIONS} />
            </div>
            <div>
              <p className="cfg-section__title" style={{ marginBottom: 12 }}>ENABLED PAYMENT METHODS</p>
              <div className="settings19-choice-grid">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`settings19-choice ${enabledPayments.includes(option) ? "settings19-choice--active" : ""}`}
                    onClick={() => toggleJsonList("payment_methods_enabled", option)}
                    disabled={!canEdit}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="cfg-section__title" style={{ margin: "16px 0 12px" }}>REFERENCE REQUIRED</p>
              <div className="settings19-choice-grid">
                {PAYMENT_OPTIONS.filter((option) => option !== "Cash").map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`settings19-choice ${referenceRequired.includes(option) ? "settings19-choice--active" : ""}`}
                    onClick={() => toggleJsonList("payment_reference_required", option)}
                    disabled={!canEdit}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {canEdit ? (
            <CfgSaveBar
              onSave={() =>
                void saveEntries("payments", {
                  currency_code: settings.currency_code,
                  currency_symbol: settings.currency_symbol,
                  currency_locale: settings.currency_locale,
                  currency_decimal_places: settings.currency_decimal_places,
                  payment_method_default: settings.payment_method_default,
                  payment_methods_enabled: enabledPayments,
                  payment_reference_required: referenceRequired,
                })
              }
              saving={savingKey === "payments"}
            />
          ) : null}
        </article>

        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><ShieldCheck size={16} /></div>
            <div>
              <h2>Discount, Barcode & Printer</h2>
              <p>Checkout guardrails, label size, and receipt printing behavior.</p>
            </div>
          </div>
          <div className="cfg-2col">
            <div className="cfg-fields">
              <CfgInput label="Max Discount (%)" value={settings.discount_max_percent ?? ""} onChange={(v) => setSetting("discount_max_percent", v)} type="number" disabled={!canEdit} />
              <CfgInput label="Max Discount Amount" value={settings.discount_max_amount ?? ""} onChange={(v) => setSetting("discount_max_amount", v)} type="number" disabled={!canEdit} />
              <CfgSelect label="Barcode Format" value={settings.barcode_format ?? "CODE128"} onChange={(v) => setSetting("barcode_format", v)} disabled={!canEdit} options={["CODE128", "CODE39", "EAN-13", "UPC-A", "QR Code"]} />
              <CfgInput label="Label Width (mm)" value={settings.barcode_label_width_mm ?? ""} onChange={(v) => setSetting("barcode_label_width_mm", v)} type="number" disabled={!canEdit} />
              <CfgInput label="Label Height (mm)" value={settings.barcode_label_height_mm ?? ""} onChange={(v) => setSetting("barcode_label_height_mm", v)} type="number" disabled={!canEdit} />
              <CfgInput label="Printer Name" value={settings.printer_name ?? ""} onChange={(v) => setSetting("printer_name", v)} disabled={!canEdit} />
              <CfgSelect label="Printer Type" value={settings.printer_type ?? "Thermal 80mm"} onChange={(v) => setSetting("printer_type", v)} disabled={!canEdit} options={["Thermal 58mm", "Thermal 80mm", "A4 Printer", "PDF Only"]} />
              <CfgSelect label="Receipt Copies" value={settings.printer_copies ?? "1"} onChange={(v) => setSetting("printer_copies", v)} disabled={!canEdit} options={["1", "2", "3"]} />
            </div>
            <div className="cfg-toggles">
              <CfgToggle label="Enable Discounts" sub="Allow discounts at the POS counter" value={readBooleanSetting(settings, "discounts_enabled")} onChange={(v) => setSetting("discounts_enabled", String(v))} disabled={!canEdit} />
              <CfgToggle label="Require Approval" sub="Require a supervisor for large discounts" value={readBooleanSetting(settings, "discount_requires_approval")} onChange={(v) => setSetting("discount_requires_approval", String(v))} disabled={!canEdit} />
              <CfgToggle label="Allow Discount Stacking" sub="Allow multiple discount rules on one sale" value={readBooleanSetting(settings, "discount_allow_stack")} onChange={(v) => setSetting("discount_allow_stack", String(v))} disabled={!canEdit} />
              <CfgToggle label="Include Price on Barcode" sub="Print selling price on barcode labels" value={readBooleanSetting(settings, "barcode_include_price")} onChange={(v) => setSetting("barcode_include_price", String(v))} disabled={!canEdit} />
              <CfgToggle label="Include SKU on Barcode" sub="Print SKU under each barcode label" value={readBooleanSetting(settings, "barcode_include_sku")} onChange={(v) => setSetting("barcode_include_sku", String(v))} disabled={!canEdit} />
              <CfgToggle label="Auto Print Receipts" sub="Send receipt to default printer after checkout" value={readBooleanSetting(settings, "printer_auto_print_receipt")} onChange={(v) => setSetting("printer_auto_print_receipt", String(v))} disabled={!canEdit} />
            </div>
          </div>
          {canEdit ? (
            <CfgSaveBar
              onSave={() =>
                void saveEntries("barcode-printer", {
                  discounts_enabled: settings.discounts_enabled,
                  discount_max_percent: settings.discount_max_percent,
                  discount_max_amount: settings.discount_max_amount,
                  discount_requires_approval: settings.discount_requires_approval,
                  discount_allow_stack: settings.discount_allow_stack,
                  barcode_format: settings.barcode_format,
                  barcode_label_width_mm: settings.barcode_label_width_mm,
                  barcode_label_height_mm: settings.barcode_label_height_mm,
                  barcode_include_price: settings.barcode_include_price,
                  barcode_include_sku: settings.barcode_include_sku,
                  printer_name: settings.printer_name,
                  printer_type: settings.printer_type,
                  printer_auto_print_receipt: settings.printer_auto_print_receipt,
                  printer_copies: settings.printer_copies,
                })
              }
              saving={savingKey === "barcode-printer"}
            />
          ) : null}
        </article>
      </section>

      <section className="settings19-grid settings19-grid--secondary">
        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><Building2 size={16} /></div>
            <div>
              <h2>Branch Settings</h2>
              <p>Default branch selection and quick visibility into branch setup.</p>
            </div>
          </div>
          <div className="cfg-fields">
            <div className="cfg-field">
              <span className="cfg-field__label">Default Branch</span>
              <select
                className="cfg-field__select"
                value={settings.default_branch_id ?? ""}
                onChange={(event) => setSetting("default_branch_id", event.target.value)}
                disabled={!canEdit}
              >
                <option value="">Select a branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings19-branch-list">
            {branches.map((branch) => (
              <div key={branch.id} className="settings19-branch-row">
                <div>
                  <strong>{branch.name}</strong>
                  <span>{branch.code} | {branch.timezone ?? "No timezone"} | {branch.pricing_mode ?? "global"}</span>
                </div>
                <span className={`branch-badge ${branch.is_active === false ? "branch-badge--gray" : "branch-badge--green"}`}>
                  {branch.is_active === false ? "Inactive" : "Active"}
                </span>
              </div>
            ))}
          </div>
          {canEdit ? (
            <CfgSaveBar
              onSave={() => void saveEntries("branch-defaults", { default_branch_id: settings.default_branch_id })}
              saving={savingKey === "branch-defaults"}
            />
          ) : null}
          <div style={{ marginTop: 16 }}>
            <BranchSection disabled={!canEdit} />
          </div>
        </article>

        <article className="settings19-card">
          <div className="settings19-card__head">
            <div className="settings19-card__icon"><ArchiveRestore size={16} /></div>
            <div>
              <h2>Backup Settings</h2>
              <p>Schedule automated backups and run ad hoc exports.</p>
            </div>
          </div>
          <div className="cfg-2col">
            <div className="cfg-fields">
              <CfgSelect label="Schedule" value={settings.backup_schedule ?? "Daily"} onChange={(v) => setSetting("backup_schedule", v)} disabled={!canEdit} options={["Hourly", "Daily", "Weekly", "Monthly", "Manual Only"]} />
              <CfgSelect label="Backup Time" value={settings.backup_time ?? "02:00 AM"} onChange={(v) => setSetting("backup_time", v)} disabled={!canEdit} options={["12:00 AM", "02:00 AM", "04:00 AM", "06:00 AM", "11:00 PM"]} />
              <CfgSelect label="Retention (days)" value={settings.backup_retention_days ?? "30"} onChange={(v) => setSetting("backup_retention_days", v)} disabled={!canEdit} options={["7", "14", "30", "60", "90", "180"]} />
            </div>
            <div className="cfg-toggles">
              <CfgToggle label="Auto Backup" sub="Run the configured schedule automatically" value={readBooleanSetting(settings, "backup_auto_enabled")} onChange={(v) => setSetting("backup_auto_enabled", String(v))} disabled={!canEdit} />
              <CfgToggle label="Include Images" sub="Store uploaded assets in the backup package" value={readBooleanSetting(settings, "backup_include_images")} onChange={(v) => setSetting("backup_include_images", String(v))} disabled={!canEdit} />
              <CfgToggle label="Email Backup Reports" sub="Send completion summary to administrators" value={readBooleanSetting(settings, "backup_email_reports")} onChange={(v) => setSetting("backup_email_reports", String(v))} disabled={!canEdit} />
            </div>
          </div>
          {canEdit ? (
            <div className="settings19-inline-actions">
              <CfgSaveBar
                onSave={() =>
                  void saveEntries("backup-settings", {
                    backup_schedule: settings.backup_schedule,
                    backup_time: settings.backup_time,
                    backup_retention_days: settings.backup_retention_days,
                    backup_auto_enabled: settings.backup_auto_enabled,
                    backup_include_images: settings.backup_include_images,
                    backup_email_reports: settings.backup_email_reports,
                  })
                }
                saving={savingKey === "backup-settings"}
              />
              <button type="button" className="settings19-btn" onClick={() => void runBackup()} disabled={savingKey === "backup-run"}>
                {savingKey === "backup-run" ? <LoaderCircle size={15} className="settings19-spin" /> : <Download size={15} />}
                Run Backup Now
              </button>
            </div>
          ) : null}
          <div className="settings19-log-list">
            {backupRuns.length === 0 ? (
              <div className="settings19-empty">No backup history yet.</div>
            ) : (
              backupRuns.map((run) => (
                <div key={run.id} className="settings19-log-row">
                  <div>
                    <strong>{run.file_name}</strong>
                    <span>{run.backup_scope} | {formatBytes(run.file_size_bytes)} | {formatDate(run.created_at)}</span>
                  </div>
                  <span className={`branch-badge ${run.status === "completed" ? "branch-badge--green" : "branch-badge--gray"}`}>
                    {run.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="settings19-card">
        <div className="settings19-card__head">
          <div className="settings19-card__icon"><Upload size={16} /></div>
          <div>
            <h2>Data Import / Export</h2>
            <p>Export live operational data and bulk import catalog or master-data sheets.</p>
          </div>
        </div>
        <div className="cfg-2col">
          <div className="settings19-transfer-box">
            <p className="cfg-section__title">EXPORT DATA</p>
            <CfgSelect label="Module" value={exportModule} onChange={(v) => setExportModule(v as DataModuleKey)} disabled={savingKey === "export"} options={Object.keys(DATA_MODULE_LABELS)} />
            <button type="button" className="settings19-btn" onClick={() => void exportData()} disabled={savingKey === "export"}>
              {savingKey === "export" ? <LoaderCircle size={15} className="settings19-spin" /> : <Download size={15} />}
              Export {DATA_MODULE_LABELS[exportModule]}
            </button>
          </div>
          <div className="settings19-transfer-box">
            <p className="cfg-section__title">IMPORT DATA</p>
            <CfgSelect label="Module" value={importModule} onChange={(v) => setImportModule(v as typeof importModule)} disabled={savingKey === "import"} options={IMPORT_MODULES} />
            <label className="settings19-file">
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} disabled={savingKey === "import"} />
              <span>{importFile?.name ?? "Choose CSV or Excel file"}</span>
            </label>
            <button type="button" className="settings19-btn" onClick={() => void importData()} disabled={savingKey === "import" || !importFile}>
              {savingKey === "import" ? <LoaderCircle size={15} className="settings19-spin" /> : <Upload size={15} />}
              Import {DATA_MODULE_LABELS[importModule]}
            </button>
          </div>
        </div>
        <div className="settings19-log-list" style={{ marginTop: 18 }}>
          {exchangeLogs.length === 0 ? (
            <div className="settings19-empty">No import or export activity recorded yet.</div>
          ) : (
            exchangeLogs.map((log) => (
              <div key={log.id} className="settings19-log-row">
                <div>
                  <strong>{log.file_name}</strong>
                  <span>
                    {log.direction} | {DATA_MODULE_LABELS[log.module_name as DataModuleKey] ?? log.module_name} | {log.row_count} row(s) | {formatDate(log.created_at)}
                  </span>
                </div>
                <span className={`branch-badge ${log.status === "completed" ? "branch-badge--green" : "branch-badge--gray"}`}>
                  {log.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {toast ? (
        <div className={`settings19-toast ${toast.ok ? "settings19-toast--ok" : "settings19-toast--err"}`}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{toast.msg}</span>
        </div>
      ) : null}
    </div>
  );
}

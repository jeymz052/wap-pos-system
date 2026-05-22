"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Package2,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Tags,
  X,
} from "lucide-react";
import CameraScanModal from "@/app/pos/components/CameraScanModal";
import { supabase } from "@/lib/supabase";
import {
  barcodeFormatOptions,
  barcodeLabelPresets,
  barcodeSourceOptions,
  barcodeTypeOptions,
  buildSuggestedBarcodeValue,
  defaultBarcodeLabelConfig,
  formatBarcodeSource,
  formatLabelSize,
  type BarcodeKind,
  type BarcodeLabelConfig,
  type BarcodeMappingRecord,
  type BarcodeSourceType,
} from "@/lib/barcode-utils";
import { renderBarcodeAsset, type RenderedBarcodeAsset } from "@/lib/barcode-render";

type BarcodeStudioProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  partNumber: string;
  supplierCode: string;
  brandName: string;
  shelfLocation: string;
  sellingPrice: number;
};

type EditableBarcodeRow = {
  localId: string;
  barcodeValue: string;
  barcodeType: BarcodeKind;
  sourceType: BarcodeSourceType;
  supplierName: string;
  notes: string;
};

type ProductBarcodeState = {
  loaded: boolean;
  primaryBarcodeValue: string;
  primaryBarcodeType: BarcodeKind;
  editableRows: EditableBarcodeRow[];
  systemRows: BarcodeMappingRecord[];
};

type Props = {
  products: BarcodeStudioProduct[];
  initialProductId?: string;
  initialSelectedIds: string[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function createEditableRow(sourceType: BarcodeSourceType = "alias"): EditableBarcodeRow {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    barcodeValue: "",
    barcodeType: sourceType === "qr" ? "qr_code" : "barcode",
    sourceType,
    supplierName: "",
    notes: "",
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
}

export default function BarcodeStudioModal({
  products,
  initialProductId,
  initialSelectedIds,
  onClose,
  onSaved,
}: Props) {
  const [activeProductId, setActiveProductId] = useState(initialProductId ?? initialSelectedIds[0] ?? products[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [searchValue, setSearchValue] = useState("");
  const [productStates, setProductStates] = useState<Record<string, ProductBarcodeState>>({});
  const [labelConfig, setLabelConfig] = useState<BarcodeLabelConfig>(defaultBarcodeLabelConfig);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [loadingProductId, setLoadingProductId] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ kind: "primary" | "row"; rowId?: string } | null>(null);
  const [previewAsset, setPreviewAsset] = useState<RenderedBarcodeAsset | null>(null);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const activeProduct = products.find((product) => product.id === activeProductId) ?? null;
  const activeState = activeProductId
    ? productStates[activeProductId] ?? {
        loaded: false,
        primaryBarcodeValue: activeProduct?.barcode ?? "",
        primaryBarcodeType: "barcode" as BarcodeKind,
        editableRows: [],
        systemRows: [],
      }
    : null;

  const filteredProducts = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.barcode, product.partNumber, product.supplierCode, product.brandName]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [products, searchValue]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!activeProduct) return;
    if (productStates[activeProduct.id]?.loaded) return;

    let cancelled = false;

    const load = async () => {
      setLoadingProductId(activeProduct.id);
      try {
        const response = await fetch(`/api/barcodes?productId=${encodeURIComponent(activeProduct.id)}`, {
          headers: await getAuthHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load barcode mappings.");
        }

        const productPayload = (payload.products ?? [])[0] as
          | {
              mappings?: BarcodeMappingRecord[];
            }
          | undefined;

        const mappings = productPayload?.mappings ?? [];
        const primaryRow = mappings.find((mapping) => mapping.isPrimary) ?? null;
        const editableRows = mappings
          .filter((mapping) => mapping.managedBy === "user" && !mapping.isPrimary)
          .map((mapping) => ({
            localId: mapping.id,
            barcodeValue: mapping.barcodeValue,
            barcodeType: mapping.barcodeType,
            sourceType: mapping.sourceType,
            supplierName: mapping.supplierName,
            notes: mapping.notes,
          }));

        if (cancelled) return;

        setProductStates((current) => ({
          ...current,
          [activeProduct.id]: {
            loaded: true,
            primaryBarcodeValue: primaryRow?.barcodeValue ?? activeProduct.barcode ?? "",
            primaryBarcodeType: primaryRow?.barcodeType ?? "barcode",
            editableRows,
            systemRows: mappings.filter((mapping) => mapping.managedBy === "system"),
          },
        }));
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load barcode mappings.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingProductId("");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeProduct, productStates]);

  useEffect(() => {
    if (!activeState?.primaryBarcodeValue) {
      return;
    }

    let cancelled = false;

    const loadAsset = async () => {
      try {
        const asset = await renderBarcodeAsset({
          value: activeState.primaryBarcodeValue,
          barcodeType: labelConfig.barcodeType === "qr_code" ? "qr_code" : activeState.primaryBarcodeType,
          barcodeFormat: labelConfig.barcodeFormat,
        });
        if (!cancelled) {
          setPreviewAsset(asset);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewAsset(null);
          setNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Unable to render barcode preview.",
          });
        }
      }
    };

    void loadAsset();

    return () => {
      cancelled = true;
    };
  }, [activeState?.primaryBarcodeType, activeState?.primaryBarcodeValue, labelConfig.barcodeFormat, labelConfig.barcodeType]);

  function patchActiveState(patch: Partial<ProductBarcodeState>) {
    if (!activeProductId || !activeState) return;
    setProductStates((current) => ({
      ...current,
      [activeProductId]: {
        ...activeState,
        ...patch,
      },
    }));
  }

  function toggleSelectedProduct(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  }

  function updateEditableRow(rowId: string, patch: Partial<EditableBarcodeRow>) {
    if (!activeState) return;
    patchActiveState({
      editableRows: activeState.editableRows.map((row) => (row.localId === rowId ? { ...row, ...patch } : row)),
    });
  }

  function removeEditableRow(rowId: string) {
    if (!activeState) return;
    patchActiveState({
      editableRows: activeState.editableRows.filter((row) => row.localId !== rowId),
    });
  }

  async function saveActiveProductMappings() {
    if (!activeProduct || !activeState) return;

    setSaving(true);
    try {
      const response = await fetch("/api/barcodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          productId: activeProduct.id,
          primaryBarcodeValue: activeState.primaryBarcodeValue,
          primaryBarcodeType: activeState.primaryBarcodeType,
          mappings: activeState.editableRows,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save barcode mappings.");
      }

      setProductStates((current) => ({
        ...current,
        [activeProduct.id]: {
          ...current[activeProduct.id],
          loaded: false,
        },
      }));

      await onSaved();

      setNotice({
        tone: "success",
        message: `Saved barcode mappings for ${activeProduct.name}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save barcode mappings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function ensureStatesLoaded(productIds: string[]) {
    const idsToLoad = productIds.filter((id) => !productStates[id]?.loaded);
    if (!idsToLoad.length) return {} as Record<string, ProductBarcodeState>;

    const response = await fetch(`/api/barcodes?productIds=${encodeURIComponent(idsToLoad.join(","))}`, {
      headers: await getAuthHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load barcodes for printing.");
    }

    const nextState: Record<string, ProductBarcodeState> = {};
    ((payload.products ?? []) as Array<{ productId: string; mappings: BarcodeMappingRecord[] }>).forEach((productPayload) => {
      const sourceProduct = products.find((product) => product.id === productPayload.productId);
      const primaryRow = productPayload.mappings.find((mapping) => mapping.isPrimary) ?? null;
      nextState[productPayload.productId] = {
        loaded: true,
        primaryBarcodeValue: primaryRow?.barcodeValue ?? sourceProduct?.barcode ?? "",
        primaryBarcodeType: primaryRow?.barcodeType ?? "barcode",
        editableRows: productPayload.mappings
          .filter((mapping) => mapping.managedBy === "user" && !mapping.isPrimary)
          .map((mapping) => ({
            localId: mapping.id,
            barcodeValue: mapping.barcodeValue,
            barcodeType: mapping.barcodeType,
            sourceType: mapping.sourceType,
            supplierName: mapping.supplierName,
            notes: mapping.notes,
          })),
        systemRows: productPayload.mappings.filter((mapping) => mapping.managedBy === "system"),
      };
    });

    setProductStates((current) => ({
      ...current,
      ...nextState,
    }));

    return nextState;
  }

  async function printSelectedLabels() {
    const productIds = selectedIds.length ? selectedIds : activeProductId ? [activeProductId] : [];
    if (!productIds.length) {
      setNotice({ tone: "error", message: "Select at least one product for label printing." });
      return;
    }

    setPrinting(true);

    try {
      const fetchedStates = await ensureStatesLoaded(productIds);

      const printableProducts = productIds
        .map((productId) => {
          const product = products.find((entry) => entry.id === productId);
          const state = fetchedStates[productId] ?? productStates[productId] ?? (productId === activeProductId ? activeState : null);
          if (!product || !state?.primaryBarcodeValue) return null;
          return {
            product,
            barcodeValue: state.primaryBarcodeValue,
            barcodeType: labelConfig.barcodeType === "qr_code" ? "qr_code" : state.primaryBarcodeType,
          };
        })
        .filter(Boolean) as Array<{
          product: BarcodeStudioProduct;
          barcodeValue: string;
          barcodeType: BarcodeKind;
        }>;

      if (!printableProducts.length) {
        throw new Error("No printable barcode values were found for the selected products.");
      }

      const assetEntries = await Promise.all(
        printableProducts.map(async (entry) => ({
          ...entry,
          asset: await renderBarcodeAsset({
            value: entry.barcodeValue,
            barcodeType: entry.barcodeType,
            barcodeFormat: labelConfig.barcodeFormat,
          }),
        }))
      );

      const labelsHtml = assetEntries
        .flatMap((entry) =>
          Array.from({ length: Math.max(1, labelConfig.quantity) }).map(() => {
            const barcodeMarkup = entry.asset.mode === "svg"
              ? entry.asset.markup
              : `<img src="${entry.asset.dataUrl}" alt="${escapeHtml(entry.product.name)}" class="barcode-studio-print__qr" />`;

            return `
              <article class="barcode-studio-print__label" style="width:${labelConfig.widthMm}mm;height:${labelConfig.heightMm}mm;">
                ${labelConfig.includeProductName ? `<div class="barcode-studio-print__name">${escapeHtml(entry.product.name)}</div>` : ""}
                ${labelConfig.includeBrand ? `<div class="barcode-studio-print__meta">${escapeHtml(entry.product.brandName || "No Brand")}</div>` : ""}
                <div class="barcode-studio-print__bars">${barcodeMarkup}</div>
                <div class="barcode-studio-print__code">${escapeHtml(entry.barcodeValue)}</div>
                <div class="barcode-studio-print__meta-row">
                  ${labelConfig.includeSku ? `<span>${escapeHtml(entry.product.sku)}</span>` : ""}
                  ${labelConfig.includePrice ? `<strong>P${entry.product.sellingPrice.toFixed(2)}</strong>` : ""}
                </div>
                ${labelConfig.includeShelfLocation ? `<div class="barcode-studio-print__meta">${escapeHtml(entry.product.shelfLocation || "No shelf location")}</div>` : ""}
              </article>
            `;
          })
        )
        .join("");

      if (printAreaRef.current) {
        printAreaRef.current.innerHTML = labelsHtml;
      }

      const printWindow = window.open("", "_blank", "width=980,height=720");
      if (!printWindow) {
        throw new Error("Pop-up blocked. Allow pop-ups to print barcode labels.");
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Barcode Labels</title>
            <style>
              body { margin: 0; padding: 12px; font-family: Arial, sans-serif; background: #fff; }
              .barcode-studio-print { display: flex; flex-wrap: wrap; gap: 6mm; align-items: flex-start; }
              .barcode-studio-print__label { box-sizing: border-box; border: 1px solid #d1d5db; padding: 2.5mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
              .barcode-studio-print__name { font-size: 10px; font-weight: 700; line-height: 1.2; color: #111827; margin-bottom: 1mm; }
              .barcode-studio-print__meta { font-size: 8px; color: #4b5563; line-height: 1.2; }
              .barcode-studio-print__meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 8px; color: #111827; margin-top: 1mm; }
              .barcode-studio-print__bars { height: 16mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
              .barcode-studio-print__bars svg { width: 100%; height: 100%; }
              .barcode-studio-print__qr { width: 16mm; height: 16mm; object-fit: contain; }
              .barcode-studio-print__code { text-align: center; font-size: 8px; letter-spacing: 0.06em; color: #111827; margin-top: 1mm; }
              @media print {
                body { padding: 0; }
                .barcode-studio-print__label { border-color: transparent; }
              }
            </style>
          </head>
          <body>
            <section class="barcode-studio-print">${labelsHtml}</section>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      void fetch("/api/barcodes/labels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          labels: assetEntries.map((entry) => ({
            productId: entry.product.id,
            barcodeValue: entry.barcodeValue,
            barcodeType: entry.barcodeType,
            labelSize: `${labelConfig.widthMm}x${labelConfig.heightMm}`,
            includePrice: labelConfig.includePrice,
            includeBrand: labelConfig.includeBrand,
            includeSku: labelConfig.includeSku,
            printQuantity: labelConfig.quantity,
            widthMm: labelConfig.widthMm,
            heightMm: labelConfig.heightMm,
            includeProductName: labelConfig.includeProductName,
            includeShelfLocation: labelConfig.includeShelfLocation,
          })),
        }),
      });

      setNotice({
        tone: "success",
        message: `Prepared ${printableProducts.length} product label set(s) for printing.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to print barcode labels.",
      });
    } finally {
      setPrinting(false);
    }
  }

  const selectAllVisible = filteredProducts.length > 0 && filteredProducts.every((product) => selectedIds.includes(product.id));

  return (
    <div className="barcode-studio">
      <div className="barcode-studio__backdrop" onClick={onClose} />
      <div className="barcode-studio__panel">
        <div className="barcode-studio__header">
          <div>
            <div className="barcode-studio__eyebrow">Module 4</div>
            <h2>Barcode Studio</h2>
            <p>Generate, map, validate, and print product barcodes with supplier aliases and batch labels.</p>
          </div>
          <button type="button" className="barcode-studio__close" onClick={onClose} aria-label="Close barcode studio">
            <X size={16} />
          </button>
        </div>

        {notice ? <div className={`barcode-studio__notice barcode-studio__notice--${notice.tone}`}>{notice.message}</div> : null}

        <div className="barcode-studio__body">
          <aside className="barcode-studio__sidebar">
            <div className="barcode-studio__sidebar-head">
              <label className="barcode-studio__search">
                <Search size={15} />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search name, SKU, barcode..."
                />
              </label>
              <button
                type="button"
                className="barcode-studio__toggle-all"
                onClick={() => setSelectedIds(selectAllVisible ? selectedIds.filter((id) => !filteredProducts.some((product) => product.id === id)) : Array.from(new Set([...selectedIds, ...filteredProducts.map((product) => product.id)])))}
              >
                {selectAllVisible ? "Clear Visible" : "Select Visible"}
              </button>
            </div>

            <div className="barcode-studio__product-list">
              {filteredProducts.map((product) => {
                const selected = selectedIds.includes(product.id);
                const active = activeProductId === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    className={`barcode-studio__product ${active ? "barcode-studio__product--active" : ""}`}
                    onClick={() => setActiveProductId(product.id)}
                  >
                    <span
                      className={`barcode-studio__check ${selected ? "barcode-studio__check--active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSelectedProduct(product.id);
                      }}
                    >
                      {selected ? <Check size={12} /> : null}
                    </span>
                    <span className="barcode-studio__product-copy">
                      <strong>{product.name}</strong>
                      <span>{product.sku}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="barcode-studio__main">
            {activeProduct && activeState ? (
              <>
                <div className="barcode-studio__product-head">
                  <div>
                    <div className="barcode-studio__product-title">
                      <Package2 size={16} />
                      <strong>{activeProduct.name}</strong>
                    </div>
                    <p>{activeProduct.sku} {activeProduct.brandName ? `· ${activeProduct.brandName}` : ""}</p>
                  </div>
                  <div className="barcode-studio__product-actions">
                    <button
                      type="button"
                      className="barcode-studio__action"
                      onClick={() =>
                        patchActiveState({
                          primaryBarcodeValue: buildSuggestedBarcodeValue({
                            sku: activeProduct.sku,
                            partNumber: activeProduct.partNumber,
                            supplierCode: activeProduct.supplierCode,
                            productId: activeProduct.id,
                          }),
                        })
                      }
                    >
                      <RefreshCw size={14} />
                      <span>Generate</span>
                    </button>
                    <button
                      type="button"
                      className="barcode-studio__action"
                      onClick={() => {
                        setScanTarget({ kind: "primary" });
                        setShowCameraScanner(true);
                      }}
                    >
                      <Camera size={14} />
                      <span>Scan</span>
                    </button>
                    <button type="button" className="barcode-studio__action barcode-studio__action--primary" onClick={() => void saveActiveProductMappings()} disabled={saving}>
                      <Tags size={14} />
                      <span>{saving ? "Saving..." : "Save Mapping"}</span>
                    </button>
                  </div>
                </div>

                <div className="barcode-studio__grid">
                  <div className="barcode-studio__card">
                    <div className="barcode-studio__card-head">
                      <strong>Primary Product Barcode</strong>
                      {loadingProductId === activeProduct.id ? <span>Loading...</span> : <span>Scans directly at POS</span>}
                    </div>
                    <div className="barcode-studio__form-grid">
                      <label>
                        <span>Barcode Value</span>
                        <input
                          value={activeState.primaryBarcodeValue}
                          onChange={(event) => patchActiveState({ primaryBarcodeValue: event.target.value })}
                          placeholder="WAP-BRKPAD-001"
                        />
                      </label>
                      <label>
                        <span>Type</span>
                        <select
                          value={activeState.primaryBarcodeType}
                          onChange={(event) => patchActiveState({ primaryBarcodeType: event.target.value as BarcodeKind })}
                        >
                          {barcodeTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="barcode-studio__system-list">
                      {activeState.systemRows.length ? activeState.systemRows.map((row) => (
                        <div key={row.id} className="barcode-studio__system-row">
                          <span>{formatBarcodeSource(row.sourceType)}</span>
                          <strong>{row.barcodeValue}</strong>
                        </div>
                      )) : (
                        <div className="barcode-studio__empty">No automatic SKU or supplier mappings found yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="barcode-studio__card">
                    <div className="barcode-studio__card-head">
                      <strong>Alternate Barcode Mappings</strong>
                      <button
                        type="button"
                        className="barcode-studio__action"
                        onClick={() => patchActiveState({ editableRows: [...activeState.editableRows, createEditableRow()] })}
                      >
                        <Plus size={14} />
                        <span>Add Row</span>
                      </button>
                    </div>

                    <div className="barcode-studio__rows">
                      {activeState.editableRows.map((row) => (
                        <div key={row.localId} className="barcode-studio__row">
                          <input
                            value={row.barcodeValue}
                            onChange={(event) => updateEditableRow(row.localId, { barcodeValue: event.target.value })}
                            placeholder="Supplier or alternate barcode"
                          />
                          <select
                            value={row.sourceType}
                            onChange={(event) => updateEditableRow(row.localId, { sourceType: event.target.value as BarcodeSourceType })}
                          >
                            {barcodeSourceOptions.filter((option) => option.value !== "primary" && option.value !== "sku").map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={row.barcodeType}
                            onChange={(event) => updateEditableRow(row.localId, { barcodeType: event.target.value as BarcodeKind })}
                          >
                            {barcodeTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={row.supplierName}
                            onChange={(event) => updateEditableRow(row.localId, { supplierName: event.target.value })}
                            placeholder="Supplier name (optional)"
                          />
                          <button
                            type="button"
                            className="barcode-studio__icon-btn"
                            onClick={() => {
                              setScanTarget({ kind: "row", rowId: row.localId });
                              setShowCameraScanner(true);
                            }}
                            aria-label="Scan barcode into row"
                          >
                            <ScanLine size={14} />
                          </button>
                          <button type="button" className="barcode-studio__icon-btn barcode-studio__icon-btn--danger" onClick={() => removeEditableRow(row.localId)} aria-label="Remove barcode row">
                            <X size={14} />
                          </button>
                        </div>
                      ))}

                      {!activeState.editableRows.length ? (
                        <div className="barcode-studio__empty">
                          Add supplier, alias, or QR mappings here. Duplicate checks run when you save.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="barcode-studio__grid barcode-studio__grid--labels">
                  <div className="barcode-studio__card">
                    <div className="barcode-studio__card-head">
                      <strong>Label Settings</strong>
                      <span>{selectedIds.length} item(s) selected for batch printing</span>
                    </div>
                    <div className="barcode-studio__label-grid">
                      <label>
                        <span>Preset Size</span>
                        <select
                          value={`${labelConfig.widthMm}x${labelConfig.heightMm}`}
                          onChange={(event) => {
                            const preset = barcodeLabelPresets.find((item) => `${item.widthMm}x${item.heightMm}` === event.target.value);
                            if (!preset) return;
                            setLabelConfig((current) => ({
                              ...current,
                              widthMm: preset.widthMm,
                              heightMm: preset.heightMm,
                            }));
                          }}
                        >
                          {barcodeLabelPresets.map((preset) => (
                            <option key={preset.id} value={`${preset.widthMm}x${preset.heightMm}`}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Width (mm)</span>
                        <input
                          type="number"
                          min="20"
                          step="1"
                          value={labelConfig.widthMm}
                          onChange={(event) => setLabelConfig((current) => ({ ...current, widthMm: Number(event.target.value || 58) }))}
                        />
                      </label>
                      <label>
                        <span>Height (mm)</span>
                        <input
                          type="number"
                          min="20"
                          step="1"
                          value={labelConfig.heightMm}
                          onChange={(event) => setLabelConfig((current) => ({ ...current, heightMm: Number(event.target.value || 30) }))}
                        />
                      </label>
                      <label>
                        <span>Qty per Product</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={labelConfig.quantity}
                          onChange={(event) => setLabelConfig((current) => ({ ...current, quantity: Math.max(1, Number(event.target.value || 1)) }))}
                        />
                      </label>
                      <label>
                        <span>Render Format</span>
                        <select
                          value={labelConfig.barcodeFormat}
                          onChange={(event) => setLabelConfig((current) => ({ ...current, barcodeFormat: event.target.value as BarcodeLabelConfig["barcodeFormat"] }))}
                        >
                          {barcodeFormatOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Label Type</span>
                        <select
                          value={labelConfig.barcodeType}
                          onChange={(event) => setLabelConfig((current) => ({ ...current, barcodeType: event.target.value as BarcodeKind }))}
                        >
                          {barcodeTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="barcode-studio__toggles">
                      {[
                        ["includeProductName", "Product name"],
                        ["includeSku", "SKU"],
                        ["includePrice", "Price"],
                        ["includeBrand", "Brand"],
                        ["includeShelfLocation", "Shelf location"],
                      ].map(([key, label]) => (
                        <label key={key} className="barcode-studio__toggle">
                          <input
                            type="checkbox"
                            checked={labelConfig[key as keyof BarcodeLabelConfig] as boolean}
                            onChange={(event) =>
                              setLabelConfig((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="barcode-studio__batch-actions">
                      <button type="button" className="barcode-studio__action" onClick={() => navigator.clipboard.writeText(activeState.primaryBarcodeValue || "")} disabled={!activeState.primaryBarcodeValue}>
                        <Copy size={14} />
                        <span>Copy Code</span>
                      </button>
                      <button type="button" className="barcode-studio__action barcode-studio__action--primary" onClick={() => void printSelectedLabels()} disabled={printing}>
                        <Printer size={14} />
                        <span>{printing ? "Preparing..." : `Print ${selectedIds.length || 1} Product(s)`}</span>
                      </button>
                    </div>
                  </div>

                  <div className="barcode-studio__card">
                    <div className="barcode-studio__card-head">
                      <strong>Label Preview</strong>
                      <span>{formatLabelSize(labelConfig.widthMm, labelConfig.heightMm)}</span>
                    </div>
                    {activeState.primaryBarcodeValue && previewAsset ? (
                      <div className="barcode-studio__preview" style={{ width: `${labelConfig.widthMm}mm`, height: `${labelConfig.heightMm}mm` }}>
                        {labelConfig.includeProductName ? <div className="barcode-studio__preview-name">{activeProduct.name}</div> : null}
                        {labelConfig.includeBrand ? <div className="barcode-studio__preview-meta">{activeProduct.brandName || "No Brand"}</div> : null}
                        <div className="barcode-studio__preview-bars">
                          {previewAsset.mode === "svg" ? (
                            <div dangerouslySetInnerHTML={{ __html: previewAsset.markup }} />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewAsset.dataUrl} alt={activeProduct.name} className="barcode-studio__preview-qr" />
                          )}
                        </div>
                        <div className="barcode-studio__preview-code">{activeState.primaryBarcodeValue}</div>
                        <div className="barcode-studio__preview-row">
                          {labelConfig.includeSku ? <span>{activeProduct.sku}</span> : <span />}
                          {labelConfig.includePrice ? <strong>P{activeProduct.sellingPrice.toFixed(2)}</strong> : null}
                        </div>
                        {labelConfig.includeShelfLocation ? <div className="barcode-studio__preview-meta">{activeProduct.shelfLocation || "No shelf location"}</div> : null}
                      </div>
                    ) : (
                      <div className="barcode-studio__empty">
                        Add or generate a primary barcode to preview and print this label.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="barcode-studio__empty barcode-studio__empty--center">No product available for barcode management.</div>
            )}
          </section>
        </div>

        <div ref={printAreaRef} style={{ display: "none" }} />

        {showCameraScanner ? (
          <CameraScanModal
            onClose={() => {
              setShowCameraScanner(false);
              setScanTarget(null);
            }}
            onDetected={(code) => {
              if (!activeState) return;

              if (scanTarget?.kind === "primary") {
                patchActiveState({ primaryBarcodeValue: code });
              } else if (scanTarget?.kind === "row" && scanTarget.rowId) {
                updateEditableRow(scanTarget.rowId, { barcodeValue: code });
              }

              setShowCameraScanner(false);
              setScanTarget(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

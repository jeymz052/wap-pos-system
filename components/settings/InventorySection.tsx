"use client";
import { useState } from "react";
import { CfgSelect, CfgToggle, CfgInput, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function InventorySection({ disabled }: { disabled: boolean }) {
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [criticalThreshold, setCriticalThreshold]  = useState("3");
  const [defaultUOM,        setDefaultUOM]         = useState("Piece");
  const [barcodeFormat,     setBarcodeFormat]       = useState("CODE128");
  const [trackSerial,       setTrackSerial]         = useState(false);
  const [trackBatch,        setTrackBatch]          = useState(false);
  const [autoReorder,       setAutoReorder]         = useState(false);
  const [reorderQty,        setReorderQty]          = useState("50");
  const [costMethod,        setCostMethod]          = useState("FIFO");
  const [negativeStock,     setNegativeStock]       = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "inv_low_stock_threshold",  value: lowStockThreshold },
      { key: "inv_critical_threshold",   value: criticalThreshold },
      { key: "inv_default_uom",          value: defaultUOM },
      { key: "inv_barcode_format",       value: barcodeFormat },
      { key: "inv_track_serial",         value: String(trackSerial) },
      { key: "inv_track_batch",          value: String(trackBatch) },
      { key: "inv_auto_reorder",         value: String(autoReorder) },
      { key: "inv_reorder_qty",          value: reorderQty },
      { key: "inv_cost_method",          value: costMethod },
      { key: "inv_allow_negative_stock", value: String(negativeStock) },
    ].map(r => ({ branch_id: null as null, ...r }));
    await supabase.from("settings").upsert(rows, { onConflict: "branch_id,key" });
    setSaving(false);
  };

  return (
    <div className="cfg-section-body">
      <div className="cfg-2col">
        <div className="cfg-fields">
          <CfgInput  label="Low Stock Alert Threshold (units)"      value={lowStockThreshold} onChange={setLowStockThreshold} type="number" disabled={disabled} />
          <CfgInput  label="Critical Stock Threshold (units)"       value={criticalThreshold} onChange={setCriticalThreshold} type="number" disabled={disabled} />
          <CfgSelect label="Default Unit of Measure"                value={defaultUOM}        onChange={setDefaultUOM}        disabled={disabled} options={["Piece","Box","Kg","Liter","Meter","Set","Dozen"]} />
          <CfgSelect label="Barcode Format"                         value={barcodeFormat}     onChange={setBarcodeFormat}     disabled={disabled} options={["CODE128","CODE39","EAN-13","QR Code","UPC-A"]} />
          <CfgSelect label="Costing Method"                         value={costMethod}        onChange={setCostMethod}        disabled={disabled} options={["FIFO","LIFO","Weighted Average"]} />
          <CfgInput  label="Default Reorder Quantity"               value={reorderQty}        onChange={setReorderQty}        type="number" disabled={disabled} />
        </div>
        <div className="cfg-toggles">
          <CfgToggle label="Track Serial Numbers"     sub="Enable serial number tracking per item"        value={trackSerial}   onChange={setTrackSerial}   disabled={disabled} />
          <CfgToggle label="Track Batch / Lot"        sub="Enable batch and lot number tracking"          value={trackBatch}    onChange={setTrackBatch}    disabled={disabled} />
          <CfgToggle label="Auto Reorder"             sub="Automatically generate PO when stock is low"   value={autoReorder}   onChange={setAutoReorder}   disabled={disabled} />
          <CfgToggle label="Allow Negative Stock"     sub="Allow sales even when stock is zero"           value={negativeStock} onChange={setNegativeStock} disabled={disabled} />
        </div>
      </div>
      {!disabled && <CfgSaveBar onSave={save} saving={saving} />}
    </div>
  );
}

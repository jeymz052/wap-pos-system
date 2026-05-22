"use client";
import { useState } from "react";
import { CfgSelect, CfgToggle, CfgInput, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function PosSection({ disabled }: { disabled: boolean }) {
  const [receiptHeader, setReceiptHeader] = useState("WAP Motorparts Trading");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for your purchase!");
  const [taxRate, setTaxRate] = useState("12");
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [defaultPayment, setDefaultPayment] = useState("Cash");
  const [allowDiscount, setAllowDiscount] = useState(true);
  const [maxDiscount, setMaxDiscount] = useState("20");
  const [requireApproval, setRequireApproval] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [printerType, setPrinterType] = useState("Thermal 80mm");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "pos_receipt_header",   value: receiptHeader },
      { key: "pos_receipt_footer",   value: receiptFooter },
      { key: "pos_tax_rate",         value: taxRate },
      { key: "pos_tax_inclusive",    value: String(taxInclusive) },
      { key: "pos_default_payment",  value: defaultPayment },
      { key: "pos_allow_discount",   value: String(allowDiscount) },
      { key: "pos_max_discount",     value: maxDiscount },
      { key: "pos_require_approval", value: String(requireApproval) },
      { key: "pos_print_receipt",    value: String(printReceipt) },
      { key: "pos_auto_print",       value: String(autoPrint) },
      { key: "pos_show_logo",        value: String(showLogo) },
      { key: "pos_printer_type",     value: printerType },
    ].map(r => ({ branch_id: null as null, ...r }));
    await supabase.from("settings").upsert(rows, { onConflict: "branch_id,key" });
    setSaving(false);
  };

  return (
    <div className="cfg-section-body">
      <div className="cfg-2col">
        <div className="cfg-fields">
          <CfgInput label="Receipt Header Text" value={receiptHeader} onChange={setReceiptHeader} disabled={disabled} />
          <CfgInput label="Receipt Footer Text" value={receiptFooter} onChange={setReceiptFooter} disabled={disabled} />
          <CfgSelect label="Default Payment Method" value={defaultPayment} onChange={setDefaultPayment} disabled={disabled}
            options={["Cash","GCash","Credit Card","Bank Transfer","Cheque"]} />
          <CfgSelect label="VAT / Tax Rate (%)" value={taxRate} onChange={setTaxRate} disabled={disabled}
            options={["0","5","12","15"]} />
          <CfgSelect label="Printer Type" value={printerType} onChange={setPrinterType} disabled={disabled}
            options={["Thermal 80mm","Thermal 58mm","A4 Printer","PDF Only"]} />
          <CfgInput label="Maximum Discount (%)" value={maxDiscount} onChange={setMaxDiscount} type="number" disabled={disabled} />
        </div>
        <div className="cfg-toggles">
          <CfgToggle label="Tax Inclusive Pricing"   sub="Prices already include VAT"       value={taxInclusive}    onChange={setTaxInclusive}    disabled={disabled} />
          <CfgToggle label="Allow Discounts"         sub="Allow cashiers to apply discounts" value={allowDiscount}   onChange={setAllowDiscount}   disabled={disabled} />
          <CfgToggle label="Require Approval"        sub="Discounts need manager approval"   value={requireApproval} onChange={setRequireApproval} disabled={disabled} />
          <CfgToggle label="Print Receipt"           sub="Print receipt after each sale"     value={printReceipt}    onChange={setPrintReceipt}    disabled={disabled} />
          <CfgToggle label="Auto Print"              sub="Print without confirmation prompt"  value={autoPrint}       onChange={setAutoPrint}       disabled={disabled} />
          <CfgToggle label="Show Logo on Receipt"    sub="Include company logo on receipts"  value={showLogo}        onChange={setShowLogo}        disabled={disabled} />
        </div>
      </div>
      {!disabled && <CfgSaveBar onSave={save} saving={saving} />}
    </div>
  );
}

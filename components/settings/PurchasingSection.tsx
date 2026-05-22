"use client";
import { useState } from "react";
import { CfgSelect, CfgToggle, CfgInput, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function PurchasingSection({ disabled }: { disabled: boolean }) {
  const [poPrefix,       setPoPrefix]       = useState("PO-");
  const [poApproval,     setPoApproval]     = useState(true);
  const [autoReceive,    setAutoReceive]    = useState(false);
  const [paymentTerms,   setPaymentTerms]   = useState("Net 30");
  const [leadDays,       setLeadDays]       = useState("7");
  const [emailSupplier,  setEmailSupplier]  = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "pur_po_prefix",      value: poPrefix },
      { key: "pur_po_approval",    value: String(poApproval) },
      { key: "pur_auto_receive",   value: String(autoReceive) },
      { key: "pur_payment_terms",  value: paymentTerms },
      { key: "pur_lead_days",      value: leadDays },
      { key: "pur_email_supplier", value: String(emailSupplier) },
    ].map(r => ({ branch_id: null as null, ...r }));
    await supabase.from("settings").upsert(rows, { onConflict: "branch_id,key" });
    setSaving(false);
  };

  return (
    <div className="cfg-section-body">
      <div className="cfg-2col">
        <div className="cfg-fields">
          <CfgInput  label="Purchase Order Number Prefix" value={poPrefix}     onChange={setPoPrefix}     disabled={disabled} placeholder="e.g. PO-" />
          <CfgSelect label="Default Payment Terms"        value={paymentTerms} onChange={setPaymentTerms} disabled={disabled} options={["COD","Net 7","Net 15","Net 30","Net 60","Net 90"]} />
          <CfgInput  label="Default Lead Time (days)"    value={leadDays}     onChange={setLeadDays}     disabled={disabled} type="number" />
        </div>
        <div className="cfg-toggles">
          <CfgToggle label="Require PO Approval"      sub="POs must be approved before sending"          value={poApproval}    onChange={setPoApproval}    disabled={disabled} />
          <CfgToggle label="Auto-Receive on Delivery" sub="Mark items received automatically"            value={autoReceive}   onChange={setAutoReceive}   disabled={disabled} />
          <CfgToggle label="Email Supplier on PO"     sub="Send PO to supplier via email automatically"  value={emailSupplier} onChange={setEmailSupplier} disabled={disabled} />
        </div>
      </div>
      {!disabled && <CfgSaveBar onSave={save} saving={saving} />}
    </div>
  );
}

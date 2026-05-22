"use client";
import { useState } from "react";
import { CfgSelect, CfgToggle, CfgInput, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function PayablesSection({ disabled }: { disabled: boolean }) {
  const [paymentTerms,  setPaymentTerms]  = useState("Net 30");
  const [requireApproval, setRequireApproval] = useState(true);
  const [dueDateAlert,  setDueDateAlert]  = useState("3");
  const [autoSchedule,  setAutoSchedule]  = useState(false);
  const [billPrefix,    setBillPrefix]    = useState("BILL-");
  const [emailOnApprove, setEmailOnApprove] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "ap_payment_terms",   value: paymentTerms },
      { key: "ap_require_approval", value: String(requireApproval) },
      { key: "ap_due_date_alert",  value: dueDateAlert },
      { key: "ap_auto_schedule",   value: String(autoSchedule) },
      { key: "ap_bill_prefix",     value: billPrefix },
      { key: "ap_email_on_approve", value: String(emailOnApprove) },
    ].map(r => ({ branch_id: null as null, ...r }));
    await supabase.from("settings").upsert(rows, { onConflict: "branch_id,key" });
    setSaving(false);
  };

  return (
    <div className="cfg-section-body">
      <div className="cfg-2col">
        <div className="cfg-fields">
          <CfgInput  label="Bill Number Prefix"             value={billPrefix}   onChange={setBillPrefix}   disabled={disabled} placeholder="e.g. BILL-" />
          <CfgSelect label="Default Payment Terms"          value={paymentTerms} onChange={setPaymentTerms} disabled={disabled} options={["COD","Net 7","Net 15","Net 30","Net 60","Net 90"]} />
          <CfgInput  label="Due Date Alert (days before)"   value={dueDateAlert} onChange={setDueDateAlert} disabled={disabled} type="number" />
        </div>
        <div className="cfg-toggles">
          <CfgToggle label="Require Bill Approval"     sub="Bills need approval before payment"           value={requireApproval}  onChange={setRequireApproval}  disabled={disabled} />
          <CfgToggle label="Auto-Schedule Payments"    sub="Auto-schedule payments based on due dates"    value={autoSchedule}     onChange={setAutoSchedule}     disabled={disabled} />
          <CfgToggle label="Email on Bill Approval"    sub="Notify supplier when bill is approved"        value={emailOnApprove}   onChange={setEmailOnApprove}   disabled={disabled} />
        </div>
      </div>
      {!disabled && <CfgSaveBar onSave={save} saving={saving} />}
    </div>
  );
}

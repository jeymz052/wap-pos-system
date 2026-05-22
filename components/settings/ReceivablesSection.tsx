"use client";
import { useState } from "react";
import { CfgSelect, CfgToggle, CfgInput, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function ReceivablesSection({ disabled }: { disabled: boolean }) {
  const [creditTerms,  setCreditTerms]  = useState("Net 30");
  const [creditLimit,  setCreditLimit]  = useState("50000");
  const [graceDays,    setGraceDays]    = useState("5");
  const [lateFee,      setLateFee]      = useState("2");
  const [sendReminder, setSendReminder] = useState(true);
  const [reminderDays, setReminderDays] = useState("3");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "ar_credit_terms",   value: creditTerms },
      { key: "ar_credit_limit",   value: creditLimit },
      { key: "ar_grace_days",     value: graceDays },
      { key: "ar_late_fee_pct",   value: lateFee },
      { key: "ar_send_reminder",  value: String(sendReminder) },
      { key: "ar_reminder_days",  value: reminderDays },
    ].map(r => ({ branch_id: null as null, ...r }));
    await supabase.from("settings").upsert(rows, { onConflict: "branch_id,key" });
    setSaving(false);
  };

  return (
    <div className="cfg-section-body">
      <div className="cfg-2col">
        <div className="cfg-fields">
          <CfgSelect label="Default Credit Terms"        value={creditTerms}  onChange={setCreditTerms}  disabled={disabled} options={["COD","Net 7","Net 15","Net 30","Net 60","Net 90"]} />
          <CfgInput  label="Default Credit Limit (₱)"   value={creditLimit}  onChange={setCreditLimit}  disabled={disabled} type="number" />
          <CfgInput  label="Grace Period (days)"         value={graceDays}    onChange={setGraceDays}    disabled={disabled} type="number" />
          <CfgInput  label="Late Payment Fee (%)"        value={lateFee}      onChange={setLateFee}      disabled={disabled} type="number" />
          <CfgInput  label="Reminder Days Before Due"    value={reminderDays} onChange={setReminderDays} disabled={disabled} type="number" />
        </div>
        <div className="cfg-toggles">
          <CfgToggle label="Send Payment Reminders" sub="Automatically notify customers before due date" value={sendReminder} onChange={setSendReminder} disabled={disabled} />
        </div>
      </div>
      {!disabled && <CfgSaveBar onSave={save} saving={saving} />}
    </div>
  );
}

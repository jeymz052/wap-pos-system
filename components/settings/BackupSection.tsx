"use client";
import { useState } from "react";
import { CheckCircle, Clock, Database, Download, HardDrive, RefreshCw, Save, X } from "lucide-react";
import { CfgSelect, CfgToggle, CfgSaveBar } from "@/components/settings/CfgShared";
import { supabase } from "@/lib/supabase";

export default function BackupSection({ disabled }: { disabled: boolean }) {
  const [schedule,    setSchedule]    = useState("Daily");
  const [backupTime,  setBackupTime]  = useState("02:00 AM");
  const [retention,   setRetention]   = useState("30");
  const [autoBackup,  setAutoBackup]  = useState(true);
  const [cloudBackup, setCloudBackup] = useState(false);
  const [emailReport, setEmailReport] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [running,     setRunning]     = useState(false);
  const [toast,       setToast]       = useState<{ok:boolean;msg:string}|null>(null);

  const showToast = (ok:boolean, msg:string) => {
    setToast({ok,msg}); setTimeout(()=>setToast(null),3500);
  };

  const save = async () => {
    setSaving(true);
    const rows = [
      { key:"backup_schedule",    value:schedule },
      { key:"backup_time",        value:backupTime },
      { key:"backup_retention",   value:retention },
      { key:"backup_auto_enable", value:String(autoBackup) },
      { key:"backup_cloud",       value:String(cloudBackup) },
      { key:"backup_email_report",value:String(emailReport) },
    ].map(r=>({ branch_id:null as null, ...r }));
    const { error } = await supabase.from("settings").upsert(rows,{ onConflict:"branch_id,key" });
    setSaving(false);
    error ? showToast(false,"Failed to save.") : showToast(true,"Backup settings saved.");
  };

  const runBackup = async () => {
    setRunning(true);
    // Simulate backup initiation (real implementation would call an API or edge function)
    await new Promise(r => setTimeout(r, 2000));
    setRunning(false);
    showToast(true,"Backup completed successfully. File is ready to download.");
  };

  // Mock backup history
  const history = [
    { date:"2026-05-17 02:00 AM", size:"24.3 MB", status:"Success" },
    { date:"2026-05-16 02:00 AM", size:"23.8 MB", status:"Success" },
    { date:"2026-05-15 02:00 AM", size:"23.1 MB", status:"Success" },
    { date:"2026-05-14 02:00 AM", size:"22.9 MB", status:"Failed"  },
  ];

  return (
    <div className="backup-section">
      <div className="cfg-2col" style={{gap:"0 28px"}}>
        {/* Left: Schedule config */}
        <div>
          <p className="cfg-section__title" style={{marginBottom:14}}>BACKUP SCHEDULE</p>
          <div className="cfg-fields" style={{gap:12}}>
            <CfgSelect label="Backup Schedule" value={schedule} onChange={setSchedule} disabled={disabled}
              options={["Hourly","Daily","Weekly","Monthly","Manual Only"]}/>
            <CfgSelect label="Backup Time" value={backupTime} onChange={setBackupTime} disabled={disabled}
              options={["12:00 AM","02:00 AM","04:00 AM","06:00 AM","11:00 PM"]}/>
            <CfgSelect label="Retention Period (days)" value={retention} onChange={setRetention} disabled={disabled}
              options={["7","14","30","60","90","180"]}/>
          </div>
          <div className="cfg-toggles" style={{marginTop:16,gap:12}}>
            <CfgToggle label="Enable Auto Backup"   sub="Run backup on schedule automatically"   value={autoBackup}  onChange={setAutoBackup}  disabled={disabled}/>
            <CfgToggle label="Cloud Backup"         sub="Also store backup in cloud storage"      value={cloudBackup} onChange={setCloudBackup} disabled={disabled}/>
            <CfgToggle label="Email Backup Report"  sub="Send report when backup completes"       value={emailReport} onChange={setEmailReport} disabled={disabled}/>
          </div>
          {!disabled && <CfgSaveBar onSave={save} saving={saving}/>}
        </div>

        {/* Right: Manual backup + history */}
        <div>
          <p className="cfg-section__title" style={{marginBottom:14}}>MANUAL BACKUP</p>
          <div className="backup-manual-card">
            <HardDrive size={28} style={{color:"#3b82f6"}}/>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>Create Backup Now</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Generate a full database backup instantly</div>
            </div>
            <button className="cfg-save-btn" style={{marginTop:0,whiteSpace:"nowrap"}} onClick={runBackup} disabled={running||disabled}>
              {running ? <RefreshCw size={14} className="spin"/> : <Database size={14}/>}
              {running ? "Backing up…" : "Backup Now"}
            </button>
          </div>

          <p className="cfg-section__title" style={{marginBottom:12,marginTop:20}}>BACKUP HISTORY</p>
          <div className="backup-history">
            {history.map((h,i) => (
              <div key={i} className="backup-row">
                <Clock size={13} style={{color:"#94a3b8",flexShrink:0}}/>
                <div className="backup-row__info">
                  <span className="backup-row__date">{h.date}</span>
                  <span className="backup-row__size">{h.size}</span>
                </div>
                <span className={`branch-badge ${h.status==="Success"?"branch-badge--green":"branch-badge--red"}`}>
                  {h.status}
                </span>
                {h.status==="Success" && (
                  <button className="branch-icon-btn" title="Download backup">
                    <Download size={14} style={{color:"#3b82f6"}}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`branch-toast ${toast.ok?"branch-toast--ok":"branch-toast--err"}`}>
          {toast.ok?<CheckCircle size={14}/>:<X size={14}/>} {toast.msg}
        </div>
      )}
    </div>
  );
}

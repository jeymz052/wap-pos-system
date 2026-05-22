"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Archive, BarChart2, BookOpen, Building2,
  CheckCircle, ChevronRight, CreditCard, Database, Edit2,
  FileText, HardDrive, Info, RefreshCw, RotateCcw, Save,
  Settings, Shield, ShoppingCart, Trash2, Upload, Warehouse, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRbac } from "@/components/RbacProvider";
import PosSection          from "@/components/settings/PosSection";
import InventorySection    from "@/components/settings/InventorySection";
import PurchasingSection   from "@/components/settings/PurchasingSection";
import ReceivablesSection  from "@/components/settings/ReceivablesSection";
import PayablesSection     from "@/components/settings/PayablesSection";
import BranchSection       from "@/components/settings/BranchSection";
import BackupSection       from "@/components/settings/BackupSection";
import ImportExportSection from "@/components/settings/ImportExportSection";

type Toast = { id: number; ok: boolean; msg: string };
type ModuleId = "general"|"company"|"pos"|"inventory"|"purchasing"|"receivables"|"payables"|"system"|"branches"|"backup"|"importexport";

const MODULES: { id: ModuleId; icon: React.ElementType; color: string; bg: string; label: string; desc: string }[] = [
  { id:"general",     icon:Settings,     color:"#3b82f6", bg:"#eff6ff", label:"General Settings",     desc:"Basic system settings and preferences" },
  { id:"company",     icon:Building2,    color:"#8b5cf6", bg:"#f5f3ff", label:"Company Settings",     desc:"Company information, branches and business details" },
  { id:"pos",         icon:ShoppingCart, color:"#f59e0b", bg:"#fffbeb", label:"POS Settings",         desc:"POS, sales and receipt settings" },
  { id:"inventory",   icon:Warehouse,    color:"#10b981", bg:"#ecfdf5", label:"Inventory Settings",   desc:"Inventory, stock and warehouse preferences" },
  { id:"purchasing",  icon:Archive,      color:"#06b6d4", bg:"#ecfeff", label:"Purchasing Settings",  desc:"Purchase orders and supplier settings" },
  { id:"receivables", icon:BookOpen,     color:"#6366f1", bg:"#eef2ff", label:"Receivables Settings", desc:"Collections, credit terms and receivables" },
  { id:"payables",    icon:CreditCard,   color:"#ef4444", bg:"#fef2f2", label:"Payables Settings",    desc:"Payments, bills and payables settings" },
  { id:"system",      icon:Shield,       color:"#0ea5e9", bg:"#f0f9ff", label:"System Settings",      desc:"System preferences, security and maintenance" },
  { id:"branches",    icon:Building2,    color:"#0f766e", bg:"#f0fdfa", label:"Branch Settings",      desc:"Manage store branches and locations" },
  { id:"backup",      icon:HardDrive,    color:"#7c3aed", bg:"#f5f3ff", label:"Backup Settings",      desc:"Scheduled backups and data recovery" },
  { id:"importexport",icon:FileText,     color:"#b45309", bg:"#fffbeb", label:"Data Import / Export", desc:"Import and export CSV data for any module" },
];

function Sel({ label, value, onChange, options, disabled }:
  { label:string; value:string; onChange:(v:string)=>void; options:string[]; disabled?:boolean }) {
  return (
    <div className="cfg-field">
      <span className="cfg-field__label">{label}</span>
      <select className="cfg-field__select" value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
        {options.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Tog({ label, sub, value, onChange, disabled }:
  { label:string; sub?:string; value:boolean; onChange:(v:boolean)=>void; disabled?:boolean }) {
  return (
    <div className="cfg-toggle-row">
      <div className="cfg-toggle-row__text">
        <div><div className="cfg-toggle-row__label">{label}</div>{sub&&<div className="cfg-toggle-row__sub">{sub}</div>}</div>
      </div>
      <button type="button" className={`policy-toggle ${value?"policy-toggle--on":""}`}
        disabled={disabled} onClick={()=>onChange(!value)}><span className="policy-toggle__thumb"/></button>
    </div>
  );
}

function InfoRow({ label, value, editable, onChange }:
  { label:string; value:string; editable:boolean; onChange:(v:string)=>void }) {
  return (
    <div className="cfg-info-row">
      <span className="cfg-info-row__label">{label}</span>
      {editable
        ? <input className="cfg-info-row__input" value={value} onChange={e=>onChange(e.target.value)}/>
        : <span className="cfg-info-row__value">{value}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const { role } = useRbac();
  const isAdmin = role?.name==="super_admin"||role?.name==="admin";
  const [active, setActive] = useState<ModuleId>("general");
  const [saving,  setSaving]  = useState(false);
  const [toasts,  setToasts]  = useState<Toast[]>([]);
  const [tid,     setTid]     = useState(0);
  const [editCo,  setEditCo]  = useState(false);

  // General
  const [dateFormat,setDateFormat]=useState("MM DD, YYYY");
  const [currency,setCurrency]=useState("Philippine Peso (₱)");
  const [decPrec,setDecPrec]=useState("2");
  const [perPage,setPerPage]=useState("10");
  const [defDash,setDefDash]=useState("Dashboard v1");
  const [timeFormat,setTimeFormat]=useState("12 Hour (hh:mm A)");
  const [notif,setNotif]=useState(true);
  const [emailN,setEmailN]=useState(true);
  const [backup,setBackup]=useState(true);
  const [compress,setCompress]=useState(true);
  const [itemCode,setItemCode]=useState(false);
  const [audit,setAudit]=useState(true);
  // System
  const [lang,setLang]=useState("English");
  const [tz,setTz]=useState("(GMT+08:00) Asia/Manila");
  const [theme,setTheme]=useState("Light");
  const [sidebar,setSidebar]=useState("Gradient Dark");
  const [landing,setLanding]=useState("Dashboard");
  const [pwExp,setPwExp]=useState("90");
  const [minPw,setMinPw]=useState("8");
  const [twoFa,setTwoFa]=useState(true);
  const [sessT,setSessT]=useState("30");
  const [maxAt,setMaxAt]=useState("5");
  const [strongPw,setStrongPw]=useState(true);
  // Company
  const [coName,setCoName]=useState("WAP Motorparts Trading");
  const [bizName,setBizName]=useState("WAP Motorparts Trading");
  const [addr,setAddr]=useState("45 Industry St., Caloocan City, Metro Manila, Philippines");
  const [phone,setPhone]=useState("(02) 8674-1234");
  const [coEmail,setCoEmail]=useState("info@wapmotorparts.com");
  const [tin,setTin]=useState("103-456-789-000");
  const [fiscal,setFiscal]=useState("January 1");

  const toast = useCallback((ok:boolean,msg:string)=>{
    const id=tid+1; setTid(id);
    setToasts(t=>[...t,{id,ok,msg}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),4000);
  },[tid]);

  useEffect(()=>{
    supabase.from("settings").select("key,value").is("branch_id",null).then(({data})=>{
      if(!data) return;
      const m:Record<string,string>={};
      (data as {key:string;value:string}[]).forEach(r=>{m[r.key]=r.value;});
      if(m.session_timeout_minutes) setSessT(m.session_timeout_minutes);
      if(m.max_login_attempts) setMaxAt(m.max_login_attempts);
      if(m.password_expiry_days) setPwExp(m.password_expiry_days);
      if(m.password_min_length) setMinPw(m.password_min_length);
      if(m.require_2fa_for_admins) setTwoFa(m.require_2fa_for_admins!=="false");
      if(m.notif_enabled) setNotif(m.notif_enabled!=="false");
      if(m.auto_backup) setBackup(m.auto_backup!=="false");
      if(m.currency) setCurrency(m.currency);
      if(m.language) setLang(m.language);
      if(m.theme) setTheme(m.theme);
      if(m.date_format) setDateFormat(m.date_format);
      if(m.items_per_page) setPerPage(m.items_per_page);
    });
  },[]);

  const saveGeneral = async()=>{
    setSaving(true);
    const rows=[
      {key:"date_format",value:dateFormat},{key:"currency",value:currency},
      {key:"decimal_precision",value:decPrec},{key:"items_per_page",value:perPage},
      {key:"notif_enabled",value:String(notif)},{key:"email_notif",value:String(emailN)},
      {key:"auto_backup",value:String(backup)},{key:"compress_images",value:String(compress)},
      {key:"show_item_code",value:String(itemCode)},{key:"audit_trail",value:String(audit)},
    ].map(r=>({branch_id:null as null,...r}));
    const {error}=await supabase.from("settings").upsert(rows,{onConflict:"branch_id,key"});
    setSaving(false);
    error ? toast(false,"Failed to save.") : toast(true,"General settings saved.");
  };

  const saveSystem = async()=>{
    setSaving(true);
    const rows=[
      {key:"language",value:lang},{key:"timezone",value:tz},{key:"theme",value:theme},
      {key:"sidebar_style",value:sidebar},{key:"landing_page",value:landing},
      {key:"session_timeout_minutes",value:sessT},{key:"max_login_attempts",value:maxAt},
      {key:"password_expiry_days",value:pwExp},{key:"password_min_length",value:minPw},
    ].map(r=>({branch_id:null as null,...r}));
    const {error}=await supabase.from("settings").upsert(rows,{onConflict:"branch_id,key"});
    setSaving(false);
    error ? toast(false,"Failed to save.") : toast(true,"System settings saved.");
  };

  const saveCompany = async()=>{
    setSaving(true);
    const rows=[
      {key:"company_name",value:coName},{key:"business_name",value:bizName},
      {key:"address",value:addr},{key:"phone",value:phone},
      {key:"email",value:coEmail},{key:"tin",value:tin},{key:"fiscal_year_start",value:fiscal},
    ].map(r=>({branch_id:null as null,...r}));
    const {error}=await supabase.from("settings").upsert(rows,{onConflict:"branch_id,key"});
    setSaving(false);
    if(!error){setEditCo(false); toast(true,"Company info saved.");}
    else toast(false,"Failed to save.");
  };

  const activeModule = MODULES.find(m=>m.id===active)!;

  return (
    <div className="cfg-page">
      {/* Header */}
      <div className="cfg-page__header">
        <h2 className="cfg-page__title">Settings</h2>
        <p className="cfg-page__sub">Manage system configuration and preferences</p>
      </div>

      {/* Module tab cards */}
      <div className="cfg-cards">
        {MODULES.map(({id,icon:Icon,color,bg,label,desc})=>{
          const isActive = active===id;
          return (
            <div key={id}
              className={`cfg-card ${isActive?"cfg-card--active":""}`}
              style={isActive ? {borderColor:color, boxShadow:`0 0 0 2px ${color}22`} : {}}
              onClick={()=>setActive(id)}
            >
              <div className="cfg-card__icon" style={{background:isActive?color:bg}}>
                <Icon size={20} style={{color:isActive?"#fff":color}}/>
              </div>
              <div className="cfg-card__body">
                <span className="cfg-card__label" style={{color:isActive?color:"#0f172a"}}>{label}</span>
                <span className="cfg-card__desc">{desc}</span>
              </div>
              <ChevronRight size={14} className="cfg-card__arrow" style={{color:isActive?color:"#cbd5e1"}}/>
            </div>
          );
        })}
      </div>

      {/* Active section panel */}
      <div className="cfg-panel">
        {/* Panel header */}
        <div className="cfg-panel__header" style={{borderLeftColor:activeModule.color}}>
          <div className="cfg-panel__icon" style={{background:activeModule.bg}}>
            <activeModule.icon size={20} style={{color:activeModule.color}}/>
          </div>
          <div>
            <h3 className="cfg-panel__title">{activeModule.label}</h3>
            <p className="cfg-panel__desc">{activeModule.desc}</p>
          </div>
        </div>

        {/* Panel content */}
        <div className="cfg-panel__body">

          {/* ── GENERAL ── */}
          {active==="general" && (
            <div>
              <div className="cfg-2col">
                <div className="cfg-fields">
                  <Sel label="Date Format"        value={dateFormat}  onChange={setDateFormat}  disabled={!isAdmin} options={["MM DD, YYYY","DD/MM/YYYY","YYYY-MM-DD"]}/>
                  <Sel label="Time Format"         value={timeFormat}  onChange={setTimeFormat}  disabled={!isAdmin} options={["12 Hour (hh:mm A)","24 Hour (HH:mm)"]}/>
                  <Sel label="Currency"            value={currency}    onChange={setCurrency}    disabled={!isAdmin} options={["Philippine Peso (₱)","US Dollar ($)","Euro (€)"]}/>
                  <Sel label="Decimal Precision"   value={decPrec}     onChange={setDecPrec}     disabled={!isAdmin} options={["0","1","2","3"]}/>
                  <Sel label="Items per Page"      value={perPage}     onChange={setPerPage}     disabled={!isAdmin} options={["10","25","50","100"]}/>
                  <Sel label="Default Dashboard"   value={defDash}     onChange={setDefDash}     disabled={!isAdmin} options={["Dashboard v1","Dashboard v2"]}/>
                </div>
                <div className="cfg-toggles">
                  <Tog label="Enable Notifications"  sub="Show system notifications and alerts"        value={notif}    onChange={setNotif}    disabled={!isAdmin}/>
                  <Tog label="Email Notifications"   sub="Receive email notifications for events"      value={emailN}   onChange={setEmailN}   disabled={!isAdmin}/>
                  <Tog label="Auto Backup"            sub="Automatically backup system data daily"      value={backup}   onChange={setBackup}   disabled={!isAdmin}/>
                  <Tog label="Compress Images"        sub="Compress uploaded images to save storage"    value={compress} onChange={setCompress} disabled={!isAdmin}/>
                  <Tog label="Show Item Code"         sub="Show item code in sales transaction"         value={itemCode} onChange={setItemCode} disabled={!isAdmin}/>
                  <Tog label="Enable Audit Trail"     sub="Track user activities and changes"           value={audit}    onChange={setAudit}    disabled={!isAdmin}/>
                </div>
              </div>
              {isAdmin&&<SaveBar onSave={saveGeneral} saving={saving}/>}
            </div>
          )}

          {/* ── COMPANY ── */}
          {active==="company" && (
            <div>
              <div className="cfg-panel__edit-row">
                <span style={{fontSize:12,color:"#64748b"}}>Manage your business profile and contact information</span>
                {isAdmin&&<button className="cfg-edit-btn" onClick={()=>setEditCo(v=>!v)}>
                  {editCo?<X size={12}/>:<Edit2 size={12}/>}{editCo?"Cancel":"Edit"}
                </button>}
              </div>
              <div className="cfg-company-grid">
                <InfoRow label="Company Name"     value={coName}   editable={editCo} onChange={setCoName}/>
                <InfoRow label="Business Name"    value={bizName}  editable={editCo} onChange={setBizName}/>
                <InfoRow label="Address"          value={addr}     editable={editCo} onChange={setAddr}/>
                <InfoRow label="Phone"            value={phone}    editable={editCo} onChange={setPhone}/>
                <InfoRow label="Email"            value={coEmail}  editable={editCo} onChange={setCoEmail}/>
                <InfoRow label="TIN"              value={tin}      editable={editCo} onChange={setTin}/>
                <InfoRow label="Currency"         value={currency} editable={false}  onChange={()=>{}}/>
                <InfoRow label="Fiscal Year Start" value={fiscal}  editable={editCo} onChange={setFiscal}/>
              </div>
              <div className="cfg-logo-row">
                <span className="cfg-logo-row__label">Logo</span>
                <div className="cfg-logo-row__preview">
                  <div className="cfg-logo-row__placeholder"><Zap size={24} style={{color:"#3b82f6"}}/><span>WAP</span></div>
                  {editCo&&isAdmin&&<button className="cfg-logo-row__upload"><Upload size={12}/>Upload Logo</button>}
                </div>
              </div>
              {editCo&&isAdmin&&<SaveBar onSave={saveCompany} saving={saving}/>}
            </div>
          )}

          {/* ── POS ── */}
          {active==="pos" && <PosSection disabled={!isAdmin}/>}

          {/* ── INVENTORY ── */}
          {active==="inventory" && <InventorySection disabled={!isAdmin}/>}

          {/* ── PURCHASING ── */}
          {active==="purchasing" && <PurchasingSection disabled={!isAdmin}/>}

          {/* ── RECEIVABLES ── */}
          {active==="receivables" && <ReceivablesSection disabled={!isAdmin}/>}

          {/* ── PAYABLES ── */}
          {active==="payables" && <PayablesSection disabled={!isAdmin}/>}

          {/* ── BRANCHES ── */}
          {active==="branches" && <BranchSection disabled={!isAdmin}/>}

          {/* ── BACKUP ── */}
          {active==="backup" && <BackupSection disabled={!isAdmin}/>}

          {/* ── IMPORT / EXPORT ── */}
          {active==="importexport" && <ImportExportSection disabled={!isAdmin}/>}

          {/* ── SYSTEM ── */}
          {active==="system" && (
            <div>
              <div className="cfg-2col">
                <div>
                  <p className="cfg-section__title" style={{marginBottom:14}}>SYSTEM PREFERENCES</p>
                  <div className="cfg-fields">
                    <Sel label="Language"             value={lang}    onChange={setLang}    disabled={!isAdmin} options={["English","Filipino"]}/>
                    <Sel label="Timezone"             value={tz}      onChange={setTz}      disabled={!isAdmin} options={["(GMT+08:00) Asia/Manila","(GMT+00:00) UTC","(GMT-05:00) US/Eastern"]}/>
                    <Sel label="Theme"                value={theme}   onChange={setTheme}   disabled={!isAdmin} options={["Light","Dark","System"]}/>
                    <Sel label="Sidebar Style"        value={sidebar} onChange={setSidebar} disabled={!isAdmin} options={["Gradient Dark","Light","Minimal"]}/>
                    <Sel label="Default Landing Page" value={landing} onChange={setLanding} disabled={!isAdmin} options={["Dashboard","POS","Inventory","Reports"]}/>
                  </div>
                </div>
                <div>
                  <p className="cfg-section__title" style={{marginBottom:14}}>SECURITY SETTINGS</p>
                  <div className="cfg-security-grid">
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Password Expiration</span>
                      <select className="cfg-security-row__select" value={pwExp} onChange={e=>setPwExp(e.target.value)} disabled={!isAdmin}>
                        {["30","60","90","180","365"].map(v=><option key={v} value={v}>{v} days</option>)}
                      </select>
                    </div>
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Minimum Password Length</span>
                      <select className="cfg-security-row__select" value={minPw} onChange={e=>setMinPw(e.target.value)} disabled={!isAdmin}>
                        {["6","8","10","12"].map(v=><option key={v} value={v}>{v} characters</option>)}
                      </select>
                    </div>
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Two-Factor Authentication</span>
                      <span className={`cfg-badge ${twoFa?"cfg-badge--green":"cfg-badge--gray"}`}>{twoFa?"Enabled":"Disabled"}</span>
                    </div>
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Login Session Timeout</span>
                      <select className="cfg-security-row__select" value={sessT} onChange={e=>setSessT(e.target.value)} disabled={!isAdmin}>
                        {["15","30","60","120","240"].map(v=><option key={v} value={v}>{v} minutes</option>)}
                      </select>
                    </div>
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Maximum Login Attempts</span>
                      <select className="cfg-security-row__select" value={maxAt} onChange={e=>setMaxAt(e.target.value)} disabled={!isAdmin}>
                        {["3","5","10"].map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="cfg-security-row">
                      <span className="cfg-security-row__label">Require Strong Password</span>
                      <span className={`cfg-badge ${strongPw?"cfg-badge--green":"cfg-badge--gray"}`}>{strongPw?"Enabled":"Disabled"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Management */}
              <div style={{marginTop:24}}>
                <p className="cfg-section__title" style={{marginBottom:14}}>DATA MANAGEMENT</p>
                <div className="cfg-data-list">
                  {[
                    {icon:<Database size={16} style={{color:"#3b82f6"}}/>, label:"Backup Database",   sub:"Create a backup of your system data",       action:"Backup Now",   cls:"cfg-data-btn--blue"},
                    {icon:<Trash2   size={16} style={{color:"#f59e0b"}}/>, label:"Clear System Cache", sub:"Clear temporary cache and improve performance", action:"Clear Cache",  cls:"cfg-data-btn--blue"},
                    {icon:<FileText size={16} style={{color:"#8b5cf6"}}/>, label:"System Logs",        sub:"View and download system logs",              action:"View Logs",    cls:"cfg-data-btn--blue"},
                    {icon:<BarChart2 size={16}style={{color:"#10b981"}}/>, label:"Data Maintenance",   sub:"Optimize and repair system database",         action:"Optimize",     cls:"cfg-data-btn--blue"},
                    {icon:<RotateCcw size={16}style={{color:"#ef4444"}}/>, label:"Reset Preferences",  sub:"Reset all settings to default values",        action:"Reset",        cls:"cfg-data-btn--red"},
                  ].map(({icon,label,sub,action,cls})=>(
                    <div key={label} className="cfg-data-row">
                      <div className="cfg-data-row__icon">{icon}</div>
                      <div className="cfg-data-row__text">
                        <div className="cfg-data-row__label">{label}</div>
                        <div className="cfg-data-row__sub">{sub}</div>
                      </div>
                      <button className={`cfg-data-btn ${cls}`} onClick={()=>toast(true,`${label} initiated.`)}>{action}</button>
                    </div>
                  ))}
                </div>
              </div>
              {isAdmin&&<SaveBar onSave={saveSystem} saving={saving}/>}
            </div>
          )}
        </div>
      </div>

      {/* Notice bar */}
      <div className="cfg-notice-bar">
        <div className="cfg-notice-bar__left">
          <Info size={15} style={{color:"#3b82f6",flexShrink:0}}/>
          <div>
            <strong>Changes in settings are applied in real-time.</strong>
            <span> Some changes may require you to log out and log in again to take effect.</span>
          </div>
        </div>
        {isAdmin&&<button className="cfg-restore-btn" onClick={()=>toast(true,"Defaults restored.")}><RotateCcw size={12}/>Restore Defaults</button>}
      </div>

      {/* Toasts */}
      <div className="ur-toast-stack">
        {toasts.map(t=>(
          <div key={t.id} className={`ur-toast ${t.ok?"ur-toast--ok":"ur-toast--err"}`}>
            {t.ok?<CheckCircle size={14}/>:<AlertTriangle size={14}/>}<span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaveBar({ onSave, saving }: { onSave:()=>void; saving:boolean }) {
  return (
    <div className="cfg-save-bar">
      <button className="cfg-save-btn" onClick={onSave} disabled={saving}>
        {saving?<RefreshCw size={14} className="spin"/>:<Save size={14}/>}
        {saving?"Saving…":"Save Changes"}
      </button>
    </div>
  );
}

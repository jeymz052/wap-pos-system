"use client";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Download, FileText, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ExportModule = "products"|"customers"|"suppliers"|"sales"|"inventory"|"users";
type ImportModule = "products"|"customers"|"suppliers";

const EXPORT_MODULES: { id: ExportModule; label: string; desc: string }[] = [
  { id:"products",   label:"Products / Items",    desc:"All product catalog with prices and stock" },
  { id:"customers",  label:"Customers",           desc:"Customer list with contact details" },
  { id:"suppliers",  label:"Suppliers",           desc:"Supplier directory and terms" },
  { id:"sales",      label:"Sales Transactions",  desc:"Historical sales and receipts" },
  { id:"inventory",  label:"Inventory Stock",     desc:"Current stock levels per branch" },
  { id:"users",      label:"Users & Roles",       desc:"Staff accounts and role assignments" },
];

const IMPORT_MODULES: { id: ImportModule; label: string; table: string; requiredCols: string[] }[] = [
  { id:"products",  label:"Products",  table:"products",  requiredCols:["name","sku","price"] },
  { id:"customers", label:"Customers", table:"customers", requiredCols:["first_name","last_name","email"] },
  { id:"suppliers", label:"Suppliers", table:"suppliers", requiredCols:["name","contact_person"] },
];

export default function ImportExportSection({ disabled }: { disabled: boolean }) {
  const [exporting,    setExporting]    = useState<ExportModule|null>(null);
  const [importTarget, setImportTarget] = useState<ImportModule>("products");
  const [file,         setFile]         = useState<File|null>(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{inserted:number;skipped:number}|null>(null);
  const [toast,        setToast]        = useState<{ok:boolean;msg:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (ok:boolean, msg:string) => {
    setToast({ok,msg}); setTimeout(()=>setToast(null),4000);
  };

  const exportCSV = async (mod: ExportModule) => {
    setExporting(mod);
    const tableMap: Record<ExportModule, string> = {
      products:"products", customers:"customers", suppliers:"suppliers",
      sales:"sales_transactions", inventory:"inventory_items", users:"users",
    };
    const { data, error } = await supabase.from(tableMap[mod]).select("*").limit(5000);
    if (error || !data?.length) { setExporting(null); showToast(false,"No data to export or export failed."); return; }
    const keys = Object.keys(data[0]);
    const csv  = [keys.join(","), ...data.map(row => keys.map(k => {
      const v = (row as Record<string,unknown>)[k];
      return typeof v==="string" && v.includes(",") ? `"${v}"` : (v??"-");
    }).join(","))].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${mod}_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
    showToast(true,`${mod} exported successfully.`);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setImportResult(null);
  };

  const parseCSV = (text: string): Record<string,string>[] => {
    const [header, ...rows] = text.split("\n").filter(l=>l.trim());
    const cols = header.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    return rows.map(row => {
      const vals = row.split(",").map(v=>v.trim().replace(/^"|"$/g,""));
      return Object.fromEntries(cols.map((c,i)=>[c, vals[i]??""]));
    });
  };

  const importCSV = async () => {
    if (!file) { showToast(false,"Please select a CSV file first."); return; }
    const mod = IMPORT_MODULES.find(m=>m.id===importTarget)!;
    setImporting(true);
    setImportResult(null);
    const text = await file.text();
    const rows = parseCSV(text);
    const missing = mod.requiredCols.filter(c=>!Object.keys(rows[0]??{}).includes(c));
    if (missing.length) {
      setImporting(false);
      showToast(false,`Missing required columns: ${missing.join(", ")}`);
      return;
    }
    const { data:inserted, error } = await supabase.from(mod.table).upsert(rows,{ ignoreDuplicates:true }).select("id");
    setImporting(false);
    if (error) { showToast(false,`Import failed: ${error.message}`); return; }
    const result = { inserted: inserted?.length??0, skipped: rows.length-(inserted?.length??0) };
    setImportResult(result);
    showToast(true,`Imported ${result.inserted} records. ${result.skipped} skipped (duplicates).`);
    setFile(null);
    if (fileRef.current) fileRef.current.value="";
  };

  return (
    <div className="ie-section">
      <div className="cfg-2col" style={{gap:"0 28px",alignItems:"start"}}>

        {/* EXPORT */}
        <div>
          <p className="cfg-section__title" style={{marginBottom:14}}>EXPORT DATA</p>
          <p style={{fontSize:12,color:"#64748b",marginBottom:14}}>Download any module data as a CSV file.</p>
          <div className="ie-export-list">
            {EXPORT_MODULES.map(({id,label,desc})=>(
              <div key={id} className="ie-export-row">
                <div className="ie-export-row__icon"><FileText size={16} style={{color:"#3b82f6"}}/></div>
                <div className="ie-export-row__text">
                  <div className="ie-export-row__label">{label}</div>
                  <div className="ie-export-row__desc">{desc}</div>
                </div>
                <button
                  className="cfg-data-btn cfg-data-btn--blue"
                  disabled={exporting===id}
                  onClick={()=>exportCSV(id)}
                >
                  {exporting===id ? "…" : <><Download size={12}/>&nbsp;Export</>}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* IMPORT */}
        <div>
          <p className="cfg-section__title" style={{marginBottom:14}}>IMPORT DATA</p>
          <p style={{fontSize:12,color:"#64748b",marginBottom:14}}>Upload a CSV file to bulk-import records.</p>

          <div className="cfg-field" style={{marginBottom:12}}>
            <span className="cfg-field__label">Import Module</span>
            <select className="cfg-field__select" value={importTarget} onChange={e=>setImportTarget(e.target.value as ImportModule)} disabled={importing}>
              {IMPORT_MODULES.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="ie-required-cols">
            <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>Required columns: </span>
            {IMPORT_MODULES.find(m=>m.id===importTarget)?.requiredCols.map(c=>(
              <span key={c} className="ie-col-badge">{c}</span>
            ))}
          </div>

          <div className="ie-dropzone" onClick={()=>fileRef.current?.click()}>
            <Upload size={22} style={{color:"#3b82f6"}}/>
            <div className="ie-dropzone__label">
              {file ? file.name : "Click to select CSV file"}
            </div>
            <div className="ie-dropzone__sub">
              {file ? `${(file.size/1024).toFixed(1)} KB` : "Supports .csv files only"}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/>
          </div>

          {file && !disabled && (
            <button className="cfg-save-btn" style={{width:"100%",justifyContent:"center",marginTop:12}} onClick={importCSV} disabled={importing}>
              {importing ? "Importing…" : <><Upload size={14}/> Import Records</>}
            </button>
          )}

          {importResult && (
            <div className="ie-result">
              <CheckCircle size={15} style={{color:"#22c55e"}}/>
              <div>
                <div style={{fontWeight:700,fontSize:12.5,color:"#0f172a"}}>{importResult.inserted} records imported</div>
                <div style={{fontSize:11.5,color:"#64748b"}}>{importResult.skipped} skipped (duplicates or errors)</div>
              </div>
            </div>
          )}

          <div className="ie-note">
            <AlertTriangle size={13} style={{color:"#f59e0b",flexShrink:0}}/>
            <span>Importing will upsert records — existing rows with matching keys will be updated.</span>
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

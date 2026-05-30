"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Building2, CheckCircle, Edit2, Mail, MapPin, Phone, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  manager_name?: string | null;
  pricing_mode?: "global" | "branch_override";
  is_active: boolean;
}

export default function BranchSection({ disabled }: { disabled: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<Branch | null>(null);
  const [adding,   setAdding]   = useState(false);
  const [form,     setForm]     = useState({ name:"", code:"", address:"", phone:"", email:"", managerName:"", pricingMode:"global" as "global" | "branch_override" });
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ok:boolean;msg:string}|null>(null);

  const showToast = (ok:boolean, msg:string) => {
    setToast({ok,msg});
    setTimeout(()=>setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("branches").select("id,name,code,address,phone,email,manager_name,pricing_mode,is_active").order("name");
    setBranches((data ?? []) as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const openAdd = () => { setForm({name:"",code:"",address:"",phone:"",email:"",managerName:"",pricingMode:"global"}); setEditing(null); setAdding(true); };
  const openEdit = (b: Branch) => {
    setForm({
      name:b.name,
      code:b.code ?? "",
      address:b.address??"",
      phone:b.phone??"",
      email:b.email??"",
      managerName:b.manager_name??"",
      pricingMode:b.pricing_mode === "branch_override" ? "branch_override" : "global",
    });
    setEditing(b);
    setAdding(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) { showToast(false,"Branch name and code are required."); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("branches").update({
        name:form.name,
        code:form.code.trim().toUpperCase(),
        address:form.address,
        phone:form.phone,
        email:form.email,
        manager_name:form.managerName || null,
        pricing_mode:form.pricingMode,
        updated_at:new Date().toISOString(),
      }).eq("id", editing.id);
      if (error) showToast(false,"Failed to update branch."); else { showToast(true,"Branch updated."); setAdding(false); void load(); }
    } else {
      const { error } = await supabase.from("branches").insert({
        name:form.name,
        code:form.code.trim().toUpperCase(),
        address:form.address,
        phone:form.phone,
        email:form.email,
        manager_name:form.managerName || null,
        pricing_mode:form.pricingMode,
        is_active:true,
      });
      if (error) showToast(false,"Failed to create branch."); else { showToast(true,"Branch created."); setAdding(false); void load(); }
    }
    setSaving(false);
  };

  const toggleActive = async (b: Branch) => {
    await supabase.from("branches").update({ is_active:!b.is_active }).eq("id", b.id);
    void load();
  };

  const remove = async (b: Branch) => {
    if (!confirm(`Delete branch "${b.name}"?`)) return;
    const { error } = await supabase.from("branches").delete().eq("id", b.id);
    if (error) showToast(false,"Cannot delete — branch may have users assigned."); else { showToast(true,"Branch deleted."); void load(); }
  };

  return (
    <div className="branch-section">
      {/* Header row */}
      <div className="branch-section__toolbar">
        <span className="branch-section__count">{branches.length} branch{branches.length!==1?"es":""}</span>
        <Link className="branch-btn" href="/branches">
          <ArrowUpRight size={14}/> Open Workspace
        </Link>
        {!disabled && (
          <button className="branch-btn branch-btn--primary" onClick={openAdd}>
            <Plus size={14}/> Add Branch
          </button>
        )}
      </div>

      {/* Branch list */}
      {loading ? (
        <div className="branch-section__empty"><RefreshCw size={16} className="spin"/> Loading branches…</div>
      ) : branches.length===0 ? (
        <div className="branch-section__empty">No branches found. Add your first branch.</div>
      ) : (
        <div className="branch-list">
          {branches.map(b => (
            <div key={b.id} className={`branch-card ${b.is_active?"":"branch-card--inactive"}`}>
              <div className="branch-card__icon">
                <Building2 size={18} style={{color:"#3b82f6"}}/>
              </div>
              <div className="branch-card__body">
                <div className="branch-card__name">{b.name}</div>
                <div className="branch-card__meta"><strong>{b.code}</strong> {b.pricing_mode === "branch_override" ? "• Branch pricing" : "• Global pricing"}</div>
                {b.address && <div className="branch-card__meta"><MapPin size={11}/> {b.address}</div>}
                {b.phone   && <div className="branch-card__meta"><Phone size={11}/> {b.phone}</div>}
                {b.email   && <div className="branch-card__meta"><Mail size={11}/> {b.email}</div>}
                {b.manager_name && <div className="branch-card__meta">Manager: {b.manager_name}</div>}
              </div>
              <div className="branch-card__status">
                <span className={`branch-badge ${b.is_active?"branch-badge--green":"branch-badge--gray"}`}>
                  {b.is_active?"Active":"Inactive"}
                </span>
              </div>
              {!disabled && (
                <div className="branch-card__actions">
                  <button className="branch-icon-btn" onClick={()=>toggleActive(b)} title={b.is_active?"Deactivate":"Activate"}>
                    <CheckCircle size={14} style={{color:b.is_active?"#22c55e":"#94a3b8"}}/>
                  </button>
                  <button className="branch-icon-btn" onClick={()=>openEdit(b)} title="Edit"><Edit2 size={14}/></button>
                  <button className="branch-icon-btn branch-icon-btn--danger" onClick={()=>remove(b)} title="Delete"><Trash2 size={14}/></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {adding && (
        <div className="auth-modal__backdrop">
          <div className="auth-modal" style={{textAlign:"left"}}>
            <button className="auth-modal__close" onClick={()=>setAdding(false)}><X size={16}/></button>
            <h3 className="auth-modal__title" style={{textAlign:"center"}}>{editing?"Edit Branch":"Add New Branch"}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:16}}>
              <div className="cfg-field">
                <span className="cfg-field__label">Branch Name *</span>
                <input className="cfg-field__input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Main Branch"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Branch Code *</span>
                <input className="cfg-field__input" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="e.g. MAIN"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Address</span>
                <input className="cfg-field__input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Branch address"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Phone</span>
                <input className="cfg-field__input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="Branch phone number"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Email</span>
                <input className="cfg-field__input" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="branch@example.com"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Manager</span>
                <input className="cfg-field__input" value={form.managerName} onChange={e=>setForm(f=>({...f,managerName:e.target.value}))} placeholder="Branch manager"/>
              </div>
              <div className="cfg-field">
                <span className="cfg-field__label">Pricing Mode</span>
                <select className="cfg-field__select" value={form.pricingMode} onChange={e=>setForm(f=>({...f,pricingMode:e.target.value as "global" | "branch_override"}))}>
                  <option value="global">Global pricing</option>
                  <option value="branch_override">Branch override pricing</option>
                </select>
              </div>
              <button className="cfg-save-btn" style={{width:"100%",justifyContent:"center",marginTop:4}} onClick={save} disabled={saving}>
                {saving?<RefreshCw size={14} className="spin"/>:<Save size={14}/>}
                {saving?"Saving…":editing?"Update Branch":"Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline toast */}
      {toast && (
        <div className={`branch-toast ${toast.ok?"branch-toast--ok":"branch-toast--err"}`}>
          {toast.ok?<CheckCircle size={14}/>:<X size={14}/>} {toast.msg}
        </div>
      )}
    </div>
  );
}

'use client';

import TopBar from "@/components/TopBar";
import { Settings, Store, Receipt, Package, ShoppingCart, BookOpen, CreditCard, Shield } from "lucide-react";
const settingGroups = [
  { icon: Settings, label: "General Settings", desc: "Configure basic system settings and preferences", color: "#1e88e5" },
  { icon: Store, label: "Company Settings", desc: "Manage company information and business details", color: "#22c55e" },
  { icon: ShoppingCart, label: "POS Settings", desc: "Configure POS sales and receipt settings", color: "#f59e0b" },
  { icon: Package, label: "Inventory Settings", desc: "Manage inventory, stock and warehouse preferences", color: "#ef4444" },
  { icon: Receipt, label: "Purchasing Settings", desc: "Configure purchase orders and supplier settings", color: "#7c3aed" },
  { icon: BookOpen, label: "Receivables Settings", desc: "Manage collections, credit terms and receivables", color: "#0891b2" },
  { icon: CreditCard, label: "Payables Settings", desc: "Configure payments, bills and payables settings", color: "#dc2626" },
  { icon: Shield, label: "System Settings", desc: "System preferences, security and maintenance", color: "#059669" },
];
export default function SettingsPage() {
  return (
    <div className="page">
      <TopBar title="Settings" subtitle="Manage system configuration and preferences" />
      <div className="page-body">
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
          {settingGroups.map(g=>(
            <div key={g.label} style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:"20px",cursor:"pointer",transition:"box-shadow 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}
              onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)")}
              onMouseLeave={e=>(e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)")}>
              <div style={{width:44,height:44,borderRadius:11,background:g.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
                <g.icon size={20} color={g.color}/>
              </div>
              <div style={{fontWeight:700,fontSize:14,color:"#0b1f3a",marginBottom:6}}>{g.label}</div>
              <div style={{fontSize:12,color:"#6b7a8d",lineHeight:1.5}}>{g.desc}</div>
              <div style={{marginTop:12,fontSize:12,color:"#1e88e5",fontWeight:600}}>Configure →</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
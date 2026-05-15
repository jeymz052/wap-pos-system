import TopBar from "@/components/TopBar";
import { ClipboardList } from "lucide-react";
const features = ["Create purchase order","Select supplier","Auto-suggest low-stock items","PO approval workflow","Receive full or partial stock","Update inventory after receiving","Record supplier invoice","Attach invoice image/PDF","Supplier payment tracking","PO status tracking"];
export default function PurchasingPage() {
  return (
    <div className="page">
      <TopBar title="Purchasing" subtitle="Manage purchase orders and supplier transactions" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Purchases",v:"₱463,430",c:"blue"},{l:"Total POs",v:"28",c:"green"},{l:"Pending POs",v:"6",c:"orange"},{l:"Total Suppliers",v:"25",c:"purple"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><ClipboardList size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#dcfce7"}}><ClipboardList size={32} color="#22c55e"/></div>
          <h2>Purchase Orders & Stock Receiving</h2>
          <p>Create and manage purchase orders with approval workflows, partial receiving, and automatic inventory updates.</p>
          <span className="badge badge--green">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {features.map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
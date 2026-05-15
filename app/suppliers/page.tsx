import TopBar from "@/components/TopBar";
import { Truck } from "lucide-react";
export default function SuppliersPage() {
  return (
    <div className="page">
      <TopBar title="Suppliers" subtitle="Manage your suppliers and payables" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Suppliers",v:"38",c:"blue"},{l:"Total Payables",v:"₱468,750",c:"orange"},{l:"Current (0-30d)",v:"₱189,250",c:"green"},{l:"Overdue (60d+)",v:"₱86,400",c:"red"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><Truck size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#fef3c7"}}><Truck size={32} color="#f59e0b"/></div>
          <h2>Supplier Management</h2>
          <p>Manage supplier profiles, contact info, payment terms, purchase history, payable balances, and supplier performance.</p>
          <span className="badge badge--orange">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {["Supplier profile","Contact management","Payment terms","Product list per supplier","Purchase history","Payable balance","Supplier invoices","Supplier performance","Aging of payables","Supplier statement"].map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
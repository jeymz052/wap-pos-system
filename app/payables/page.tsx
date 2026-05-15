import TopBar from "@/components/TopBar";
import { CreditCard } from "lucide-react";
export default function PayablesPage() {
  return (
    <div className="page">
      <TopBar title="Payables" subtitle="Manage your supplier bills and payments" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Payables",v:"₱468,750",c:"blue"},{l:"Current (0-30d)",v:"₱189,250",c:"green"},{l:"Overdue (31-60d)",v:"₱132,800",c:"orange"},{l:"Overdue (90d+)",v:"₱60,300",c:"red"},{l:"Active Credit Suppliers",v:"38",c:"purple"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><CreditCard size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#fee2e2"}}><CreditCard size={32} color="#ef4444"/></div>
          <h2>Payables & Supplier Payments</h2>
          <p>Track outstanding supplier bills, record payments, and manage aging reports to keep supplier relationships healthy.</p>
          <span className="badge badge--red">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {["Supplier bill tracking","Partial payment","Payment history","Aging report","Due date alerts","Supplier statement","Quick pay widget","Payment methods"].map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
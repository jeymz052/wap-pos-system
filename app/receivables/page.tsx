import TopBar from "@/components/TopBar";
import { BookOpen } from "lucide-react";
export default function ReceivablesPage() {
  return (
    <div className="page">
      <TopBar title="Receivables" subtitle="Manage customer credit invoices and collections" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Receivables",v:"₱582,450",c:"blue"},{l:"Current (0-30d)",v:"₱312,250",c:"green"},{l:"Overdue (31-60d)",v:"₱128,900",c:"orange"},{l:"Overdue (90d+)",v:"₱56,800",c:"red"},{l:"Active Credit Customers",v:"125",c:"purple"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><BookOpen size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#dbeafe"}}><BookOpen size={32} color="#1e88e5"/></div>
          <h2>Receivables & Customer Credit</h2>
          <p>Track customer credit sales, manage outstanding balances, record collections, and generate statements of account.</p>
          <span className="badge badge--blue">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {["Sell on credit","Partial payment tracking","Payment history","Credit limit control","Due date alerts","Statement of account","Aging report","Overdue monitoring"].map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
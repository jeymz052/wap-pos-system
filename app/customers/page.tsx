import TopBar from "@/components/TopBar";
import { Users } from "lucide-react";
export default function CustomersPage() {
  return (
    <div className="page">
      <TopBar title="Customers" subtitle="Manage your customer database and credit accounts" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Customers",v:"1,245",c:"blue"},{l:"Credit Customers",v:"382",c:"green"},{l:"Total Credit Limit",v:"₱3,856,250",c:"orange"},{l:"Outstanding Balance",v:"₱1,245,780",c:"red"},{l:"New This Month",v:"25",c:"purple"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><Users size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#dcfce7"}}><Users size={32} color="#22c55e"/></div>
          <h2>Customer Management</h2>
          <p>Manage customer profiles, credit limits, purchase history, loyalty points, vehicle information, and warranty records.</p>
          <span className="badge badge--green">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {["Customer profile","Walk-in customer option","Credit limit control","Purchase history","Loyalty points","Vehicle information","Warranty records","Customer type classification","Statement of account","Aging of receivables"].map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
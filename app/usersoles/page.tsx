import TopBar from "@/components/TopBar";
import { UserCog } from "lucide-react";
export default function UsersRolesPage() {
  return (
    <div className="page">
      <TopBar title="Users & Roles" subtitle="Manage system users, roles and permissions" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Users",v:"18",c:"blue"},{l:"Active Users",v:"16",c:"green"},{l:"Inactive Users",v:"2",c:"orange"},{l:"Total Roles",v:"6",c:"purple"},{l:"Permissions",v:"142",c:"red"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><UserCog size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#ede9fe"}}><UserCog size={32} color="#7c3aed"/></div>
          <h2>Users & Role Management</h2>
          <p>Create staff accounts, assign roles, set branch access, configure permissions per module, and monitor user activity logs.</p>
          <span className="badge badge--blue">🚧 Module Under Development</span>
          <div style={{marginTop:32,textAlign:"left",maxWidth:480,margin:"32px auto 0"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#0b1f3a",marginBottom:12}}>Features included:</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
              {["Create staff account","Assign roles","Branch-level access","Permission matrix","Cashier PIN login","Activity logs","Sales restrictions","2FA for admins","Session management","Account lock policy"].map(f=><div key={f} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"#4a5568"}}><span style={{color:"#22c55e",fontWeight:700}}>✓</span>{f}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
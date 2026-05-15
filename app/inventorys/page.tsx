import TopBar from "@/components/TopBar";
import { Package } from "lucide-react";
const features = ["Add/edit/delete products","Product image upload","SKU & barcode","Compatible motorcycle models","Real-time stock deduction","Stock receiving","Stock adjustment","Stock transfer between branches","Low stock alerts","Inventory valuation","Barcode label printing","Shelf/bin location"];
export default function InventoryPage() {
  return (
    <div className="page">
      <TopBar title="Inventory" subtitle="Manage your stock items and inventory" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Items",v:"2,456",c:"blue"},{l:"In Stock",v:"2,189",c:"green"},{l:"Low Stock",v:"152",c:"orange"},{l:"Out of Stock",v:"115",c:"red"},{l:"Inventory Value",v:"₱1,245,780",c:"purple"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><Package size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div className="placeholder-card">
          <div className="placeholder-icon" style={{background:"#fef3c7"}}><Package size={32} color="#f59e0b"/></div>
          <h2>Inventory Management</h2>
          <p>Complete product and stock management with barcode support, compatibility mapping, and real-time stock tracking across branches.</p>
          <span className="badge badge--orange">🚧 Module Under Development</span>
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
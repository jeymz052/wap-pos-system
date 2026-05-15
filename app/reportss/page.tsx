'use client';

import TopBar from "@/components/TopBar";
import { BarChart2, TrendingUp, Package, DollarSign, FileText } from "lucide-react";
const reportGroups = [
  { title:"Sales Reports", icon: TrendingUp, color:"#1e88e5", bg:"#dbeafe", items:["Daily sales","Monthly sales","Sales by cashier","Sales by branch","Sales by category","Sales by brand","Discount report","Refund report"] },
  { title:"Inventory Reports", icon: Package, color:"#f59e0b", bg:"#fef3c7", items:["Current stock","Low stock","Out of stock","Inventory valuation","Stock movement","Fast-moving items","Slow-moving items","Dead stock"] },
  { title:"Financial Reports", icon: DollarSign, color:"#22c55e", bg:"#dcfce7", items:["Gross sales","Net sales","Gross profit","Expenses","Profit and loss","Supplier payables","Customer receivables","Cash drawer summary"] },
];
export default function ReportsPage() {
  return (
    <div className="page">
      <TopBar title="Reports" subtitle="View and analyze your business performance" />
      <div className="page-body">
        <div className="stats-row">
          {[{l:"Total Sales (Month)",v:"₱356,780",c:"blue"},{l:"Total Purchases",v:"₱468,750",c:"orange"},{l:"Gross Profit",v:"₱102,580",c:"green"},{l:"Net Profit",v:"₱76,320",c:"purple"},{l:"Total Receivables",v:"₱312,250",c:"red"}].map(s=>(
            <div key={s.l} className="stat-card">
              <div className={`stat-card__icon stat-card__icon--${s.c}`}><BarChart2 size={20}/></div>
              <div><div className="stat-card__label">{s.l}</div><div className="stat-card__value">{s.v}</div></div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:16}}>
          {reportGroups.map(g=>(
            <div key={g.title} className="table-card">
              <div className="table-card__header">
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:g.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <g.icon size={16} color={g.color}/>
                  </div>
                  <span className="table-card__title">{g.title}</span>
                </div>
                <span style={{fontSize:11,color:"#1e88e5",cursor:"pointer"}}>View All →</span>
              </div>
              <div style={{padding:"8px 0"}}>
                {g.items.map(item=>(
                  <div key={item} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 20px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",transition:"background 0.1s"}}
                    onMouseEnter={e=>(e.currentTarget.style.background="#f8fafc")}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <FileText size={13} color="#9aa3ae"/>
                      <span style={{fontSize:13}}>{item}</span>
                    </div>
                    <span style={{fontSize:11,color:"#1e88e5"}}>→</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
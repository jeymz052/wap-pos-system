'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import {
  TrendingUp, Package, DollarSign, FileText, Download, Printer,
  BarChart2, ArrowUpRight, ArrowDownRight, ChevronRight,
  ShoppingCart, RefreshCw, Calendar, Filter, FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

const PIE_COLORS = ['#1e88e5','#f59e0b','#22c55e','#a855f7','#ef4444','#64748b'];

type MonthlySale = { month: string; sales: number; purchases: number };
type CategorySale = { name: string; value: number };
type TopProduct = { sku: string; name: string; category: string; qty: number; total: number };
type PaymentBreakdown = { method: string; amount: number; pct: number };
type PnLRow = { label: string; amount: number; highlight?: boolean };

export default function ReportsClient() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<{id:string;name:string}[]>([]);
  const [branchId, setBranchId] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));

  // KPIs
  const [totalSales, setTotalSales] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [grossProfit, setGrossProfit] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [totalPayables, setTotalPayables] = useState(0);
  const [prevSales, setPrevSales] = useState(0);

  // Charts
  const [monthlySales, setMonthlySales] = useState<MonthlySale[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySale[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);
  const [pnl, setPnl] = useState<PnLRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(dateFrom).toISOString();
    const to = new Date(dateTo + 'T23:59:59').toISOString();

    // Previous period for comparison
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - diffMs).toISOString();
    const prevTo = from;

    let salesQ = supabase.from('sales').select('id,total_amount,subtotal,discount_amount,tax_amount,created_at,status').eq('status','completed').gte('created_at',from).lte('created_at',to);
    let prevSalesQ = supabase.from('sales').select('total_amount').eq('status','completed').gte('created_at',prevFrom).lte('created_at',prevTo);
    let poQ = supabase.from('purchase_orders').select('total_amount,created_at').not('status','in','(draft,cancelled)').gte('created_at',from).lte('created_at',to);

    if (branchId !== 'all') {
      salesQ = salesQ.eq('branch_id', branchId);
      prevSalesQ = prevSalesQ.eq('branch_id', branchId);
      poQ = poQ.eq('branch_id', branchId);
    }

    const [salesRes, prevSalesRes, poRes, recRes, payRes, branchRes] = await Promise.all([
      salesQ,
      prevSalesQ,
      poQ,
      supabase.from('receivables').select('balance').neq('status','paid'),
      supabase.from('suppliers').select('current_balance'),
      supabase.from('branches').select('id,name').eq('is_active',true),
    ]);

    setBranches(branchRes.data ?? []);

    const salesRows = salesRes.data ?? [];
    const poRows = poRes.data ?? [];
    const recRows = recRes.data ?? [];
    const payRows = payRes.data ?? [];

    const gs = salesRows.reduce((s,r) => s + Number(r.total_amount||0), 0);
    const tp = poRows.reduce((s,r) => s + Number(r.total_amount||0), 0);
    const costOfGoods = tp;
    const gp = gs - costOfGoods;
    const rec = recRows.reduce((s,r) => s + Number(r.balance||0), 0);
    const pay = payRows.reduce((s,r) => s + Number(r.current_balance||0), 0);
    const ps = (prevSalesRes.data??[]).reduce((s,r) => s + Number(r.total_amount||0), 0);

    // Expenses for net profit
    let expQ = supabase.from('expenses').select('amount').eq('status','approved').gte('expense_date',dateFrom).lte('expense_date',dateTo);
    if (branchId !== 'all') expQ = expQ.eq('branch_id', branchId);
    const expRes = await expQ;
    const expenses = (expRes.data??[]).reduce((s,r) => s + Number(r.amount||0), 0);
    const np = gp - expenses;

    setTotalSales(gs);
    setTotalPurchases(tp);
    setGrossProfit(gp);
    setNetProfit(np);
    setTotalReceivables(rec);
    setTotalPayables(pay);
    setPrevSales(ps);

    setPnl([
      { label: 'Total Sales', amount: gs },
      { label: 'Less: Cost of Sales', amount: costOfGoods },
      { label: 'Gross Profit', amount: gp, highlight: true },
      { label: 'Less: Operating Expenses', amount: expenses },
      { label: 'Net Profit', amount: np, highlight: true },
    ]);

    // Monthly trend (last 6 months)
    const months: MonthlySale[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleString('en-PH',{month:'short',year:'2-digit'});
      const mFrom = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const mTo = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59).toISOString();
      const [mSales, mPO] = await Promise.all([
        (branchId !== 'all'
          ? supabase.from('sales').select('total_amount').eq('status','completed').eq('branch_id',branchId).gte('created_at',mFrom).lte('created_at',mTo)
          : supabase.from('sales').select('total_amount').eq('status','completed').gte('created_at',mFrom).lte('created_at',mTo)),
        (branchId !== 'all'
          ? supabase.from('purchase_orders').select('total_amount').not('status','in','(draft,cancelled)').eq('branch_id',branchId).gte('created_at',mFrom).lte('created_at',mTo)
          : supabase.from('purchase_orders').select('total_amount').not('status','in','(draft,cancelled)').gte('created_at',mFrom).lte('created_at',mTo)),
      ]);
      months.push({
        month: label,
        sales: (mSales.data??[]).reduce((s,r) => s+Number(r.total_amount||0),0),
        purchases: (mPO.data??[]).reduce((s,r) => s+Number(r.total_amount||0),0),
      });
    }
    setMonthlySales(months);

    // Sales by category
    let saleItemsQ = supabase.from('sale_items').select('total_price, product:products(category:categories(name))');
    const saleIds = salesRows.map(r=>r.id);
    if (saleIds.length) {
      const catMap: Record<string,number> = {};
      const siRes = await (saleIds.length ? supabase.from('sale_items').select('total_price, products(categories(name))').in('sale_id', saleIds.slice(0,100)) : Promise.resolve({data:[]}));
      (siRes.data??[]).forEach((si: any) => {
        const cat = si.products?.categories?.name ?? 'Others';
        catMap[cat] = (catMap[cat]||0) + Number(si.total_price||0);
      });
      const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
      setCategorySales(sorted.map(([name,value])=>({name,value})));
    } else {
      setCategorySales([]);
    }

    // Top products
    if (saleIds.length) {
      const tpRes = await supabase.from('sale_items').select('product_id, quantity, total_price, products(name, sku, categories(name))').in('sale_id', saleIds.slice(0,200));
      const prodMap: Record<string,{name:string;sku:string;cat:string;qty:number;total:number}> = {};
      (tpRes.data??[]).forEach((si: any) => {
        const pid = si.product_id;
        if (!prodMap[pid]) prodMap[pid] = { name:si.products?.name??'', sku:si.products?.sku??'', cat:si.products?.categories?.name??'', qty:0, total:0 };
        prodMap[pid].qty += Number(si.quantity||0);
        prodMap[pid].total += Number(si.total_price||0);
      });
      const sorted = Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
      setTopProducts(sorted.map(p=>({sku:p.sku,name:p.name,category:p.cat,qty:p.qty,total:p.total})));
    } else {
      setTopProducts([]);
    }

    // Payment breakdown
    if (saleIds.length) {
      const pmRes = await supabase.from('sale_payments').select('payment_method, amount').in('sale_id', saleIds.slice(0,200));
      const pmMap: Record<string,number> = {};
      (pmRes.data??[]).forEach((p:any) => {
        const m = p.payment_method ?? 'cash';
        pmMap[m] = (pmMap[m]||0) + Number(p.amount||0);
      });
      const total = Object.values(pmMap).reduce((s,v)=>s+v,0);
      const breakdown = Object.entries(pmMap).map(([method,amount])=>({
        method: method.charAt(0).toUpperCase()+method.slice(1).replace('_',' '),
        amount,
        pct: total>0 ? (amount/total)*100 : 0,
      })).sort((a,b)=>b.amount-a.amount);
      setPaymentBreakdown(breakdown);
    } else {
      setPaymentBreakdown([]);
    }

    setLoading(false);
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const salesGrowth = prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : 0;

  const kpis = [
    { label:'Total Sales (This Month)', value:totalSales, icon:TrendingUp, color:'blue', growth:salesGrowth },
    { label:'Total Purchases (This Month)', value:totalPurchases, icon:ShoppingCart, color:'orange', growth:null },
    { label:'Gross Profit (This Month)', value:grossProfit, icon:BarChart2, color:'green', growth:grossProfit>0?((grossProfit/Math.max(totalSales,1))*100):null },
    { label:'Net Profit (This Month)', value:netProfit, icon:DollarSign, color:'purple', growth:null },
    { label:'Total Receivables', value:totalReceivables, icon:FileText, color:'teal', growth:null },
    { label:'Total Payables', value:totalPayables, icon:FileText, color:'red', growth:null },
  ];

  const reportCategories = [
    {
      title:'Sales Reports', icon:TrendingUp, color:'#1e88e5', bg:'rgba(30,136,229,0.1)',
      items:['Daily sales','Monthly sales','Sales by cashier','Sales by branch','Sales by category','Sales by brand','Sales by product','Sales by payment method','Discount report','Refund report'],
    },
    {
      title:'Inventory Reports', icon:Package, color:'#f59e0b', bg:'rgba(245,158,11,0.1)',
      items:['Current stock','Low stock','Out of stock','Inventory valuation','Stock movement','Stock adjustment','Fast-moving items','Slow-moving items','Dead stock'],
    },
    {
      title:'Financial Reports', icon:DollarSign, color:'#22c55e', bg:'rgba(34,197,94,0.1)',
      items:['Gross sales','Net sales','Gross profit','Expenses','Profit and loss','Supplier payables','Customer receivables','Cash drawer summary'],
    },
  ];

  return (
    <div className="rpt-page">
      {/* Toolbar */}
      <div className="rpt-toolbar">
        <div className="rpt-toolbar__filters">
          <div className="rpt-filter-group">
            <Calendar size={14} />
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="rpt-input" />
            <span style={{color:'#94a3b8',fontSize:12}}>–</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="rpt-input" />
          </div>
          <div className="rpt-filter-group">
            <Filter size={14} />
            <select value={branchId} onChange={e=>setBranchId(e.target.value)} className="rpt-input">
              <option value="all">All Branches</option>
              {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <button onClick={load} className="rpt-btn rpt-btn--primary" disabled={loading}>
            <RefreshCw size={13} className={loading?'rpt-spin':''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div className="rpt-toolbar__actions">
          <button className="rpt-btn rpt-btn--ghost"><Download size={13}/> Export PDF</button>
          <button className="rpt-btn rpt-btn--ghost"><FileSpreadsheet size={13}/> Excel</button>
          <button className="rpt-btn rpt-btn--ghost"><Printer size={13}/> Print</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rpt-kpis">
        {kpis.map(k => (
          <div key={k.label} className={`rpt-kpi rpt-kpi--${k.color}`}>
            <div className="rpt-kpi__icon"><k.icon size={18}/></div>
            <div className="rpt-kpi__body">
              <div className="rpt-kpi__label">{k.label}</div>
              <div className="rpt-kpi__value">{loading ? '—' : fmt(k.value)}</div>
              {k.growth !== null && (
                <div className={`rpt-kpi__growth ${k.growth>=0?'rpt-kpi__growth--up':'rpt-kpi__growth--down'}`}>
                  {k.growth>=0 ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
                  {pct(k.growth)} vs prev period
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="rpt-main-grid">
        {/* Sales Overview chart */}
        <div className="rpt-card rpt-card--chart" style={{gridColumn:'1/3'}}>
          <div className="rpt-card__header">
            <span className="rpt-card__title">Sales Overview</span>
            <span className="rpt-card__sub">Monthly Comparison</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlySales} margin={{top:8,right:16,left:0,bottom:0}}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e88e5" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#1e88e5" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{fontSize:11}} tickLine={false}/>
              <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false} tickFormatter={v=>'₱'+(v/1000).toFixed(0)+'k'}/>
              <Tooltip formatter={(v:unknown)=>fmt(Number(v))} contentStyle={{borderRadius:10,border:'1px solid #e2e8f0',fontSize:12}}/>
              <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              <Area type="monotone" dataKey="sales" name="Sales" stroke="#1e88e5" strokeWidth={2} fill="url(#gSales)"/>
              <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#22c55e" strokeWidth={2} fill="url(#gPurch)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Category */}
        <div className="rpt-card rpt-card--chart">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Sales by Category</span>
            <span className="rpt-card__link">View Full Report</span>
          </div>
          {categorySales.length > 0 ? (
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <PieChart width={150} height={150}>
                <Pie data={categorySales} cx={70} cy={70} innerRadius={44} outerRadius={68} paddingAngle={2} dataKey="value">
                  {categorySales.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v:unknown)=>fmt(Number(v))} contentStyle={{borderRadius:8,fontSize:11}}/>
              </PieChart>
              <div className="rpt-pie-legend">
                {categorySales.map((c,i)=>(
                  <div key={c.name} className="rpt-pie-legend__item">
                    <span className="rpt-pie-legend__dot" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                    <span className="rpt-pie-legend__name">{c.name}</span>
                    <span className="rpt-pie-legend__val">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rpt-empty">No data for selected period</div>
          )}
        </div>

        {/* Top Selling Items */}
        <div className="rpt-card">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Top Selling Items</span>
            <span className="rpt-card__link">View Full Report</span>
          </div>
          <table className="rpt-table">
            <thead><tr><th>#</th><th>SKU</th><th>Item Name</th><th>Category</th><th>Qty</th><th>Total Sales</th></tr></thead>
            <tbody>
              {topProducts.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',color:'#94a3b8',padding:16}}>No data</td></tr>}
              {topProducts.map((p,i)=>(
                <tr key={p.sku}>
                  <td>{i+1}</td>
                  <td><a className="rpt-link">{p.sku}</a></td>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.qty}</td>
                  <td>{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* P&L Summary */}
        <div className="rpt-card">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Profit &amp; Loss Summary</span>
            <span className="rpt-card__link">View Full Report</span>
          </div>
          <table className="rpt-table">
            <thead><tr><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {pnl.map(row=>(
                <tr key={row.label} className={row.highlight?'rpt-table__highlight':''}>
                  <td>{row.label}</td>
                  <td className={row.amount<0?'rpt-red':row.highlight?'rpt-blue':''}>{fmt(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sales by Payment Method */}
        <div className="rpt-card rpt-card--chart">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Sales by Payment Method</span>
          </div>
          {paymentBreakdown.length > 0 ? (
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <PieChart width={150} height={150}>
                <Pie data={paymentBreakdown} cx={70} cy={70} innerRadius={44} outerRadius={68} paddingAngle={2} dataKey="amount">
                  {paymentBreakdown.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v:unknown)=>fmt(Number(v))} contentStyle={{borderRadius:8,fontSize:11}}/>
              </PieChart>
              <div className="rpt-pie-legend">
                {paymentBreakdown.map((p,i)=>(
                  <div key={p.method} className="rpt-pie-legend__item">
                    <span className="rpt-pie-legend__dot" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                    <span className="rpt-pie-legend__name">{p.method}</span>
                    <span className="rpt-pie-legend__val">{fmt(p.amount)} <span style={{color:'#94a3b8'}}>({p.pct.toFixed(1)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rpt-empty">No data for selected period</div>
          )}
        </div>

        {/* Monthly Comparison Bar */}
        <div className="rpt-card rpt-card--chart">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Monthly Comparison</span>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={monthlySales} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="month" tick={{fontSize:10}} tickLine={false}/>
              <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false} tickFormatter={v=>'₱'+(v/1000).toFixed(0)+'k'}/>
              <Tooltip formatter={(v:unknown)=>fmt(Number(v))} contentStyle={{borderRadius:8,fontSize:11}}/>
              <Bar dataKey="sales" name="Sales" fill="#1e88e5" radius={[4,4,0,0]}/>
              <Bar dataKey="purchases" name="Purchases" fill="#22c55e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Reports Center */}
        <div className="rpt-card rpt-center-col">
          <div className="rpt-card__header">
            <span className="rpt-card__title">Reports Center</span>
          </div>
          <div className="rpt-center-list">
            {reportCategories.map(rc=>(
              <div key={rc.title} className="rpt-center-item">
                <div className="rpt-center-item__icon" style={{background:rc.bg}}>
                  <rc.icon size={15} color={rc.color}/>
                </div>
                <div className="rpt-center-item__body">
                  <div className="rpt-center-item__title">{rc.title}</div>
                  <div className="rpt-center-item__sub">View, filter and export reports</div>
                </div>
                <ChevronRight size={14} color="#94a3b8"/>
              </div>
            ))}
            <div className="rpt-center-item">
              <div className="rpt-center-item__icon" style={{background:'rgba(168,85,247,0.1)'}}>
                <FileText size={15} color="#a855f7"/>
              </div>
              <div className="rpt-center-item__body">
                <div className="rpt-center-item__title">Purchasing Reports</div>
                <div className="rpt-center-item__sub">Track purchases and supplier performance</div>
              </div>
              <ChevronRight size={14} color="#94a3b8"/>
            </div>
            <div className="rpt-center-item">
              <div className="rpt-center-item__icon" style={{background:'rgba(239,68,68,0.1)'}}>
                <FileText size={15} color="#ef4444"/>
              </div>
              <div className="rpt-center-item__body">
                <div className="rpt-center-item__title">Receivables Reports</div>
                <div className="rpt-center-item__sub">Analyze collections and customer balances</div>
              </div>
              <ChevronRight size={14} color="#94a3b8"/>
            </div>
          </div>
          <div className="rpt-actions">
            <button className="rpt-btn rpt-btn--primary"><Download size={12}/> Export Report</button>
            <button className="rpt-btn rpt-btn--ghost"><Printer size={12}/> Print Report</button>
            <button className="rpt-btn rpt-btn--ghost"><Calendar size={12}/> Schedule</button>
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="rpt-info-bar">
        <span className="rpt-info-dot"/>
        Reports are based on the selected date range. Use filters to customize your results.
      </div>
    </div>
  );
}

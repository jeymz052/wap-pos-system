"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PaymentBreakdown = { cash: number; gcash: number; card: number; bank: number; other: number };

export type StaffStat = { name: string; sales: number; transactions: number; initials: string };
export type BranchStat = { name: string; sales: number; profit: number };
export type TopProduct  = { name: string; qty: number; revenue: number; initials: string };
export type SlowProduct = { name: string; qty: number; daysSinceSale: number; initials: string };
export type LowStockItem = { name: string; qty: number; reorder: number; outOfStock: boolean; initials: string };
export type DailyPoint   = { label: string; sales: number; profit: number };
export type MonthlyPoint = { label: string; revenue: number };

export type DashboardData = {
  /* KPI Cards */
  todaySales: number;
  todayProfit: number;
  netSales: number;       // todaySales - returns/discounts (approx gross sales)
  grossProfit: number;    // month-to-date
  todayTransactions: number;
  totalTransactions: number; // MTD
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
  totalCustomers: number;
  pendingPOCount: number;
  totalExpensesMtd: number;

  /* Payment breakdown (today) */
  paymentBreakdown: PaymentBreakdown;

  /* Financial balances */
  customerCreditBalance: number;  // total open receivables
  supplierPayableBalance: number; // total open payables

  /* Charts */
  dailySales: DailyPoint[];     // last 14 days
  monthlySales: MonthlyPoint[]; // last 6 months

  /* Tables */
  topProducts: TopProduct[];
  slowProducts: SlowProduct[];
  lowStockItems: LowStockItem[];
  staffStats: StaffStat[];
  branchStats: BranchStat[];

  loaded: boolean;
  error: string;
};

const EMPTY: DashboardData = {
  todaySales: 0, todayProfit: 0, netSales: 0, grossProfit: 0,
  todayTransactions: 0, totalTransactions: 0, inventoryValue: 0,
  lowStockCount: 0, outOfStockCount: 0, totalProducts: 0,
  totalCustomers: 0, pendingPOCount: 0, totalExpensesMtd: 0,
  paymentBreakdown: { cash: 0, gcash: 0, card: 0, bank: 0, other: 0 },
  customerCreditBalance: 0, supplierPayableBalance: 0,
  dailySales: [], monthlySales: [], topProducts: [],
  slowProducts: [], lowStockItems: [], staffStats: [], branchStats: [],
  loaded: false, error: "",
};

function p(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return isFinite(n) ? n : 0; }
  return 0;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join("") || "??";
}

export function useDashboardData(branchId: string) {
  const [data, setData] = useState<DashboardData>(EMPTY);

  useEffect(() => {
    if (!branchId) return;
    let alive = true;

    async function load() {
      setData(prev => ({ ...prev, loaded: false, error: "" }));

      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        // 14-day window for daily chart
        const day14Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).toISOString();
        // 6-month window for monthly chart
        const month6Start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

        const [
          todaySalesRes, mtdSalesRes, allSalesChartRes,
          inventoryRes, productsRes,
          customersRes, suppliersRes,
          pendingPORes, receivablesRes, payablesRes,
          usersRes, branchesRes,
        ] = await Promise.all([
          supabase.from("sales").select("id,total_amount,payment_method,status,created_at,cashier_id")
            .eq("branch_id", branchId).eq("status", "completed")
            .gte("created_at", todayStart).lt("created_at", todayEnd),
          supabase.from("sales").select("id,total_amount,payment_method,status,created_at,cashier_id")
            .eq("branch_id", branchId).eq("status", "completed")
            .gte("created_at", monthStart).lt("created_at", monthEnd),
          supabase.from("sales").select("id,total_amount,created_at")
            .eq("branch_id", branchId).eq("status", "completed")
            .gte("created_at", month6Start).order("created_at"),
          supabase.from("inventory_stocks").select("product_id,quantity,cost_price")
            .eq("branch_id", branchId),
          supabase.from("products").select("id,name,reorder_level,critical_stock_level,selling_price,cost_price,is_active"),
          supabase.from("customers").select("id,current_balance,is_active").eq("is_active", true),
          supabase.from("suppliers").select("id,current_balance,is_active").eq("is_active", true),
          supabase.from("purchase_orders").select("id,status,total_amount,branch_id")
            .eq("branch_id", branchId).in("status", ["pending_approval", "approved", "ordered"]),
          supabase.from("receivables").select("balance").eq("branch_id", branchId).neq("status", "paid"),
          supabase.from("purchase_orders").select("paid_amount,total_amount")
            .eq("branch_id", branchId).neq("status", "cancelled").neq("status", "draft"),
          supabase.from("users").select("id,first_name,last_name,username,branch_id").eq("is_active", true),
          supabase.from("branches").select("id,name").eq("is_active", true),
        ]);

        if (!alive) return;

        // ── Today's sales ─────────────────────────────────────────────────────
        const todaySalesRows = (todaySalesRes.data ?? []) as Array<Record<string, unknown>>;
        const todaySales = todaySalesRows.reduce((s, r) => s + p(r.total_amount), 0);
        const todayTransactions = todaySalesRows.length;

        // Payment breakdown (today)
        const breakdown: PaymentBreakdown = { cash: 0, gcash: 0, card: 0, bank: 0, other: 0 };
        for (const r of todaySalesRows) {
          const method = String(r.payment_method ?? "").toLowerCase();
          const amt = p(r.total_amount);
          if (method === "cash") breakdown.cash += amt;
          else if (method.includes("gcash") || method.includes("ewallet")) breakdown.gcash += amt;
          else if (method === "card") breakdown.card += amt;
          else if (method.includes("bank")) breakdown.bank += amt;
          else breakdown.other += amt;
        }

        // ── MTD sales ─────────────────────────────────────────────────────────
        const mtdSalesRows = (mtdSalesRes.data ?? []) as Array<Record<string, unknown>>;
        const totalTransactions = mtdSalesRows.length;

        // Sale item cost for profit (fetch today's sale items)
        const todaySaleIds = todaySalesRows.map(r => r.id as string);
        const mtdSaleIds   = mtdSalesRows.map(r => r.id as string);

        const [todayItemsRes, mtdItemsRes, allSaleItemsRes] = await Promise.all([
          todaySaleIds.length
            ? supabase.from("sale_items").select("sale_id,product_id,quantity,total_price,cost_price,unit_price").in("sale_id", todaySaleIds)
            : Promise.resolve({ data: [] }),
          mtdSaleIds.length
            ? supabase.from("sale_items").select("sale_id,product_id,quantity,total_price,cost_price,unit_price").in("sale_id", mtdSaleIds)
            : Promise.resolve({ data: [] }),
          // For slow/top product detection — use last 30 days sale items
          (async () => {
            const past30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();
            const salesPast30 = await supabase.from("sales").select("id").eq("branch_id", branchId)
              .eq("status", "completed").gte("created_at", past30);
            const ids30 = ((salesPast30.data ?? []) as Array<{id:string}>).map(r => r.id);
            if (!ids30.length) return { data: [] };
            return supabase.from("sale_items").select("product_id,quantity,total_price,cost_price,unit_price,sale_id").in("sale_id", ids30);
          })(),
        ]);

        if (!alive) return;

        type SaleItem = { sale_id?: string; product_id: string; quantity: number; total_price: unknown; cost_price: unknown; unit_price: unknown };
        const todayItems = (todayItemsRes.data ?? []) as SaleItem[];
        const mtdItems   = (mtdItemsRes.data ?? []) as SaleItem[];
        const allItems30 = (allSaleItemsRes.data ?? []) as SaleItem[];

        // Profit calc
        const calcProfit = (items: SaleItem[]) =>
          items.reduce((s, i) => s + (p(i.total_price) - p(i.cost_price ?? i.unit_price) * i.quantity), 0);

        const todayProfit = calcProfit(todayItems);
        const grossProfit = calcProfit(mtdItems);

        // Inventory
        type InvRow = { product_id: string; quantity: number; cost_price?: unknown };
        const invRows = (inventoryRes.data ?? []) as InvRow[];
        type ProdRow = { id: string; name: string; reorder_level?: number | null; critical_stock_level?: number | null; selling_price?: unknown; cost_price?: unknown; is_active?: boolean | null };
        const prodRows = (productsRes.data ?? []) as ProdRow[];
        const prodMap  = new Map(prodRows.map(r => [r.id, r]));
        const invMap   = new Map(invRows.map(r => [r.product_id, r]));

        let inventoryValue = 0;
        let lowStockCount  = 0;
        let outOfStockCount = 0;
        const lowStockItems: LowStockItem[] = [];

        for (const inv of invRows) {
          const prod = prodMap.get(inv.product_id);
          const cost = p(inv.cost_price ?? prod?.cost_price);
          inventoryValue += inv.quantity * cost;

          const reorder = prod?.reorder_level ?? 0;
          const critical = prod?.critical_stock_level ?? 0;
          const threshold = Math.max(reorder, critical, 0);

          if (inv.quantity <= 0) outOfStockCount++;
          else if (threshold > 0 && inv.quantity <= threshold) {
            lowStockCount++;
            lowStockItems.push({
              name: prod?.name ?? "Unknown",
              qty: inv.quantity,
              reorder: threshold,
              outOfStock: inv.quantity <= 0,
              initials: initials(prod?.name ?? "Unknown"),
            });
          }
        }
        // Also count out-of-stock items not in inventory
        for (const prod of prodRows) {
          if (!invMap.has(prod.id)) outOfStockCount++;
        }

        lowStockItems.sort((a, b) => a.qty - b.qty);

        const totalProducts = prodRows.filter(r => r.is_active !== false).length;

        // Top selling
        const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const item of allItems30) {
          const prod = prodMap.get(item.product_id);
          const name = prod?.name ?? "Unknown";
          const cur = topMap.get(item.product_id) ?? { name, qty: 0, revenue: 0 };
          cur.qty += item.quantity;
          cur.revenue += p(item.total_price);
          topMap.set(item.product_id, cur);
        }
        const topProducts: TopProduct[] = Array.from(topMap.values())
          .sort((a, b) => b.revenue - a.revenue).slice(0, 8)
          .map(r => ({ ...r, initials: initials(r.name) }));

        // Slow moving — products with lowest qty sold in 30 days, but have stock
        const soldMap = new Map<string, number>();
        for (const item of allItems30) soldMap.set(item.product_id, (soldMap.get(item.product_id) ?? 0) + item.quantity);

        const slowProducts: SlowProduct[] = invRows
          .filter(inv => inv.quantity > 0)
          .map(inv => {
            const prod = prodMap.get(inv.product_id);
            const qtySold = soldMap.get(inv.product_id) ?? 0;
            return { name: prod?.name ?? "Unknown", qty: inv.quantity, daysSinceSale: qtySold === 0 ? 30 : Math.round(30 / qtySold), initials: initials(prod?.name ?? "Unknown") };
          })
          .sort((a, b) => a.daysSinceSale - b.daysSinceSale)
          .slice(-8).reverse();

        // ── Customers / Suppliers ─────────────────────────────────────────────
        const totalCustomers = (customersRes.data ?? []).length;
        const customerCreditBalance = ((receivablesRes.data ?? []) as Array<{balance:unknown}>)
          .reduce((s, r) => s + p(r.balance), 0);

        type PORow = { paid_amount: unknown; total_amount: unknown };
        const supplierPayableBalance = ((payablesRes.data ?? []) as PORow[])
          .reduce((s, r) => s + Math.max(0, p(r.total_amount) - p(r.paid_amount)), 0);

        const pendingPOCount = (pendingPORes.data ?? []).length;

        // ── Staff performance (MTD) ───────────────────────────────────────────
        type UserRow = { id: string; first_name?: string | null; last_name?: string | null; username?: string | null; branch_id?: string | null };
        const userRows = (usersRes.data ?? []) as UserRow[];
        const userMap  = new Map(userRows.map(r => [r.id, r]));

        const staffSalesMap = new Map<string, { sales: number; transactions: number }>();
        for (const row of mtdSalesRows) {
          const uid = String(row.cashier_id ?? "");
          if (!uid) continue;
          const cur = staffSalesMap.get(uid) ?? { sales: 0, transactions: 0 };
          cur.sales += p(row.total_amount);
          cur.transactions += 1;
          staffSalesMap.set(uid, cur);
        }

        const staffStats: StaffStat[] = Array.from(staffSalesMap.entries())
          .map(([uid, stat]) => {
            const u = userMap.get(uid);
            const fullName = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.username || "Staff";
            return { name: fullName, ...stat, initials: initials(fullName) };
          })
          .sort((a, b) => b.sales - a.sales).slice(0, 6);

        // ── Branch comparison (MTD) ────────────────────────────────────────────
        type BranchRow = { id: string; name: string };
        const branchRows = (branchesRes.data ?? []) as BranchRow[];

        // Fetch all branches' MTD sales in one go
        const allBranchSalesRes = await supabase.from("sales")
          .select("branch_id,total_amount")
          .eq("status", "completed")
          .gte("created_at", monthStart).lt("created_at", monthEnd)
          .in("branch_id", branchRows.map(b => b.id));

        type BranchSaleRow = { branch_id: string; total_amount: unknown };
        const allBranchSales = ((allBranchSalesRes.data ?? []) as BranchSaleRow[]);

        const branchSalesMap = new Map<string, number>();
        for (const row of allBranchSales) {
          branchSalesMap.set(row.branch_id, (branchSalesMap.get(row.branch_id) ?? 0) + p(row.total_amount));
        }

        const branchStats: BranchStat[] = branchRows.map(b => ({
          name: b.name,
          sales: branchSalesMap.get(b.id) ?? 0,
          profit: 0, // simplified
        })).sort((a, b) => b.sales - a.sales);

        // ── Daily chart (last 14 days) ─────────────────────────────────────────
        const daySales14 = await supabase.from("sales")
          .select("id,total_amount,created_at").eq("branch_id", branchId)
          .eq("status", "completed").gte("created_at", day14Start);

        const dayItemIds = ((daySales14.data ?? []) as Array<{id:string}>).map(r => r.id);
        const dayItemsRes = dayItemIds.length
          ? await supabase.from("sale_items").select("sale_id,total_price,cost_price,unit_price").in("sale_id", dayItemIds)
          : { data: [] };

        type DayItemRow = { sale_id: string; total_price: unknown; cost_price?: unknown; unit_price?: unknown };
        const dayItemsBySale = new Map<string, number>();
        for (const item of (dayItemsRes.data ?? []) as DayItemRow[]) {
          dayItemsBySale.set(item.sale_id, (dayItemsBySale.get(item.sale_id) ?? 0) + (p(item.total_price) - p(item.cost_price ?? item.unit_price)));
        }

        const daySalesMap = new Map<string, { sales: number; profit: number }>();
        for (const row of (daySales14.data ?? []) as Array<{id:string;total_amount:unknown;created_at:string}>) {
          const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(row.created_at));
          const cur = daySalesMap.get(label) ?? { sales: 0, profit: 0 };
          cur.sales += p(row.total_amount);
          cur.profit += dayItemsBySale.get(row.id) ?? 0;
          daySalesMap.set(label, cur);
        }
        // Build ordered 14-day array
        const dailySales: DailyPoint[] = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i);
          const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
          const found = daySalesMap.get(label) ?? { sales: 0, profit: 0 };
          return { label, ...found };
        });

        // ── Monthly chart (last 6 months) ─────────────────────────────────────
        type ChartRow = { total_amount: unknown; created_at: string };
        const chartRows = ((allSalesChartRes.data ?? []) as ChartRow[]);
        const monthMap = new Map<string, number>();
        for (const row of chartRows) {
          const label = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(row.created_at));
          monthMap.set(label, (monthMap.get(label) ?? 0) + p(row.total_amount));
        }
        const monthlySales: MonthlyPoint[] = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
          const label = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(d);
          return { label, revenue: monthMap.get(label) ?? 0 };
        });

        // ── Expenses MTD ──────────────────────────────────────────────────────
        const expenseRes = await supabase.from("expenses").select("amount")
          .eq("branch_id", branchId).gte("expense_date", monthStart).lt("expense_date", monthEnd);
        const totalExpensesMtd = ((expenseRes.data ?? []) as Array<{amount:unknown}>)
          .reduce((s, r) => s + p(r.amount), 0);

        if (!alive) return;

        setData({
          todaySales, todayProfit, netSales: todaySales,
          grossProfit, todayTransactions, totalTransactions,
          inventoryValue, lowStockCount, outOfStockCount,
          totalProducts, totalCustomers,
          pendingPOCount, totalExpensesMtd,
          paymentBreakdown: breakdown,
          customerCreditBalance, supplierPayableBalance,
          dailySales, monthlySales,
          topProducts, slowProducts,
          lowStockItems: lowStockItems.slice(0, 10),
          staffStats, branchStats,
          loaded: true, error: "",
        });
      } catch (err) {
        if (!alive) return;
        setData(prev => ({ ...prev, loaded: true, error: String(err) }));
      }
    }

    void load();
    return () => { alive = false; };
  }, [branchId]);

  return data;
}

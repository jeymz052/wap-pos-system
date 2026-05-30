"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PaymentBreakdown = { cash: number; gcash: number; card: number; bank: number; other: number };

export type StaffStat = {
  name: string;
  sales: number;
  netSales: number;
  profit: number;
  transactions: number;
  avgTicket: number;
  initials: string;
};

export type BranchStat = {
  id: string;
  name: string;
  sales: number;
  netSales: number;
  profit: number;
  transactions: number;
};

export type TopProduct = { name: string; qty: number; revenue: number; initials: string };
export type SlowProduct = { name: string; qty: number; daysSinceSale: number; initials: string };
export type LowStockItem = { name: string; qty: number; reorder: number; outOfStock: boolean; initials: string };
export type DailyPoint = { label: string; sales: number; profit: number };
export type MonthlyPoint = { label: string; revenue: number };

export type DashboardData = {
  todaySales: number;
  todayProfit: number;
  netSales: number;
  grossProfit: number;
  todayTransactions: number;
  totalTransactions: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalProducts: number;
  totalCustomers: number;
  pendingPOCount: number;
  pendingPOValue: number;
  totalExpensesMtd: number;
  paymentBreakdown: PaymentBreakdown;
  customerCreditBalance: number;
  supplierPayableBalance: number;
  dailySales: DailyPoint[];
  monthlySales: MonthlyPoint[];
  topProducts: TopProduct[];
  slowProducts: SlowProduct[];
  lowStockItems: LowStockItem[];
  staffStats: StaffStat[];
  branchStats: BranchStat[];
  loaded: boolean;
  error: string;
};

type SaleRow = {
  id: string;
  branch_id: string;
  cashier_id?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  total_amount?: number | string | null;
  created_at: string;
};

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity?: number | string | null;
  total_price?: number | string | null;
  cost_price?: number | string | null;
  unit_price?: number | string | null;
};

type PaymentRow = {
  sale_id: string;
  payment_method: string;
  amount?: number | string | null;
};

type ReturnRow = {
  sale_id?: string | null;
  branch_id?: string | null;
  status?: string | null;
  refund_amount?: number | string | null;
  store_credit?: number | string | null;
  created_at: string;
};

type InventoryRow = {
  product_id: string;
  quantity: number;
  cost_price?: number | string | null;
};

type ProductRow = {
  id: string;
  name: string;
  reorder_level?: number | null;
  critical_stock_level?: number | null;
  cost_price?: number | string | null;
  is_active?: boolean | null;
  status?: string | null;
};

type PurchaseOrderRow = {
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
};

type UserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

type BranchRow = {
  id: string;
  name: string;
};

const FINAL_REFUND_STATUSES = new Set(["refunded", "exchanged"]);

const EMPTY: DashboardData = {
  todaySales: 0,
  todayProfit: 0,
  netSales: 0,
  grossProfit: 0,
  todayTransactions: 0,
  totalTransactions: 0,
  inventoryValue: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  totalProducts: 0,
  totalCustomers: 0,
  pendingPOCount: 0,
  pendingPOValue: 0,
  totalExpensesMtd: 0,
  paymentBreakdown: { cash: 0, gcash: 0, card: 0, bank: 0, other: 0 },
  customerCreditBalance: 0,
  supplierPayableBalance: 0,
  dailySales: [],
  monthlySales: [],
  topProducts: [],
  slowProducts: [],
  lowStockItems: [],
  staffStats: [],
  branchStats: [],
  loaded: false,
  error: "",
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "??"
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function fetchChunked<T>(
  table: string,
  select: string,
  column: string,
  ids: string[],
  chunkSize = 100,
) {
  const rows: T[] = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const result = await supabase.from(table).select(select).in(column, chunk);
    if (result.error) throw result.error;
    rows.push(...((result.data ?? []) as T[]));
  }

  return rows;
}

function formatStaffName(user?: UserRow) {
  if (!user) return "Staff";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || "Staff";
}

function mapPaymentMethod(method: string) {
  const normalized = method.toLowerCase();
  if (normalized === "cash") return "cash" as const;
  if (normalized.includes("gcash") || normalized.includes("ewallet")) return "gcash" as const;
  if (normalized === "card") return "card" as const;
  if (normalized.includes("bank")) return "bank" as const;
  return "other" as const;
}

export function useDashboardData(branchId: string) {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!branchId) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setRefreshTick((value) => value + 1), 250);
    };

    const channel = supabase
      .channel(`dashboard-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_payments" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_stocks" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "receivables" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      void supabase.removeChannel(channel);
    };
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;

    let alive = true;

    async function load() {
      setData((prev) => ({ ...prev, loaded: false, error: "" }));

      try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const monthStart = startOfMonth(now);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const day14Start = new Date(todayStart);
        day14Start.setDate(day14Start.getDate() - 13);

        const day30Start = new Date(todayStart);
        day30Start.setDate(day30Start.getDate() - 29);

        const day90Start = new Date(todayStart);
        day90Start.setDate(day90Start.getDate() - 89);

        const month6Start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [
          currentBranchSalesRes,
          currentBranchReturnsRes,
          inventoryRes,
          productsRes,
          customersRes,
          pendingPORes,
          receivablesRes,
          payablesRes,
          usersRes,
          branchesRes,
          expensesRes,
          branchSalesRes,
          branchReturnsRes,
        ] = await Promise.all([
          supabase
            .from("sales")
            .select("id,branch_id,cashier_id,subtotal,discount_amount,total_amount,created_at")
            .eq("branch_id", branchId)
            .eq("status", "completed")
            .gte("created_at", month6Start.toISOString())
            .lt("created_at", tomorrowStart.toISOString())
            .order("created_at"),
          supabase
            .from("returns")
            .select("sale_id,branch_id,status,refund_amount,store_credit,created_at")
            .eq("branch_id", branchId)
            .gte("created_at", month6Start.toISOString())
            .lt("created_at", tomorrowStart.toISOString()),
          supabase.from("inventory_stocks").select("product_id,quantity,cost_price").eq("branch_id", branchId),
          supabase
            .from("products")
            .select("id,name,reorder_level,critical_stock_level,cost_price,is_active,status"),
          supabase.from("customers").select("id").eq("is_active", true),
          supabase
            .from("purchase_orders")
            .select("total_amount,paid_amount")
            .eq("branch_id", branchId)
            .in("status", ["pending_approval", "approved", "ordered"]),
          supabase.from("receivables").select("balance").eq("branch_id", branchId).gt("balance", 0),
          supabase
            .from("purchase_orders")
            .select("total_amount,paid_amount")
            .eq("branch_id", branchId)
            .neq("status", "cancelled")
            .neq("status", "draft"),
          supabase.from("users").select("id,first_name,last_name,username").eq("is_active", true),
          supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
          supabase
            .from("expenses")
            .select("amount")
            .eq("branch_id", branchId)
            .eq("status", "approved")
            .neq("expense_type", "supplier_payment")
            .gte("expense_date", monthStart.toISOString().slice(0, 10))
            .lt("expense_date", nextMonthStart.toISOString().slice(0, 10)),
          supabase
            .from("sales")
            .select("id,branch_id,subtotal,discount_amount,created_at")
            .eq("status", "completed")
            .gte("created_at", monthStart.toISOString())
            .lt("created_at", nextMonthStart.toISOString()),
          supabase
            .from("returns")
            .select("sale_id,branch_id,status,refund_amount,store_credit,created_at")
            .gte("created_at", monthStart.toISOString())
            .lt("created_at", nextMonthStart.toISOString()),
        ]);

        const firstError =
          currentBranchSalesRes.error ||
          currentBranchReturnsRes.error ||
          inventoryRes.error ||
          productsRes.error ||
          customersRes.error ||
          pendingPORes.error ||
          receivablesRes.error ||
          payablesRes.error ||
          usersRes.error ||
          branchesRes.error ||
          expensesRes.error ||
          branchSalesRes.error ||
          branchReturnsRes.error;

        if (firstError) throw firstError;
        if (!alive) return;

        const currentBranchSales = (currentBranchSalesRes.data ?? []) as SaleRow[];
        const currentBranchReturns = (currentBranchReturnsRes.data ?? []) as ReturnRow[];
        const branchSales = (branchSalesRes.data ?? []) as SaleRow[];
        const branchReturns = (branchReturnsRes.data ?? []) as ReturnRow[];
        const inventoryRows = (inventoryRes.data ?? []) as InventoryRow[];
        const productRows = (productsRes.data ?? []) as ProductRow[];
        const users = (usersRes.data ?? []) as UserRow[];
        const branchRows = (branchesRes.data ?? []) as BranchRow[];

        const currentSaleIds = currentBranchSales.map((sale) => sale.id);
        const branchSaleIds = branchSales.map((sale) => sale.id);
        const todaySaleIds = currentBranchSales
          .filter((sale) => sale.created_at >= todayStart.toISOString() && sale.created_at < tomorrowStart.toISOString())
          .map((sale) => sale.id);

        const [currentBranchItems, todayPayments, branchItems] = await Promise.all([
          currentSaleIds.length
            ? fetchChunked<SaleItemRow>(
                "sale_items",
                "sale_id,product_id,quantity,total_price,cost_price,unit_price",
                "sale_id",
                currentSaleIds,
              )
            : Promise.resolve([]),
          todaySaleIds.length
            ? fetchChunked<PaymentRow>("sale_payments", "sale_id,payment_method,amount", "sale_id", todaySaleIds)
            : Promise.resolve([]),
          branchSaleIds.length
            ? fetchChunked<SaleItemRow>(
                "sale_items",
                "sale_id,product_id,quantity,total_price,cost_price,unit_price",
                "sale_id",
                branchSaleIds,
              )
            : Promise.resolve([]),
        ]);

        if (!alive) return;

        const currentSaleMap = new Map(currentBranchSales.map((sale) => [sale.id, sale]));
        const userMap = new Map(users.map((user) => [user.id, user]));
        const productMap = new Map(productRows.map((product) => [product.id, product]));
        const inventoryMap = new Map(inventoryRows.map((row) => [row.product_id, row]));

        const itemCostBySaleId = new Map<string, number>();
        const productVelocity = new Map<string, { qty: number; revenue: number; lastSoldAt: string | null }>();

        for (const item of currentBranchItems) {
          const quantity = toNumber(item.quantity);
          const cost = toNumber(item.cost_price ?? item.unit_price) * quantity;
          const revenue = toNumber(item.total_price);

          itemCostBySaleId.set(item.sale_id, (itemCostBySaleId.get(item.sale_id) ?? 0) + cost);

          const sale = currentSaleMap.get(item.sale_id);
          if (!sale || sale.created_at < day90Start.toISOString()) continue;

          const current = productVelocity.get(item.product_id) ?? { qty: 0, revenue: 0, lastSoldAt: null };
          current.qty += quantity;
          current.revenue += revenue;
          if (!current.lastSoldAt || sale.created_at > current.lastSoldAt) current.lastSoldAt = sale.created_at;
          productVelocity.set(item.product_id, current);
        }

        const branchCostBySaleId = new Map<string, number>();
        for (const item of branchItems) {
          const quantity = toNumber(item.quantity);
          const cost = toNumber(item.cost_price ?? item.unit_price) * quantity;
          branchCostBySaleId.set(item.sale_id, (branchCostBySaleId.get(item.sale_id) ?? 0) + cost);
        }

        const refundBySaleId = new Map<string, number>();
        for (const row of currentBranchReturns) {
          if (!row.sale_id || !FINAL_REFUND_STATUSES.has(String(row.status ?? "").toLowerCase())) continue;
          const refundValue = toNumber(row.refund_amount) + toNumber(row.store_credit);
          refundBySaleId.set(row.sale_id, (refundBySaleId.get(row.sale_id) ?? 0) + refundValue);
        }

        const branchRefundBySaleId = new Map<string, number>();
        for (const row of branchReturns) {
          if (!row.sale_id || !FINAL_REFUND_STATUSES.has(String(row.status ?? "").toLowerCase())) continue;
          const refundValue = toNumber(row.refund_amount) + toNumber(row.store_credit);
          branchRefundBySaleId.set(row.sale_id, (branchRefundBySaleId.get(row.sale_id) ?? 0) + refundValue);
        }

        let todaySales = 0;
        let todayNetSales = 0;
        let todayProfit = 0;
        let todayTransactions = 0;
        let totalTransactions = 0;
        let grossProfit = 0;

        const staffMap = new Map<string, Omit<StaffStat, "name" | "initials">>();
        const dailyBuckets = new Map<string, { sales: number; profit: number }>();
        const monthlyBuckets = new Map<string, number>();

        for (const sale of currentBranchSales) {
          const gross = toNumber(sale.subtotal);
          const discount = toNumber(sale.discount_amount);
          const refund = refundBySaleId.get(sale.id) ?? 0;
          const costOfSales = itemCostBySaleId.get(sale.id) ?? 0;
          const net = gross - discount - refund;
          const profit = net - costOfSales;
          const createdAt = new Date(sale.created_at);

          if (sale.created_at >= monthStart.toISOString() && sale.created_at < nextMonthStart.toISOString()) {
            totalTransactions += 1;
            grossProfit += profit;

            const cashierId = sale.cashier_id ?? "";
            if (cashierId) {
              const current = staffMap.get(cashierId) ?? {
                sales: 0,
                netSales: 0,
                profit: 0,
                transactions: 0,
                avgTicket: 0,
              };
              current.sales += gross;
              current.netSales += net;
              current.profit += profit;
              current.transactions += 1;
              staffMap.set(cashierId, current);
            }
          }

          if (sale.created_at >= todayStart.toISOString() && sale.created_at < tomorrowStart.toISOString()) {
            todaySales += gross;
            todayNetSales += net;
            todayProfit += profit;
            todayTransactions += 1;
          }

          if (sale.created_at >= day14Start.toISOString()) {
            const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(createdAt);
            const bucket = dailyBuckets.get(label) ?? { sales: 0, profit: 0 };
            bucket.sales += net;
            bucket.profit += profit;
            dailyBuckets.set(label, bucket);
          }

          const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(createdAt);
          monthlyBuckets.set(monthLabel, (monthlyBuckets.get(monthLabel) ?? 0) + net);
        }

        const paymentBreakdown: PaymentBreakdown = { cash: 0, gcash: 0, card: 0, bank: 0, other: 0 };
        for (const payment of todayPayments) {
          const key = mapPaymentMethod(payment.payment_method);
          paymentBreakdown[key] += toNumber(payment.amount);
        }

        let inventoryValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        const lowStockItems: LowStockItem[] = [];

        const activeProducts = productRows.filter(
          (product) => product.is_active !== false && String(product.status ?? "active").toLowerCase() !== "inactive",
        );

        for (const product of activeProducts) {
          const inventory = inventoryMap.get(product.id);
          const quantity = inventory?.quantity ?? 0;
          const reorder = Math.max(
            Number(product.reorder_level ?? 0),
            Number(product.critical_stock_level ?? 0),
            0,
          );
          const costPrice = toNumber(inventory?.cost_price ?? product.cost_price);
          inventoryValue += quantity * costPrice;

          const outOfStock = quantity <= 0;
          const lowStock = !outOfStock && reorder > 0 && quantity <= reorder;
          if (!outOfStock && !lowStock) continue;

          if (outOfStock) outOfStockCount += 1;
          else lowStockCount += 1;

          lowStockItems.push({
            name: product.name,
            qty: quantity,
            reorder,
            outOfStock,
            initials: initials(product.name),
          });
        }

        lowStockItems.sort((left, right) => {
          if (left.outOfStock !== right.outOfStock) return left.outOfStock ? -1 : 1;
          return left.qty - right.qty;
        });

        const topProducts = Array.from(productVelocity.entries())
          .filter(([, value]) => value.lastSoldAt && value.lastSoldAt >= day30Start.toISOString())
          .map(([productId, value]) => ({
            name: productMap.get(productId)?.name ?? "Unknown",
            qty: value.qty,
            revenue: value.revenue,
            initials: initials(productMap.get(productId)?.name ?? "Unknown"),
            lastSoldAt: value.lastSoldAt ?? "",
          }))
          .sort((left, right) => right.revenue - left.revenue)
          .slice(0, 8)
          .map((product) => ({
            name: product.name,
            qty: product.qty,
            revenue: product.revenue,
            initials: product.initials,
          }));

        const slowProducts = activeProducts
          .map((product) => {
            const velocity = productVelocity.get(product.id);
            const quantity = inventoryMap.get(product.id)?.quantity ?? 0;
            const lastSoldAt = velocity?.lastSoldAt ? new Date(velocity.lastSoldAt) : null;
            const daysSinceSale = lastSoldAt
              ? Math.floor((todayStart.getTime() - startOfDay(lastSoldAt).getTime()) / (24 * 60 * 60 * 1000))
              : 90;

            return {
              name: product.name,
              qty: quantity,
              daysSinceSale,
              soldQty: velocity?.qty ?? 0,
              initials: initials(product.name),
            };
          })
          .filter((product) => product.qty > 0)
          .sort((left, right) => {
            if (right.daysSinceSale !== left.daysSinceSale) return right.daysSinceSale - left.daysSinceSale;
            return left.soldQty - right.soldQty;
          })
          .slice(0, 8)
          .map((product) => ({
            name: product.name,
            qty: product.qty,
            daysSinceSale: product.daysSinceSale,
            initials: product.initials,
          }));

        const totalCustomers = (customersRes.data ?? []).length;
        const customerCreditBalance = ((receivablesRes.data ?? []) as Array<{ balance: unknown }>).reduce(
          (sum, row) => sum + toNumber(row.balance),
          0,
        );

        const pendingPOValues = (pendingPORes.data ?? []) as PurchaseOrderRow[];
        const pendingPOCount = pendingPOValues.length;
        const pendingPOValue = pendingPOValues.reduce((sum, row) => sum + toNumber(row.total_amount), 0);

        const supplierPayableBalance = ((payablesRes.data ?? []) as PurchaseOrderRow[]).reduce(
          (sum, row) => sum + Math.max(0, toNumber(row.total_amount) - toNumber(row.paid_amount)),
          0,
        );

        const totalExpensesMtd = ((expensesRes.data ?? []) as Array<{ amount: unknown }>).reduce(
          (sum, row) => sum + toNumber(row.amount),
          0,
        );

        const staffStats: StaffStat[] = Array.from(staffMap.entries())
          .map(([userId, stat]) => {
            const name = formatStaffName(userMap.get(userId));
            return {
              name,
              sales: stat.sales,
              netSales: stat.netSales,
              profit: stat.profit,
              transactions: stat.transactions,
              avgTicket: stat.transactions > 0 ? stat.netSales / stat.transactions : 0,
              initials: initials(name),
            };
          })
          .sort((left, right) => right.netSales - left.netSales)
          .slice(0, 6);

        const branchCostLookup = branchCostBySaleId;
        const branchStatsMap = new Map<string, BranchStat>();
        for (const branch of branchRows) {
          branchStatsMap.set(branch.id, {
            id: branch.id,
            name: branch.name,
            sales: 0,
            netSales: 0,
            profit: 0,
            transactions: 0,
          });
        }

        for (const sale of branchSales) {
          const current = branchStatsMap.get(sale.branch_id);
          if (!current) continue;

          const gross = toNumber(sale.subtotal);
          const discount = toNumber(sale.discount_amount);
          const refund = branchRefundBySaleId.get(sale.id) ?? 0;
          const net = gross - discount - refund;
          const profit = net - (branchCostLookup.get(sale.id) ?? 0);

          current.sales += gross;
          current.netSales += net;
          current.profit += profit;
          current.transactions += 1;
        }

        const branchStats = Array.from(branchStatsMap.values()).sort((left, right) => right.netSales - left.netSales);

        const dailySales: DailyPoint[] = Array.from({ length: 14 }, (_, index) => {
          const date = new Date(day14Start);
          date.setDate(day14Start.getDate() + index);
          const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
          const bucket = dailyBuckets.get(label) ?? { sales: 0, profit: 0 };
          return { label, sales: bucket.sales, profit: bucket.profit };
        });

        const monthlySales: MonthlyPoint[] = Array.from({ length: 6 }, (_, index) => {
          const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
          const label = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date);
          return { label, revenue: monthlyBuckets.get(label) ?? 0 };
        });

        setData({
          todaySales,
          todayProfit,
          netSales: todayNetSales,
          grossProfit,
          todayTransactions,
          totalTransactions,
          inventoryValue,
          lowStockCount,
          outOfStockCount,
          totalProducts: activeProducts.length,
          totalCustomers,
          pendingPOCount,
          pendingPOValue,
          totalExpensesMtd,
          paymentBreakdown,
          customerCreditBalance,
          supplierPayableBalance,
          dailySales,
          monthlySales,
          topProducts,
          slowProducts,
          lowStockItems: lowStockItems.slice(0, 10),
          staffStats,
          branchStats,
          loaded: true,
          error: "",
        });
      } catch (error) {
        if (!alive) return;
        setData((prev) => ({ ...prev, loaded: true, error: String(error) }));
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [branchId, refreshTick]);

  return data;
}

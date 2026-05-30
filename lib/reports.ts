import { supabase } from "@/lib/supabase";

export type ReportGroup = "sales" | "inventory" | "financial";

export type ReportColumnType =
  | "text"
  | "currency"
  | "number"
  | "percent"
  | "date"
  | "datetime";

export type ReportColumn = {
  key: string;
  label: string;
  type?: ReportColumnType;
  align?: "left" | "right" | "center";
};

export type ReportRow = Record<string, string | number | null>;

export type ReportTable = {
  id: string;
  group: ReportGroup;
  title: string;
  description: string;
  scopeLabel: string;
  columns: ReportColumn[];
  rows: ReportRow[];
};

export type ReportMetric = {
  id: string;
  label: string;
  value: number;
  tone: "blue" | "green" | "orange" | "red" | "slate" | "violet";
  hint: string;
};

export type TrendPoint = {
  label: string;
  grossSales: number;
  netSales: number;
  grossProfit: number;
  refunds: number;
};

export type BreakdownPoint = {
  name: string;
  value: number;
};

export type ReportPreset = {
  id: string;
  name: string;
  description?: string | null;
  group_key: string;
  report_id: string;
  branch_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search_term?: string | null;
  filters?: Record<string, unknown> | null;
  is_shared?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ReportSchedule = {
  id: string;
  preset_id: string;
  preset_name?: string | null;
  group_key?: string | null;
  report_id?: string | null;
  name: string;
  branch_id?: string | null;
  branch_name?: string | null;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week?: number | null;
  day_of_month?: number | null;
  run_time: string;
  export_format: "pdf" | "xlsx" | "csv";
  delivery_channel: "download_center" | "email";
  recipients?: string[] | null;
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_by?: string | null;
  created_by_username?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ReportScheduleRun = {
  id: string;
  schedule_id: string;
  preset_id?: string | null;
  status: "completed" | "failed";
  export_format: "pdf" | "xlsx" | "csv";
  branch_id?: string | null;
  started_at: string;
  completed_at?: string | null;
  output_file_name?: string | null;
  output_metadata?: Record<string, unknown> | null;
  error_message?: string | null;
  triggered_by?: string | null;
};

export type ReportsAnalyticsData = {
  branches: Array<{ id: string; name: string }>;
  metrics: ReportMetric[];
  trends: {
    daily: TrendPoint[];
    monthly: TrendPoint[];
  };
  breakdowns: {
    payment: BreakdownPoint[];
    category: BreakdownPoint[];
    inventoryHealth: BreakdownPoint[];
  };
  reports: ReportTable[];
};

type BranchRow = { id: string; name: string };
type UserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};
type SaleRow = {
  id: string;
  invoice_number: string;
  branch_id: string;
  cashier_id: string;
  customer_id?: string | null;
  subtotal?: number | string | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  created_at: string;
};
type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number | string | null;
  unit_price?: number | string | null;
  discount_amount?: number | string | null;
  total_price?: number | string | null;
  cost_price?: number | string | null;
};
type PaymentRow = {
  sale_id: string;
  payment_method: string;
  amount?: number | string | null;
};
type ProductRow = {
  id: string;
  name: string;
  sku: string;
  reorder_level?: number | null;
  critical_stock_level?: number | null;
  cost_price?: number | string | null;
  selling_price?: number | string | null;
  status?: string | null;
  categories?: { name?: string | null } | null;
  brands?: { name?: string | null } | null;
};
type InventoryRow = {
  product_id: string;
  branch_id: string;
  quantity: number;
};
type ReturnRow = {
  id: string;
  return_number: string;
  branch_id: string;
  sale_id?: string | null;
  customer_name?: string | null;
  status: string;
  request_type?: string | null;
  refund_method?: string | null;
  refund_amount?: number | string | null;
  store_credit?: number | string | null;
  reason?: string | null;
  created_at: string;
  refunded_at?: string | null;
};
type StockMovementRow = {
  id: string;
  product_id: string;
  branch_id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
};
type StockAdjustmentRow = {
  id: string;
  branch_id: string;
  reason: string;
  notes?: string | null;
  status?: string | null;
  approved_by?: string | null;
  created_by?: string | null;
  created_at: string;
};
type StockAdjustmentItemRow = {
  stock_adjustment_id: string;
  product_id: string;
  quantity_before: number;
  quantity_after: number;
  difference: number;
  notes?: string | null;
};
type ExpenseRow = {
  id: string;
  branch_id: string;
  amount?: number | string | null;
  description: string;
  expense_date: string;
  payment_method?: string | null;
  status?: string | null;
  expense_type?: string | null;
  expense_categories?: { name?: string | null } | null;
};
type ReceivableRow = {
  invoice_number: string;
  customer_id: string;
  branch_id: string;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  balance?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  created_at: string;
  customers?: { name?: string | null; code?: string | null } | null;
};
type PurchaseOrderRow = {
  po_number: string;
  supplier_id: string;
  branch_id: string;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  created_at: string;
  suppliers?: { name?: string | null; code?: string | null } | null;
};
type CashShiftRow = {
  id: string;
  branch_id: string;
  cashier_id: string;
  status: string;
  shift_number?: string | null;
  starting_cash?: number | string | null;
  total_cash_sales?: number | string | null;
  total_noncash?: number | string | null;
  expected_cash?: number | string | null;
  actual_cash?: number | string | null;
  cash_difference?: number | string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  created_at: string;
};
type CashMovementRow = {
  shift_id: string;
  type: string;
  amount?: number | string | null;
};

const FINAL_REFUND_STATUSES = new Set(["refunded", "exchanged"]);

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatName(user?: UserRow | null) {
  if (!user) return "Unknown";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || "Unknown";
}

function titleCase(value: string | null | undefined) {
  return (value || "Unknown")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

export async function loadReportsAnalytics(filters: {
  branchId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const fromIso = new Date(`${filters.dateFrom}T00:00:00`).toISOString();
  const toIso = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  const asOfIso = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  const velocityFromIso = new Date(
    new Date(`${filters.dateTo}T23:59:59.999`).getTime() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let salesQuery = supabase
    .from("sales")
    .select("id,invoice_number,branch_id,cashier_id,customer_id,subtotal,discount_type,discount_value,discount_amount,tax_amount,total_amount,created_at")
    .eq("status", "completed")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  let returnsQuery = supabase
    .from("returns")
    .select("id,return_number,branch_id,sale_id,customer_name,status,request_type,refund_method,refund_amount,store_credit,reason,created_at,refunded_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  let inventoryQuery = supabase
    .from("inventory_stocks")
    .select("product_id,branch_id,quantity");

  let stockMovementsQuery = supabase
    .from("stock_movements")
    .select("id,product_id,branch_id,movement_type,quantity,quantity_before,quantity_after,reference_type,notes,created_by,created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  let stockAdjustmentsQuery = supabase
    .from("stock_adjustments")
    .select("id,branch_id,reason,notes,status,approved_by,created_by,created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  let expensesQuery = supabase
    .from("expenses")
    .select("id,branch_id,amount,description,expense_date,payment_method,status,expense_type,expense_categories(name)")
    .gte("expense_date", filters.dateFrom)
    .lte("expense_date", filters.dateTo);

  let receivablesQuery = supabase
    .from("receivables")
    .select("invoice_number,customer_id,branch_id,total_amount,paid_amount,balance,due_date,status,created_at,customers(name,code)")
    .lte("created_at", asOfIso);

  let purchaseOrdersQuery = supabase
    .from("purchase_orders")
    .select("po_number,supplier_id,branch_id,total_amount,paid_amount,status,created_at,suppliers(name,code)")
    .lte("created_at", asOfIso)
    .neq("status", "cancelled")
    .neq("status", "draft");

  let shiftsQuery = supabase
    .from("cash_shifts")
    .select("id,branch_id,cashier_id,status,shift_number,starting_cash,total_cash_sales,total_noncash,expected_cash,actual_cash,cash_difference,opened_at,closed_at,created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  let velocitySalesQuery = supabase
    .from("sales")
    .select("id,created_at")
    .eq("status", "completed")
    .gte("created_at", velocityFromIso)
    .lte("created_at", toIso);

  if (filters.branchId !== "all") {
    salesQuery = salesQuery.eq("branch_id", filters.branchId);
    returnsQuery = returnsQuery.eq("branch_id", filters.branchId);
    inventoryQuery = inventoryQuery.eq("branch_id", filters.branchId);
    stockMovementsQuery = stockMovementsQuery.eq("branch_id", filters.branchId);
    stockAdjustmentsQuery = stockAdjustmentsQuery.eq("branch_id", filters.branchId);
    expensesQuery = expensesQuery.eq("branch_id", filters.branchId);
    receivablesQuery = receivablesQuery.eq("branch_id", filters.branchId);
    purchaseOrdersQuery = purchaseOrdersQuery.eq("branch_id", filters.branchId);
    shiftsQuery = shiftsQuery.eq("branch_id", filters.branchId);
    velocitySalesQuery = velocitySalesQuery.eq("branch_id", filters.branchId);
  }

  const [
    branchesResult,
    usersResult,
    salesResult,
    returnsResult,
    productsResult,
    inventoryResult,
    stockMovementsResult,
    stockAdjustmentsResult,
    expensesResult,
    receivablesResult,
    purchaseOrdersResult,
    shiftsResult,
    velocitySalesResult,
  ] = await Promise.all([
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("users").select("id,first_name,last_name,username").eq("is_active", true),
    salesQuery,
    returnsQuery,
    supabase
      .from("products")
      .select("id,name,sku,reorder_level,critical_stock_level,cost_price,selling_price,status,categories(name),brands(name)")
      .neq("status", "inactive"),
    inventoryQuery,
    stockMovementsQuery,
    stockAdjustmentsQuery,
    expensesQuery,
    receivablesQuery,
    purchaseOrdersQuery,
    shiftsQuery,
    velocitySalesQuery,
  ]);

  const firstError =
    branchesResult.error ||
    usersResult.error ||
    salesResult.error ||
    returnsResult.error ||
    productsResult.error ||
    inventoryResult.error ||
    stockMovementsResult.error ||
    stockAdjustmentsResult.error ||
    expensesResult.error ||
    receivablesResult.error ||
    purchaseOrdersResult.error ||
    shiftsResult.error ||
    velocitySalesResult.error;

  if (firstError) throw firstError;

  const branches = (branchesResult.data ?? []) as BranchRow[];
  const users = (usersResult.data ?? []) as UserRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const returnsRows = (returnsResult.data ?? []) as ReturnRow[];
  const products = (productsResult.data ?? []) as ProductRow[];
  const inventory = (inventoryResult.data ?? []) as InventoryRow[];
  const stockMovements = (stockMovementsResult.data ?? []) as StockMovementRow[];
  const stockAdjustments = (stockAdjustmentsResult.data ?? []) as StockAdjustmentRow[];
  const expenses = (expensesResult.data ?? []) as ExpenseRow[];
  const receivables = (receivablesResult.data ?? []) as ReceivableRow[];
  const purchaseOrders = (purchaseOrdersResult.data ?? []) as PurchaseOrderRow[];
  const shifts = (shiftsResult.data ?? []) as CashShiftRow[];
  const velocitySales = (velocitySalesResult.data ?? []) as Array<{ id: string; created_at: string }>;

  const saleIds = sales.map((item) => item.id);
  const shiftIds = shifts.map((item) => item.id);
  const adjustmentIds = stockAdjustments.map((item) => item.id);
  const velocitySaleIds = velocitySales.map((item) => item.id);

  const [saleItems, salePayments, cashMovements, adjustmentItems, velocityItems] = await Promise.all([
    saleIds.length
      ? fetchChunked<SaleItemRow>(
          "sale_items",
          "sale_id,product_id,quantity,unit_price,discount_amount,total_price,cost_price",
          "sale_id",
          saleIds,
        )
      : Promise.resolve([]),
    saleIds.length
      ? fetchChunked<PaymentRow>("sale_payments", "sale_id,payment_method,amount", "sale_id", saleIds)
      : Promise.resolve([]),
    shiftIds.length
      ? fetchChunked<CashMovementRow>("cash_movements", "shift_id,type,amount", "shift_id", shiftIds)
      : Promise.resolve([]),
    adjustmentIds.length
      ? fetchChunked<StockAdjustmentItemRow>(
          "stock_adjustment_items",
          "stock_adjustment_id,product_id,quantity_before,quantity_after,difference,notes",
          "stock_adjustment_id",
          adjustmentIds,
        )
      : Promise.resolve([]),
    velocitySaleIds.length
      ? fetchChunked<SaleItemRow>(
          "sale_items",
          "sale_id,product_id,quantity,total_price,cost_price",
          "sale_id",
          velocitySaleIds,
        )
      : Promise.resolve([]),
  ]);

  const branchMap = new Map(branches.map((branch) => [branch.id, branch.name]));
  const userMap = new Map(users.map((user) => [user.id, formatName(user)]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const saleMap = new Map(sales.map((sale) => [sale.id, sale]));
  const velocitySaleMap = new Map(velocitySales.map((sale) => [sale.id, sale.created_at]));

  const saleItemsBySale = new Map<string, SaleItemRow[]>();
  const qtyBySaleId = new Map<string, number>();
  const costBySaleId = new Map<string, number>();
  const profitBySaleId = new Map<string, number>();

  for (const item of saleItems) {
    const list = saleItemsBySale.get(item.sale_id) ?? [];
    list.push(item);
    saleItemsBySale.set(item.sale_id, list);

    const quantity = toNumber(item.quantity);
    const cost = toNumber(item.cost_price) * quantity;
    const gross = toNumber(item.total_price);

    qtyBySaleId.set(item.sale_id, (qtyBySaleId.get(item.sale_id) ?? 0) + quantity);
    costBySaleId.set(item.sale_id, (costBySaleId.get(item.sale_id) ?? 0) + cost);
    profitBySaleId.set(item.sale_id, (profitBySaleId.get(item.sale_id) ?? 0) + (gross - cost));
  }

  const refundBySaleId = new Map<string, number>();
  const refundsByDay = new Map<string, number>();

  for (const item of returnsRows) {
    const value = toNumber(item.refund_amount) + toNumber(item.store_credit);
    if (FINAL_REFUND_STATUSES.has(item.status)) {
      if (item.sale_id) {
        refundBySaleId.set(item.sale_id, (refundBySaleId.get(item.sale_id) ?? 0) + value);
      }
      const dayKey = item.created_at.slice(0, 10);
      refundsByDay.set(dayKey, (refundsByDay.get(dayKey) ?? 0) + value);
    }
  }

  const velocityByProduct = new Map<
    string,
    { qty: number; revenue: number; cost: number; lastSoldAt: string | null }
  >();

  for (const item of velocityItems) {
    const saleCreatedAt = velocitySaleMap.get(item.sale_id);
    const current = velocityByProduct.get(item.product_id) ?? {
      qty: 0,
      revenue: 0,
      cost: 0,
      lastSoldAt: null,
    };
    current.qty += toNumber(item.quantity);
    current.revenue += toNumber(item.total_price);
    current.cost += toNumber(item.cost_price) * toNumber(item.quantity);
    if (!current.lastSoldAt || (saleCreatedAt && saleCreatedAt > current.lastSoldAt)) {
      current.lastSoldAt = saleCreatedAt ?? current.lastSoldAt;
    }
    velocityByProduct.set(item.product_id, current);
  }

  const inventoryRows = inventory.map((row) => {
    const product = productMap.get(row.product_id);
    const branchName = branchMap.get(row.branch_id) ?? "Unknown";
    const reorderLevel = Math.max(
      Number(product?.reorder_level ?? 0),
      Number(product?.critical_stock_level ?? 0),
      0,
    );
    const quantity = Number(row.quantity ?? 0);
    const costPrice = toNumber(product?.cost_price);
    const sellingPrice = toNumber(product?.selling_price);
    const stockStatus =
      quantity <= 0 ? "Out of Stock" : reorderLevel > 0 && quantity <= reorderLevel ? "Low Stock" : "In Stock";

    return {
      productId: row.product_id,
      product: product?.name ?? "Unknown",
      sku: product?.sku ?? "-",
      branchId: row.branch_id,
      branch: branchName,
      category: product?.categories?.name ?? "Uncategorized",
      brand: product?.brands?.name ?? "Unbranded",
      quantity,
      reorderLevel,
      stockStatus,
      costPrice,
      sellingPrice,
      costValue: quantity * costPrice,
      retailValue: quantity * sellingPrice,
    };
  });

  const dailyMap = new Map<
    string,
    {
      date: string;
      transactions: number;
      grossSales: number;
      discounts: number;
      tax: number;
      netSales: number;
      grossProfit: number;
      itemsSold: number;
    }
  >();
  const monthlyMap = new Map<
    string,
    {
      month: string;
      transactions: number;
      grossSales: number;
      discounts: number;
      tax: number;
      netSales: number;
      grossProfit: number;
      itemsSold: number;
    }
  >();
  const cashierMap = new Map<string, ReportRow>();
  const salesBranchMap = new Map<string, ReportRow>();
  const categoryMap = new Map<string, ReportRow>();
  const brandMap = new Map<string, ReportRow>();
  const productSalesMap = new Map<string, ReportRow>();

  for (const sale of sales) {
    const grossSales = toNumber(sale.subtotal);
    const discount = toNumber(sale.discount_amount);
    const tax = toNumber(sale.tax_amount);
    const refund = refundBySaleId.get(sale.id) ?? 0;
    const netSales = grossSales - discount - refund;
    const grossProfit = (profitBySaleId.get(sale.id) ?? 0) - refund;
    const itemsSold = qtyBySaleId.get(sale.id) ?? 0;
    const branchName = branchMap.get(sale.branch_id) ?? "Unknown";
    const cashierName = userMap.get(sale.cashier_id) ?? "Unknown";

    const dayKey = sale.created_at.slice(0, 10);
    const daily = dailyMap.get(dayKey) ?? {
      date: dayKey,
      transactions: 0,
      grossSales: 0,
      discounts: 0,
      tax: 0,
      netSales: 0,
      grossProfit: 0,
      itemsSold: 0,
    };
    daily.transactions += 1;
    daily.grossSales += grossSales;
    daily.discounts += discount;
    daily.tax += tax;
    daily.netSales += netSales;
    daily.grossProfit += grossProfit;
    daily.itemsSold += itemsSold;
    dailyMap.set(dayKey, daily);

    const monthKey = sale.created_at.slice(0, 7);
    const monthly = monthlyMap.get(monthKey) ?? {
      month: monthKey,
      transactions: 0,
      grossSales: 0,
      discounts: 0,
      tax: 0,
      netSales: 0,
      grossProfit: 0,
      itemsSold: 0,
    };
    monthly.transactions += 1;
    monthly.grossSales += grossSales;
    monthly.discounts += discount;
    monthly.tax += tax;
    monthly.netSales += netSales;
    monthly.grossProfit += grossProfit;
    monthly.itemsSold += itemsSold;
    monthlyMap.set(monthKey, monthly);

    const cashierBucket = cashierMap.get(sale.cashier_id) ?? {
      cashier: cashierName,
      transactions: 0,
      items_sold: 0,
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      gross_profit: 0,
      avg_ticket: 0,
    };
    cashierBucket.transactions = toNumber(cashierBucket.transactions) + 1;
    cashierBucket.items_sold = toNumber(cashierBucket.items_sold) + itemsSold;
    cashierBucket.gross_sales = toNumber(cashierBucket.gross_sales) + grossSales;
    cashierBucket.discounts = toNumber(cashierBucket.discounts) + discount;
    cashierBucket.net_sales = toNumber(cashierBucket.net_sales) + netSales;
    cashierBucket.gross_profit = toNumber(cashierBucket.gross_profit) + grossProfit;
    cashierMap.set(sale.cashier_id, cashierBucket);

    const branchBucket = salesBranchMap.get(sale.branch_id) ?? {
      branch: branchName,
      transactions: 0,
      items_sold: 0,
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      gross_profit: 0,
    };
    branchBucket.transactions = toNumber(branchBucket.transactions) + 1;
    branchBucket.items_sold = toNumber(branchBucket.items_sold) + itemsSold;
    branchBucket.gross_sales = toNumber(branchBucket.gross_sales) + grossSales;
    branchBucket.discounts = toNumber(branchBucket.discounts) + discount;
    branchBucket.net_sales = toNumber(branchBucket.net_sales) + netSales;
    branchBucket.gross_profit = toNumber(branchBucket.gross_profit) + grossProfit;
    salesBranchMap.set(sale.branch_id, branchBucket);
  }

  for (const item of saleItems) {
    const sale = saleMap.get(item.sale_id);
    if (!sale) continue;
    const product = productMap.get(item.product_id);
    const quantity = toNumber(item.quantity);
    const totalPrice = toNumber(item.total_price);
    const itemDiscount = toNumber(item.discount_amount);
    const itemCost = toNumber(item.cost_price) * quantity;
    const refund = refundBySaleId.get(item.sale_id) ?? 0;
    const qtyBase = Math.max(qtyBySaleId.get(item.sale_id) ?? 1, 1);
    const proportionalRefund = refund * (quantity / qtyBase);
    const netSales = totalPrice - itemDiscount - proportionalRefund;
    const grossProfit = totalPrice - itemCost - proportionalRefund;
    const categoryName = product?.categories?.name ?? "Uncategorized";
    const brandName = product?.brands?.name ?? "Unbranded";

    const categoryBucket = categoryMap.get(categoryName) ?? {
      category: categoryName,
      items_sold: 0,
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      gross_profit: 0,
    };
    categoryBucket.items_sold = toNumber(categoryBucket.items_sold) + quantity;
    categoryBucket.gross_sales = toNumber(categoryBucket.gross_sales) + totalPrice;
    categoryBucket.discounts = toNumber(categoryBucket.discounts) + itemDiscount;
    categoryBucket.net_sales = toNumber(categoryBucket.net_sales) + netSales;
    categoryBucket.gross_profit = toNumber(categoryBucket.gross_profit) + grossProfit;
    categoryMap.set(categoryName, categoryBucket);

    const brandBucket = brandMap.get(brandName) ?? {
      brand: brandName,
      items_sold: 0,
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      gross_profit: 0,
    };
    brandBucket.items_sold = toNumber(brandBucket.items_sold) + quantity;
    brandBucket.gross_sales = toNumber(brandBucket.gross_sales) + totalPrice;
    brandBucket.discounts = toNumber(brandBucket.discounts) + itemDiscount;
    brandBucket.net_sales = toNumber(brandBucket.net_sales) + netSales;
    brandBucket.gross_profit = toNumber(brandBucket.gross_profit) + grossProfit;
    brandMap.set(brandName, brandBucket);

    const productBucket = productSalesMap.get(item.product_id) ?? {
      sku: product?.sku ?? "-",
      product: product?.name ?? "Unknown",
      category: categoryName,
      brand: brandName,
      items_sold: 0,
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      gross_profit: 0,
    };
    productBucket.items_sold = toNumber(productBucket.items_sold) + quantity;
    productBucket.gross_sales = toNumber(productBucket.gross_sales) + totalPrice;
    productBucket.discounts = toNumber(productBucket.discounts) + itemDiscount;
    productBucket.net_sales = toNumber(productBucket.net_sales) + netSales;
    productBucket.gross_profit = toNumber(productBucket.gross_profit) + grossProfit;
    productSalesMap.set(item.product_id, productBucket);
  }

  const paymentAmountMap = new Map<string, number>();
  const paymentSalesMap = new Map<string, Set<string>>();
  for (const payment of salePayments) {
    const method = titleCase(payment.payment_method);
    paymentAmountMap.set(method, (paymentAmountMap.get(method) ?? 0) + toNumber(payment.amount));
    const saleSet = paymentSalesMap.get(method) ?? new Set<string>();
    saleSet.add(payment.sale_id);
    paymentSalesMap.set(method, saleSet);
  }

  const totalPaymentAmount = Array.from(paymentAmountMap.values()).reduce((sum, value) => sum + value, 0);
  const paymentReport = Array.from(paymentAmountMap.entries())
    .map(([method, amount]) => ({
      payment_method: method,
      transactions: paymentSalesMap.get(method)?.size ?? 0,
      amount,
      share: totalPaymentAmount > 0 ? amount / totalPaymentAmount : 0,
    }))
    .sort((left, right) => right.amount - left.amount);

  const shiftMovementSummary = new Map<string, { cashIn: number; cashOut: number }>();
  for (const movement of cashMovements) {
    const current = shiftMovementSummary.get(movement.shift_id) ?? { cashIn: 0, cashOut: 0 };
    if (movement.type === "cash_in") current.cashIn += toNumber(movement.amount);
    if (movement.type === "cash_out") current.cashOut += toNumber(movement.amount);
    shiftMovementSummary.set(movement.shift_id, current);
  }

  const stockAdjustmentRows = adjustmentItems.map((item) => {
    const header = stockAdjustments.find((entry) => entry.id === item.stock_adjustment_id);
    const product = productMap.get(item.product_id);
    return {
      adjustment_date: header?.created_at ?? "",
      branch: branchMap.get(header?.branch_id ?? "") ?? "Unknown",
      reason: header?.reason ?? "-",
      status: titleCase(header?.status),
      product: product?.name ?? "Unknown",
      sku: product?.sku ?? "-",
      quantity_before: item.quantity_before,
      quantity_after: item.quantity_after,
      difference: item.difference,
      approved_by: userMap.get(header?.approved_by ?? "") ?? "-",
      notes: item.notes || header?.notes || "-",
    };
  });

  const velocityRows = inventoryRows.map((row) => {
    const velocity = velocityByProduct.get(row.productId) ?? { qty: 0, revenue: 0, cost: 0, lastSoldAt: null };
    return {
      sku: row.sku,
      product: row.product,
      category: row.category,
      brand: row.brand,
      stock_on_hand: row.quantity,
      qty_sold_90d: velocity.qty,
      revenue_90d: velocity.revenue,
      gross_profit_90d: velocity.revenue - velocity.cost,
      last_sold_at: velocity.lastSoldAt ? shortDate(velocity.lastSoldAt) : "No sale in last 90d",
    };
  });

  const grossSalesValue = sales.reduce((sum, row) => sum + toNumber(row.subtotal), 0);
  const discountValue = sales.reduce((sum, row) => sum + toNumber(row.discount_amount), 0);
  const refundValue = returnsRows.reduce((sum, row) => {
    if (!FINAL_REFUND_STATUSES.has(row.status)) return sum;
    return sum + toNumber(row.refund_amount) + toNumber(row.store_credit);
  }, 0);
  const netSalesValue = grossSalesValue - discountValue - refundValue;
  const costOfSalesValue = saleItems.reduce(
    (sum, row) => sum + toNumber(row.cost_price) * toNumber(row.quantity),
    0,
  );
  const grossProfitValue = netSalesValue - costOfSalesValue;
  const approvedExpensesValue = expenses.reduce((sum, row) => {
    if (row.status !== "approved" || row.expense_type === "supplier_payment") return sum;
    return sum + toNumber(row.amount);
  }, 0);
  const netProfitValue = grossProfitValue - approvedExpensesValue;
  const outstandingReceivablesValue = receivables.reduce((sum, row) => sum + toNumber(row.balance), 0);
  const outstandingPayablesValue = purchaseOrders.reduce((sum, row) => {
    return sum + Math.max(0, toNumber(row.total_amount) - toNumber(row.paid_amount));
  }, 0);
  const inventoryValue = inventoryRows.reduce((sum, row) => sum + row.costValue, 0);
  const totalCashVariance = shifts.reduce((sum, row) => sum + toNumber(row.cash_difference), 0);

  const metrics: ReportMetric[] = [
    {
      id: "gross-sales",
      label: "Gross Sales",
      value: grossSalesValue,
      tone: "blue",
      hint: `${sales.length} completed sales in range`,
    },
    {
      id: "net-sales",
      label: "Net Sales",
      value: netSalesValue,
      tone: "green",
      hint: "After discounts and finalized refunds",
    },
    {
      id: "gross-profit",
      label: "Gross Profit",
      value: grossProfitValue,
      tone: grossProfitValue >= 0 ? "violet" : "red",
      hint: "Net sales minus cost of goods sold",
    },
    {
      id: "expenses",
      label: "Approved Expenses",
      value: approvedExpensesValue,
      tone: "orange",
      hint: "Operating expenses in selected period",
    },
    {
      id: "inventory-value",
      label: "Inventory Value",
      value: inventoryValue,
      tone: "slate",
      hint: "Current stock cost basis",
    },
    {
      id: "receivables",
      label: "Customer Receivables",
      value: outstandingReceivablesValue,
      tone: "blue",
      hint: "Open customer balances as of end date",
    },
    {
      id: "payables",
      label: "Supplier Payables",
      value: outstandingPayablesValue,
      tone: "red",
      hint: "Outstanding purchase order balances",
    },
    {
      id: "cash-variance",
      label: "Cash Drawer Variance",
      value: totalCashVariance,
      tone: totalCashVariance === 0 ? "green" : "orange",
      hint: "Shift over/short total in range",
    },
  ];

  const trendDaily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => ({
      label: shortDate(date),
      grossSales: row.grossSales,
      netSales: row.netSales,
      grossProfit: row.grossProfit,
      refunds: refundsByDay.get(date) ?? 0,
    }));

  const trendMonthly = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, row]) => ({
      label: monthLabel(`${month}-01T00:00:00.000Z`),
      grossSales: row.grossSales,
      netSales: row.netSales,
      grossProfit: row.grossProfit,
      refunds: Array.from(refundsByDay.entries())
        .filter(([date]) => date.startsWith(month))
        .reduce((sum, [, value]) => sum + value, 0),
    }));

  const inventoryHealth = [
    { name: "In Stock", value: inventoryRows.filter((row) => row.stockStatus === "In Stock").length },
    { name: "Low Stock", value: inventoryRows.filter((row) => row.stockStatus === "Low Stock").length },
    { name: "Out of Stock", value: inventoryRows.filter((row) => row.stockStatus === "Out of Stock").length },
  ];

  const reports: ReportTable[] = [
    {
      id: "daily-sales",
      group: "sales",
      title: "Daily Sales",
      description: "Completed sales grouped by business day.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "tax", label: "Tax", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(dailyMap.values())
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((row) => ({
          date: row.date,
          transactions: row.transactions,
          items_sold: row.itemsSold,
          gross_sales: row.grossSales,
          discounts: row.discounts,
          tax: row.tax,
          net_sales: row.netSales,
          gross_profit: row.grossProfit,
        })),
    },
    {
      id: "monthly-sales",
      group: "sales",
      title: "Monthly Sales",
      description: "Sales performance grouped by month.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "month", label: "Month", type: "text" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "tax", label: "Tax", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(monthlyMap.values())
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((row) => ({
          month: monthLabel(`${row.month}-01T00:00:00.000Z`),
          transactions: row.transactions,
          items_sold: row.itemsSold,
          gross_sales: row.grossSales,
          discounts: row.discounts,
          tax: row.tax,
          net_sales: row.netSales,
          gross_profit: row.grossProfit,
        })),
    },
    {
      id: "sales-by-cashier",
      group: "sales",
      title: "Sales by Cashier",
      description: "Cashier performance within the selected range.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "cashier", label: "Cashier" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
        { key: "avg_ticket", label: "Avg Ticket", type: "currency", align: "right" },
      ],
      rows: Array.from(cashierMap.values())
        .map<ReportRow>((row) => ({
          ...row,
          avg_ticket:
            toNumber(row["transactions"]) > 0
              ? toNumber(row["net_sales"]) / toNumber(row["transactions"])
              : 0,
        }))
        .sort((left, right) => toNumber(right.net_sales) - toNumber(left.net_sales)),
    },
    {
      id: "sales-by-branch",
      group: "sales",
      title: "Sales by Branch",
      description: "Branch-level sales comparison.",
      scopeLabel: filters.branchId === "all" ? "All active branches" : "Selected branch",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(salesBranchMap.values()).sort(
        (left, right) => toNumber(right.net_sales) - toNumber(left.net_sales),
      ),
    },
    {
      id: "sales-by-category",
      group: "sales",
      title: "Sales by Category",
      description: "Category contribution to sales and profit.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "category", label: "Category" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(categoryMap.values()).sort(
        (left, right) => toNumber(right.net_sales) - toNumber(left.net_sales),
      ),
    },
    {
      id: "sales-by-brand",
      group: "sales",
      title: "Sales by Brand",
      description: "Brand performance across sold products.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(brandMap.values()).sort(
        (left, right) => toNumber(right.net_sales) - toNumber(left.net_sales),
      ),
    },
    {
      id: "sales-by-product",
      group: "sales",
      title: "Sales by Product",
      description: "Product-level sales detail for the period.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "items_sold", label: "Items Sold", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
      ],
      rows: Array.from(productSalesMap.values()).sort(
        (left, right) => toNumber(right.net_sales) - toNumber(left.net_sales),
      ),
    },
    {
      id: "sales-by-payment-method",
      group: "sales",
      title: "Sales by Payment Method",
      description: "Payment split across recorded sale payments.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "payment_method", label: "Payment Method" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "amount", label: "Amount", type: "currency", align: "right" },
        { key: "share", label: "Share", type: "percent", align: "right" },
      ],
      rows: paymentReport,
    },
    {
      id: "discount-report",
      group: "sales",
      title: "Discount Report",
      description: "Completed sales where a sale-level discount was applied.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "invoice_number", label: "Invoice #" },
        { key: "branch", label: "Branch" },
        { key: "cashier", label: "Cashier" },
        { key: "discount_type", label: "Discount Type" },
        { key: "discount_value", label: "Discount Value", type: "number", align: "right" },
        { key: "discount_amount", label: "Discount Amount", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
      ],
      rows: sales
        .filter((row) => toNumber(row.discount_amount) > 0)
        .map((row) => ({
          date: row.created_at,
          invoice_number: row.invoice_number,
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          cashier: userMap.get(row.cashier_id) ?? "Unknown",
          discount_type: titleCase(row.discount_type),
          discount_value: toNumber(row.discount_value),
          discount_amount: toNumber(row.discount_amount),
          net_sales: toNumber(row.subtotal) - toNumber(row.discount_amount) - (refundBySaleId.get(row.id) ?? 0),
        }))
        .sort((left, right) => String(right.date).localeCompare(String(left.date))),
    },
    {
      id: "refund-report",
      group: "sales",
      title: "Refund Report",
      description: "Returns and refund activity captured in the returns module.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "return_number", label: "Return #" },
        { key: "branch", label: "Branch" },
        { key: "customer_name", label: "Customer" },
        { key: "status", label: "Status" },
        { key: "request_type", label: "Request Type" },
        { key: "refund_method", label: "Refund Method" },
        { key: "refund_amount", label: "Refund Amount", type: "currency", align: "right" },
        { key: "store_credit", label: "Store Credit", type: "currency", align: "right" },
        { key: "reason", label: "Reason" },
      ],
      rows: returnsRows
        .map((row) => ({
          date: row.created_at,
          return_number: row.return_number,
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          customer_name: row.customer_name || "Walk-in",
          status: titleCase(row.status),
          request_type: titleCase(row.request_type),
          refund_method: titleCase(row.refund_method),
          refund_amount: toNumber(row.refund_amount),
          store_credit: toNumber(row.store_credit),
          reason: row.reason || "-",
        }))
        .sort((left, right) => String(right.date).localeCompare(String(left.date))),
    },
    {
      id: "current-stock",
      group: "inventory",
      title: "Current Stock",
      description: "On-hand stock snapshot by branch and product.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "quantity", label: "Qty", type: "number", align: "right" },
        { key: "reorder_level", label: "Reorder", type: "number", align: "right" },
        { key: "stock_status", label: "Status" },
      ],
      rows: inventoryRows
        .map((row) => ({
          branch: row.branch,
          sku: row.sku,
          product: row.product,
          category: row.category,
          brand: row.brand,
          quantity: row.quantity,
          reorder_level: row.reorderLevel,
          stock_status: row.stockStatus,
        }))
        .sort((left, right) => String(left.product).localeCompare(String(right.product))),
    },
    {
      id: "low-stock",
      group: "inventory",
      title: "Low Stock",
      description: "Products at or below reorder threshold.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "quantity", label: "Qty", type: "number", align: "right" },
        { key: "reorder_level", label: "Reorder", type: "number", align: "right" },
        { key: "stock_status", label: "Status" },
      ],
      rows: inventoryRows
        .filter((row) => row.stockStatus === "Low Stock")
        .map((row) => ({
          branch: row.branch,
          sku: row.sku,
          product: row.product,
          category: row.category,
          brand: row.brand,
          quantity: row.quantity,
          reorder_level: row.reorderLevel,
          stock_status: row.stockStatus,
        }))
        .sort((left, right) => toNumber(left.quantity) - toNumber(right.quantity)),
    },
    {
      id: "out-of-stock",
      group: "inventory",
      title: "Out of Stock",
      description: "Products with zero available stock.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "quantity", label: "Qty", type: "number", align: "right" },
        { key: "stock_status", label: "Status" },
      ],
      rows: inventoryRows
        .filter((row) => row.stockStatus === "Out of Stock")
        .map((row) => ({
          branch: row.branch,
          sku: row.sku,
          product: row.product,
          category: row.category,
          brand: row.brand,
          quantity: row.quantity,
          stock_status: row.stockStatus,
        }))
        .sort((left, right) => String(left.product).localeCompare(String(right.product))),
    },
    {
      id: "inventory-valuation",
      group: "inventory",
      title: "Inventory Valuation",
      description: "Cost and retail value of current inventory.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "quantity", label: "Qty", type: "number", align: "right" },
        { key: "cost_price", label: "Cost", type: "currency", align: "right" },
        { key: "selling_price", label: "Retail", type: "currency", align: "right" },
        { key: "cost_value", label: "Cost Value", type: "currency", align: "right" },
        { key: "retail_value", label: "Retail Value", type: "currency", align: "right" },
      ],
      rows: inventoryRows
        .map((row) => ({
          branch: row.branch,
          sku: row.sku,
          product: row.product,
          quantity: row.quantity,
          cost_price: row.costPrice,
          selling_price: row.sellingPrice,
          cost_value: row.costValue,
          retail_value: row.retailValue,
        }))
        .sort((left, right) => toNumber(right.cost_value) - toNumber(left.cost_value)),
    },
    {
      id: "stock-movement",
      group: "inventory",
      title: "Stock Movement",
      description: "All stock movement entries in the selected period.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "created_at", label: "Date", type: "datetime" },
        { key: "branch", label: "Branch" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "movement_type", label: "Movement" },
        { key: "quantity", label: "Qty", type: "number", align: "right" },
        { key: "quantity_before", label: "Before", type: "number", align: "right" },
        { key: "quantity_after", label: "After", type: "number", align: "right" },
        { key: "reference_type", label: "Reference" },
        { key: "created_by", label: "Created By" },
      ],
      rows: stockMovements
        .map((row) => ({
          created_at: row.created_at,
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          sku: productMap.get(row.product_id)?.sku ?? "-",
          product: productMap.get(row.product_id)?.name ?? "Unknown",
          movement_type: titleCase(row.movement_type),
          quantity: row.quantity,
          quantity_before: row.quantity_before,
          quantity_after: row.quantity_after,
          reference_type: titleCase(row.reference_type),
          created_by: userMap.get(row.created_by ?? "") ?? "-",
        }))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))),
    },
    {
      id: "stock-adjustment",
      group: "inventory",
      title: "Stock Adjustment",
      description: "Inventory adjustments with before-and-after values.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "adjustment_date", label: "Date", type: "datetime" },
        { key: "branch", label: "Branch" },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status" },
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "quantity_before", label: "Before", type: "number", align: "right" },
        { key: "quantity_after", label: "After", type: "number", align: "right" },
        { key: "difference", label: "Diff", type: "number", align: "right" },
        { key: "approved_by", label: "Approved By" },
      ],
      rows: stockAdjustmentRows.sort((left, right) =>
        String(right.adjustment_date).localeCompare(String(left.adjustment_date)),
      ),
    },
    {
      id: "fast-moving-items",
      group: "inventory",
      title: "Fast-Moving Items",
      description: "Top sellers in the last 90 days ending on the selected date.",
      scopeLabel: "Rolling 90-day window",
      columns: [
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "stock_on_hand", label: "Stock", type: "number", align: "right" },
        { key: "qty_sold_90d", label: "Qty Sold", type: "number", align: "right" },
        { key: "revenue_90d", label: "Revenue", type: "currency", align: "right" },
        { key: "gross_profit_90d", label: "Gross Profit", type: "currency", align: "right" },
        { key: "last_sold_at", label: "Last Sold" },
      ],
      rows: [...velocityRows]
        .filter((row) => row.qty_sold_90d > 0)
        .sort((left, right) => right.qty_sold_90d - left.qty_sold_90d),
    },
    {
      id: "slow-moving-items",
      group: "inventory",
      title: "Slow-Moving Items",
      description: "Products that sold lightly in the last 90 days but still carry stock.",
      scopeLabel: "Rolling 90-day window",
      columns: [
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "stock_on_hand", label: "Stock", type: "number", align: "right" },
        { key: "qty_sold_90d", label: "Qty Sold", type: "number", align: "right" },
        { key: "revenue_90d", label: "Revenue", type: "currency", align: "right" },
        { key: "last_sold_at", label: "Last Sold" },
      ],
      rows: [...velocityRows]
        .filter((row) => row.stock_on_hand > 0 && row.qty_sold_90d > 0)
        .sort((left, right) => left.qty_sold_90d - right.qty_sold_90d),
    },
    {
      id: "dead-stock",
      group: "inventory",
      title: "Dead Stock",
      description: "Items with stock on hand but no sales in the last 90 days.",
      scopeLabel: "Rolling 90-day window",
      columns: [
        { key: "sku", label: "SKU" },
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "brand", label: "Brand" },
        { key: "stock_on_hand", label: "Stock", type: "number", align: "right" },
        { key: "revenue_90d", label: "Revenue", type: "currency", align: "right" },
        { key: "gross_profit_90d", label: "Gross Profit", type: "currency", align: "right" },
        { key: "last_sold_at", label: "Last Sold" },
      ],
      rows: [...velocityRows]
        .filter((row) => row.stock_on_hand > 0 && row.qty_sold_90d === 0)
        .sort((left, right) => right.stock_on_hand - left.stock_on_hand),
    },
    {
      id: "gross-sales-report",
      group: "financial",
      title: "Gross Sales",
      description: "Gross sales before discounts and refunds.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "transactions", label: "Transactions", type: "number", align: "right" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
      ],
      rows: Array.from(dailyMap.values())
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((row) => ({
          date: row.date,
          transactions: row.transactions,
          gross_sales: row.grossSales,
        })),
    },
    {
      id: "net-sales-report",
      group: "financial",
      title: "Net Sales",
      description: "Gross sales less discounts and finalized refunds.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "gross_sales", label: "Gross Sales", type: "currency", align: "right" },
        { key: "discounts", label: "Discounts", type: "currency", align: "right" },
        { key: "refunds", label: "Refunds", type: "currency", align: "right" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
      ],
      rows: Array.from(dailyMap.values())
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((row) => ({
          date: row.date,
          gross_sales: row.grossSales,
          discounts: row.discounts,
          refunds: refundsByDay.get(row.date) ?? 0,
          net_sales: row.netSales,
        })),
    },
    {
      id: "gross-profit-report",
      group: "financial",
      title: "Gross Profit",
      description: "Net sales against cost of goods sold.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "net_sales", label: "Net Sales", type: "currency", align: "right" },
        { key: "cost_of_sales", label: "Cost of Sales", type: "currency", align: "right" },
        { key: "gross_profit", label: "Gross Profit", type: "currency", align: "right" },
        { key: "margin", label: "Margin", type: "percent", align: "right" },
      ],
      rows: Array.from(dailyMap.values())
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((row) => {
          const daySales = sales.filter((sale) => sale.created_at.slice(0, 10) === row.date);
          const costOfSales = daySales.reduce((sum, sale) => sum + (costBySaleId.get(sale.id) ?? 0), 0);
          return {
            date: row.date,
            net_sales: row.netSales,
            cost_of_sales: costOfSales,
            gross_profit: row.grossProfit,
            margin: row.netSales > 0 ? row.grossProfit / row.netSales : 0,
          };
        }),
    },
    {
      id: "expenses-report",
      group: "financial",
      title: "Expenses",
      description: "Expense entries posted in the selected period.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "expense_date", label: "Date", type: "date" },
        { key: "branch", label: "Branch" },
        { key: "category", label: "Category" },
        { key: "expense_type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "payment_method", label: "Payment Method" },
        { key: "amount", label: "Amount", type: "currency", align: "right" },
        { key: "description", label: "Description" },
      ],
      rows: expenses
        .map((row) => ({
          expense_date: row.expense_date,
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          category: row.expense_categories?.name ?? "Uncategorized",
          expense_type: titleCase(row.expense_type),
          status: titleCase(row.status),
          payment_method: titleCase(row.payment_method),
          amount: toNumber(row.amount),
          description: row.description,
        }))
        .sort((left, right) => String(right.expense_date).localeCompare(String(left.expense_date))),
    },
    {
      id: "profit-and-loss",
      group: "financial",
      title: "Profit and Loss",
      description: "High-level P&L summary for the selected range.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "line_item", label: "Line Item" },
        { key: "amount", label: "Amount", type: "currency", align: "right" },
      ],
      rows: [
        { line_item: "Gross Sales", amount: grossSalesValue },
        { line_item: "Less: Discounts", amount: -discountValue },
        { line_item: "Less: Refunds", amount: -refundValue },
        { line_item: "Net Sales", amount: netSalesValue },
        { line_item: "Less: Cost of Goods Sold", amount: -costOfSalesValue },
        { line_item: "Gross Profit", amount: grossProfitValue },
        { line_item: "Less: Approved Operating Expenses", amount: -approvedExpensesValue },
        { line_item: "Net Profit", amount: netProfitValue },
      ],
    },
    {
      id: "supplier-payables",
      group: "financial",
      title: "Supplier Payables",
      description: "Outstanding supplier balances based on purchase orders.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "supplier_code", label: "Supplier Code" },
        { key: "supplier_name", label: "Supplier" },
        { key: "po_number", label: "PO #" },
        { key: "status", label: "Status" },
        { key: "total_amount", label: "Total", type: "currency", align: "right" },
        { key: "paid_amount", label: "Paid", type: "currency", align: "right" },
        { key: "balance", label: "Balance", type: "currency", align: "right" },
        { key: "created_at", label: "Created", type: "date" },
      ],
      rows: purchaseOrders
        .map((row) => ({
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          supplier_code: row.suppliers?.code ?? "-",
          supplier_name: row.suppliers?.name ?? "Unknown",
          po_number: row.po_number,
          status: titleCase(row.status),
          total_amount: toNumber(row.total_amount),
          paid_amount: toNumber(row.paid_amount),
          balance: Math.max(0, toNumber(row.total_amount) - toNumber(row.paid_amount)),
          created_at: row.created_at,
        }))
        .filter((row) => toNumber(row.balance) > 0)
        .sort((left, right) => toNumber(right.balance) - toNumber(left.balance)),
    },
    {
      id: "customer-receivables",
      group: "financial",
      title: "Customer Receivables",
      description: "Outstanding customer balances as of the selected end date.",
      scopeLabel: "As of selected end date",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "customer_code", label: "Customer Code" },
        { key: "customer_name", label: "Customer" },
        { key: "invoice_number", label: "Invoice #" },
        { key: "due_date", label: "Due Date", type: "date" },
        { key: "status", label: "Status" },
        { key: "total_amount", label: "Total", type: "currency", align: "right" },
        { key: "paid_amount", label: "Paid", type: "currency", align: "right" },
        { key: "balance", label: "Balance", type: "currency", align: "right" },
      ],
      rows: receivables
        .map((row) => ({
          branch: branchMap.get(row.branch_id) ?? "Unknown",
          customer_code: row.customers?.code ?? "-",
          customer_name: row.customers?.name ?? "Unknown",
          invoice_number: row.invoice_number,
          due_date: row.due_date || row.created_at,
          status: titleCase(row.status),
          total_amount: toNumber(row.total_amount),
          paid_amount: toNumber(row.paid_amount),
          balance: toNumber(row.balance),
        }))
        .filter((row) => toNumber(row.balance) > 0)
        .sort((left, right) => toNumber(right.balance) - toNumber(left.balance)),
    },
    {
      id: "cash-drawer-summary",
      group: "financial",
      title: "Cash Drawer Summary",
      description: "Shift cash accountability summary including cash in and cash out.",
      scopeLabel: "Selected date range",
      columns: [
        { key: "shift_number", label: "Shift #" },
        { key: "branch", label: "Branch" },
        { key: "cashier", label: "Cashier" },
        { key: "status", label: "Status" },
        { key: "opened_at", label: "Opened", type: "datetime" },
        { key: "closed_at", label: "Closed", type: "datetime" },
        { key: "starting_cash", label: "Starting", type: "currency", align: "right" },
        { key: "cash_sales", label: "Cash Sales", type: "currency", align: "right" },
        { key: "noncash_sales", label: "Non-cash", type: "currency", align: "right" },
        { key: "cash_in", label: "Cash In", type: "currency", align: "right" },
        { key: "cash_out", label: "Cash Out", type: "currency", align: "right" },
        { key: "expected_cash", label: "Expected", type: "currency", align: "right" },
        { key: "actual_cash", label: "Actual", type: "currency", align: "right" },
        { key: "cash_difference", label: "Variance", type: "currency", align: "right" },
      ],
      rows: shifts
        .map((row) => {
          const movements = shiftMovementSummary.get(row.id) ?? { cashIn: 0, cashOut: 0 };
          return {
            shift_number: row.shift_number || row.id.slice(0, 8).toUpperCase(),
            branch: branchMap.get(row.branch_id) ?? "Unknown",
            cashier: userMap.get(row.cashier_id) ?? "Unknown",
            status: titleCase(row.status),
            opened_at: row.opened_at || row.created_at,
            closed_at: row.closed_at || "",
            starting_cash: toNumber(row.starting_cash),
            cash_sales: toNumber(row.total_cash_sales),
            noncash_sales: toNumber(row.total_noncash),
            cash_in: movements.cashIn,
            cash_out: movements.cashOut,
            expected_cash: toNumber(row.expected_cash),
            actual_cash: toNumber(row.actual_cash),
            cash_difference: toNumber(row.cash_difference),
          };
        })
        .sort((left, right) => String(right.opened_at).localeCompare(String(left.opened_at))),
    },
  ];

  return {
    branches,
    metrics,
    trends: {
      daily: trendDaily,
      monthly: trendMonthly,
    },
    breakdowns: {
      payment: paymentReport.map((row) => ({ name: String(row.payment_method), value: toNumber(row.amount) })),
      category: Array.from(categoryMap.values())
        .sort((left, right) => toNumber(right.net_sales) - toNumber(left.net_sales))
        .slice(0, 6)
        .map((row) => ({ name: String(row.category), value: toNumber(row.net_sales) })),
      inventoryHealth,
    },
    reports,
  } satisfies ReportsAnalyticsData;
}

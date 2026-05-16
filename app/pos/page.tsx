"use client";

import { useDeferredValue, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BatteryCharging,
  CircleDot,
  CreditCard,
  Disc3,
  Droplets,
  Fuel,
  Gauge,
  Layers3,
  LoaderCircle,
  MapPin,
  Minus,
  PackageSearch,
  Play,
  Plus,
  ScanLine,
  Search,
  ShoppingCart,
  Tag,
  TicketPercent,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveCurrentUserInfo } from "@/lib/current-user";

type BranchOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type CategoryOption = {
  id: string;
  name: string;
};

type CustomerOption = {
  id: string;
  name: string;
  branch_id?: string | null;
  customer_type?: string | null;
};

type ProductImageRow = {
  url: string;
  is_primary?: boolean | null;
  sort_order?: number | null;
};

type InventorySourceRow = {
  id: string;
  quantity: number;
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    part_number?: string | null;
    supplier_code?: string | null;
    shelf_location?: string | null;
    selling_price?: string | number | null;
    category?: {
      id: string;
      name: string;
    } | null;
    brand?: {
      id: string;
      name: string;
    } | null;
    product_images?: ProductImageRow[] | null;
  } | null;
};

type ProductCard = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  partNumber: string;
  supplierCode: string;
  shelfLocation: string;
  price: number;
  stock: number;
  categoryId: string;
  categoryName: string;
  brandName: string;
  imageUrl: string;
  icon: LucideIcon;
  tint: string;
};

type SaleRow = {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  cashier_id: string;
  subtotal?: string | number | null;
  discount_amount?: string | number | null;
  tax_amount?: string | number | null;
  total_amount: string | number;
  created_at: string;
};

type SalePaymentRow = {
  sale_id: string;
  payment_method: string;
  amount: string | number;
};

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
};

type UserRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  role_id?: string | null;
  branch_id?: string | null;
};

type RoleRow = {
  name?: string | null;
};

type CartItem = ProductCard & {
  quantity: number;
};

type SummaryCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "blue" | "violet" | "orange";
};

const productIcons: LucideIcon[] = [
  Gauge,
  Layers3,
  Droplets,
  CircleDot,
  BatteryCharging,
  Disc3,
  Fuel,
  PackageSearch,
  Tag,
];

const productTints = [
  "#eef4ff",
  "#f8f2ea",
  "#eefbf3",
  "#f6f3ff",
  "#fdf4ea",
  "#edf7ff",
  "#eefaf0",
  "#fff6ea",
  "#fff1f1",
];

const paymentMethodMeta: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  cash: { label: "Cash", className: "pos-pay-chip--cash", icon: Wallet },
  card: { label: "Card", className: "pos-pay-chip--card", icon: CreditCard },
  bank_transfer: { label: "Bank Transfer", className: "pos-pay-chip--other", icon: Wallet },
  gcash: { label: "GCash", className: "pos-pay-chip--other", icon: Tag },
  ewallet: { label: "E-Wallet", className: "pos-pay-chip--other", icon: Tag },
  customer_credit: { label: "Customer Credit", className: "pos-pay-chip--other", icon: User },
  split: { label: "Split", className: "pos-pay-chip--other", icon: Tag },
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatPeso(value: number) {
  return `P${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPrimaryImage(images?: ProductImageRow[] | null) {
  if (!images?.length) return "";

  const sorted = [...images].sort((left, right) => {
    const primaryDelta = Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary));
    if (primaryDelta !== 0) return primaryDelta;
    return (left.sort_order ?? 0) - (right.sort_order ?? 0);
  });

  return sorted[0]?.url ?? "";
}

function getProductVisual(index: number) {
  return {
    icon: productIcons[index % productIcons.length],
    tint: productTints[index % productTints.length],
  };
}

function getDisplayName(user?: UserRow | null) {
  if (!user) return "Cashier";

  const fullName = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
  return fullName || user.username || user.email || "Cashier";
}

function getPaymentLabel(methods: string[]) {
  if (!methods.length) return "Cash";
  if (methods.length > 1) return "Split";
  return paymentMethodMeta[methods[0]]?.label ?? methods[0].replace(/_/g, " ");
}

export default function POSPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [cashierName, setCashierName] = useState("Cashier");
  const [cashierUserId, setCashierUserId] = useState("");
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState("walk-in");
  const [salesNote, setSalesNote] = useState("");
  const [discountValue, setDiscountValue] = useState("0");
  const [recentTransactions, setRecentTransactions] = useState<
    Array<{ invoice: string; customer: string; amount: number; payment: string; cashier: string; time: string }>
  >([]);
  const [recentItems, setRecentItems] = useState<Array<{ sku: string; name: string; price: number; icon: LucideIcon; tint: string }>>([]);
  const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([
    { label: "Total Sales", value: formatPeso(0), icon: Wallet, tone: "blue" },
    { label: "Total Orders", value: "0", icon: ShoppingCart, tone: "violet" },
    { label: "Average Sales", value: formatPeso(0), icon: TicketPercent, tone: "orange" },
  ]);
  const [heldSalesCount, setHeldSalesCount] = useState(0);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState(["cash", "card", "bank_transfer"]);

  const deferredSearchValue = useDeferredValue(searchValue);

  useEffect(() => {
    let isMounted = true;

    const loadProfileAndBranches = async () => {
      setLoading(true);
      setError("");

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        if (isMounted) {
          setError(authError.message);
          setLoading(false);
        }
        return;
      }

      const [profileResult, branchResult] = await Promise.all([
        authUser?.id
          ? supabase
              .from("users")
              .select("id, first_name, last_name, username, email, role_id, branch_id")
              .eq("auth_id", authUser.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("branches")
          .select("id, name, is_main")
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true }),
      ]);

      if (!isMounted) return;

      if (profileResult.error) {
        setError(profileResult.error.message);
      }

      if (branchResult.error) {
        setError(branchResult.error.message);
        setLoading(false);
        return;
      }

      const profileUser = (profileResult.data as UserRow | null) ?? null;
      const branches = (branchResult.data ?? []) as BranchOption[];
      const roleResult = profileUser?.role_id
        ? await supabase.from("roles").select("name").eq("id", profileUser.role_id).maybeSingle()
        : { data: null };

      if (!isMounted) return;

      const resolvedUser = resolveCurrentUserInfo({
        authUser,
        profileUser,
        roleName: (roleResult.data as RoleRow | null)?.name ?? null,
      });

      setCashierName(resolvedUser.displayName || resolvedUser.username);
      setCashierUserId(profileUser?.id ?? "");
      setBranchOptions(branches);

      const defaultBranch = branches.find((branch) => branch.id === profileUser?.branch_id)
        ?? branches.find((branch) => branch.is_main)
        ?? branches[0];

      setSelectedBranchId(defaultBranch?.id ?? "");
    };

    void loadProfileAndBranches();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let isMounted = true;

    const loadPosData = async () => {
      setLoading(true);
      setError("");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [categoryResult, customerResult, inventoryResult, salesResult, heldSalesResult, shiftResult] = await Promise.all([
        supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("customers").select("id, name, branch_id, customer_type").eq("is_active", true).order("name", { ascending: true }),
        supabase
          .from("inventory_stocks")
          .select(`
            id,
            quantity,
            product:products (
              id,
              name,
              sku,
              barcode,
              part_number,
              supplier_code,
              shelf_location,
              selling_price,
              category:categories (
                id,
                name
              ),
              brand:brands (
                id,
                name
              ),
              product_images (
                url,
                is_primary,
                sort_order
              )
            )
          `)
          .eq("branch_id", selectedBranchId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("sales")
          .select("id, invoice_number, customer_id, cashier_id, subtotal, discount_amount, tax_amount, total_amount, created_at")
          .eq("branch_id", selectedBranchId)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", selectedBranchId)
          .eq("status", "held"),
        cashierUserId
          ? supabase
              .from("cash_shifts")
              .select("id")
              .eq("branch_id", selectedBranchId)
              .eq("cashier_id", cashierUserId)
              .eq("status", "open")
              .limit(1)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!isMounted) return;

      if (categoryResult.error || customerResult.error || inventoryResult.error || salesResult.error || heldSalesResult.error || shiftResult.error) {
        setError(
          categoryResult.error?.message
          || customerResult.error?.message
          || inventoryResult.error?.message
          || salesResult.error?.message
          || heldSalesResult.error?.message
          || shiftResult.error?.message
          || "Unable to load POS data."
        );
        setLoading(false);
        return;
      }

      const categoryRows = (categoryResult.data ?? []) as CategoryOption[];
      const customerRows = ((customerResult.data ?? []) as CustomerOption[]).filter(
        (customer) => !customer.branch_id || customer.branch_id === selectedBranchId
      );
      const inventoryRows = (inventoryResult.data ?? []) as unknown as InventorySourceRow[];
      const salesRows = (salesResult.data ?? []) as SaleRow[];

      const normalizedProducts = inventoryRows
        .filter((row) => row.product)
        .map((row, index) => {
          const product = row.product!;
          const visual = getProductVisual(index);

          return {
            id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode ?? "",
            partNumber: product.part_number ?? "",
            supplierCode: product.supplier_code ?? "",
            shelfLocation: product.shelf_location ?? "",
            price: parseNumber(product.selling_price),
            stock: row.quantity,
            categoryId: product.category?.id ?? "",
            categoryName: product.category?.name ?? "Others",
            brandName: product.brand?.name ?? "",
            imageUrl: getPrimaryImage(product.product_images),
            icon: visual.icon,
            tint: visual.tint,
          } satisfies ProductCard;
        });

      const saleIds = salesRows.map((sale) => sale.id);
      const customerIds = Array.from(new Set(salesRows.map((sale) => sale.customer_id).filter(Boolean))) as string[];
      const cashierIds = Array.from(new Set(salesRows.map((sale) => sale.cashier_id).filter(Boolean)));

      const [paymentResult, saleItemResult, transactionCustomerResult, cashierResult, monthlySalesResult] = await Promise.all([
        saleIds.length
          ? supabase.from("sale_payments").select("sale_id, payment_method, amount").in("sale_id", saleIds)
          : Promise.resolve({ data: [], error: null }),
        saleIds.length
          ? supabase.from("sale_items").select("sale_id, product_id, quantity, unit_price, total_price").in("sale_id", saleIds)
          : Promise.resolve({ data: [], error: null }),
        customerIds.length
          ? supabase.from("customers").select("id, name").in("id", customerIds)
          : Promise.resolve({ data: [], error: null }),
        cashierIds.length
          ? supabase.from("users").select("id, first_name, last_name, username, email").in("id", cashierIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("v_daily_sales_summary")
          .select("total_transactions, gross_sales")
          .eq("branch_id", selectedBranchId)
          .gte("sale_date", monthStart.toISOString().slice(0, 10)),
      ]);

      if (!isMounted) return;

      if (paymentResult.error || saleItemResult.error || transactionCustomerResult.error || cashierResult.error || monthlySalesResult.error) {
        setError(
          paymentResult.error?.message
          || saleItemResult.error?.message
          || transactionCustomerResult.error?.message
          || cashierResult.error?.message
          || monthlySalesResult.error?.message
          || "Unable to finish loading POS details."
        );
        setLoading(false);
        return;
      }

      const paymentRows = (paymentResult.data ?? []) as SalePaymentRow[];
      const saleItemRows = (saleItemResult.data ?? []) as SaleItemRow[];
      const transactionCustomers = new Map(
        (((transactionCustomerResult.data ?? []) as Array<{ id: string; name: string }>)).map((customer) => [customer.id, customer.name])
      );
      const cashierMap = new Map(
        (((cashierResult.data ?? []) as UserRow[])).map((cashier) => [cashier.id, getDisplayName(cashier)])
      );
      const monthlySalesRows = (monthlySalesResult.data ?? []) as Array<{ total_transactions: number | null; gross_sales: number | string | null }>;

      const paymentsBySale = new Map<string, string[]>();
      const methodSet = new Set<string>(["cash", "card", "bank_transfer"]);
      paymentRows.forEach((payment) => {
        const existing = paymentsBySale.get(payment.sale_id) ?? [];
        existing.push(payment.payment_method);
        paymentsBySale.set(payment.sale_id, existing);
        methodSet.add(payment.payment_method);
      });

      const transactions = salesRows.slice(0, 4).map((sale) => ({
        invoice: sale.invoice_number,
        customer: sale.customer_id ? transactionCustomers.get(sale.customer_id) ?? "Walk-in Customer" : "Walk-in Customer",
        amount: parseNumber(sale.total_amount),
        payment: getPaymentLabel(paymentsBySale.get(sale.id) ?? []),
        cashier: cashierMap.get(sale.cashier_id) ?? cashierName,
        time: formatDateTime(sale.created_at),
      }));

      const productMap = new Map(normalizedProducts.map((product) => [product.id, product]));
      const recentProductIds: string[] = [];
      saleItemRows.forEach((item) => {
        if (!recentProductIds.includes(item.product_id)) {
          recentProductIds.push(item.product_id);
        }
      });

      const mappedRecentItems = recentProductIds
        .map((productId) => productMap.get(productId))
        .filter(Boolean)
        .slice(0, 4)
        .map((product) => ({
          sku: product!.sku,
          name: product!.name,
          price: product!.price,
          icon: product!.icon,
          tint: product!.tint,
        }));

      const grossSales = monthlySalesRows.reduce((sum, row) => sum + parseNumber(row.gross_sales), 0);
      const totalOrders = monthlySalesRows.reduce((sum, row) => sum + (row.total_transactions ?? 0), 0);
      const averageSales = totalOrders > 0 ? grossSales / totalOrders : 0;

      setCategories(categoryRows);
      setCustomers(customerRows);
      setProducts(normalizedProducts);
      setRecentTransactions(transactions);
      setRecentItems(mappedRecentItems);
      setSummaryCards([
        { label: "Total Sales", value: formatPeso(grossSales), icon: Wallet, tone: "blue" },
        { label: "Total Orders", value: totalOrders.toLocaleString("en-PH"), icon: ShoppingCart, tone: "violet" },
        { label: "Average Sales", value: formatPeso(averageSales), icon: TicketPercent, tone: "orange" },
      ]);
      setHeldSalesCount(heldSalesResult.count ?? 0);
      setAvailablePaymentMethods(Array.from(methodSet));
      setLoading(false);

      if (!(shiftResult.data ?? []).length) {
        setSalesNote((current) => current || "No open cash shift found for this cashier.");
      }
    };

    void loadPosData();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId, cashierUserId, cashierName]);

  const categoryTabs = [
    { id: "all", name: "All Items" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  const normalizedQuery = deferredSearchValue.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategoryId === "all" || product.categoryId === selectedCategoryId;
    if (!matchesCategory) return false;

    if (!normalizedQuery) return true;

    return [
      product.name,
      product.sku,
      product.barcode,
      product.partNumber,
      product.brandName,
      product.categoryName,
      product.supplierCode,
      product.shelfLocation,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = Math.min(parseNumber(discountValue), subtotal);
  const taxableBase = Math.max(subtotal - discountAmount, 0);
  const tax = taxableBase * 0.12;
  const total = taxableBase + tax;

  const selectedBranch = branchOptions.find((branch) => branch.id === selectedBranchId);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const addToCart = (product: ProductCard) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, Math.max(product.stock, 1)) }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
  };

  const changeQuantity = (productId: string, nextQuantity: number) => {
    setCartItems((current) =>
      current
        .map((item) => (item.id === productId ? { ...item, quantity: nextQuantity } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscountValue("0");
    setSelectedCustomerId("walk-in");
    setSalesNote("");
  };

  return (
    <div className="page pos-page">
      <div className="pos-shell">
        <section className="pos-surface">
          <header className="pos-header">
            <div className="pos-header__title-wrap">
              <div className="pos-header__icon">
                <ShoppingCart size={20} />
              </div>
              <div>
                <h1 className="pos-header__title">POS / Sales</h1>
                <p className="pos-header__subtitle">Search by name, SKU, barcode, brand, category, or shelf location</p>
              </div>
            </div>

            <div className="pos-header__actions">
              <label className="pos-chip pos-chip--select">
                <MapPin size={14} />
                <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
                  {branchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pos-chip">
                <User size={14} />
                <span>Cashier: {cashierName}</span>
              </div>
              <div className="pos-btn pos-btn--warn">
                <Play size={14} />
                <span>Held Sales: {heldSalesCount}</span>
              </div>
              <div className="pos-btn pos-btn--ghost">
                <Wallet size={14} />
                <span>{selectedBranch?.name ?? "Branch"}</span>
              </div>
            </div>
          </header>

          <div className="pos-toolbar">
            <div className="pos-search">
              <Search size={16} />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Scan barcode or search item..."
              />
              <button type="button" className="pos-search__scan" aria-label="Scan barcode">
                <ScanLine size={16} />
              </button>
            </div>

            <div className="pos-tabs" aria-label="Product categories">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`pos-tab ${selectedCategoryId === tab.id ? "pos-tab--active" : ""}`}
                  onClick={() => setSelectedCategoryId(tab.id)}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="pos-toolbar__trash"
              aria-label="Clear filters"
              onClick={() => {
                setSearchValue("");
                setSelectedCategoryId("all");
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {error ? <div className="pos-status pos-status--error">{error}</div> : null}

          <div className="pos-content">
            <div className="pos-left">
              {loading ? (
                <div className="pos-status">
                  <LoaderCircle size={18} className="pos-spin" />
                  <span>Loading products and POS activity...</span>
                </div>
              ) : (
                <>
                  <div className="pos-product-grid">
                    {filteredProducts.map((product) => (
                      <article key={product.id} className="pos-product-card" onClick={() => addToCart(product)} role="button" tabIndex={0}>
                        <div className="pos-product-card__media" style={{ background: product.tint }}>
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.imageUrl} alt={product.name} className="pos-product-card__image" />
                          ) : (
                            <product.icon size={46} strokeWidth={1.6} />
                          )}
                        </div>
                        <div className="pos-product-card__sku">{product.sku}</div>
                        <h3 className="pos-product-card__name">{product.name}</h3>
                        <div className="pos-product-card__meta">
                          <span>{product.brandName || product.categoryName}</span>
                          {product.partNumber ? <span>{product.partNumber}</span> : null}
                        </div>
                        <div className="pos-product-card__price">{formatPeso(product.price)}</div>
                        <div className="pos-product-card__stock">Stock: {product.stock}</div>
                      </article>
                    ))}
                  </div>

                  {!filteredProducts.length ? (
                    <div className="pos-status">No products matched this search for the selected branch.</div>
                  ) : null}
                </>
              )}

              <section className="pos-panel pos-panel--recent">
                <div className="pos-panel__header">
                  <h2 className="pos-panel__title">Recent Items</h2>
                </div>
                <div className="pos-recent-list">
                  {recentItems.length ? (
                    recentItems.map((item) => (
                      <div key={item.sku} className="pos-recent-card">
                        <div className="pos-recent-card__icon" style={{ background: item.tint }}>
                          <item.icon size={24} strokeWidth={1.8} />
                        </div>
                        <div>
                          <div className="pos-recent-card__name">{item.name}</div>
                          <div className="pos-recent-card__price">{formatPeso(item.price)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="pos-empty-note">No recent sold items yet for this branch.</div>
                  )}
                </div>
              </section>

              <div className="pos-bottom-grid">
                <section className="pos-panel">
                  <div className="pos-panel__header">
                    <h2 className="pos-panel__title">Recent Transactions</h2>
                    <span className="pos-panel__link">{recentTransactions.length} loaded</span>
                  </div>
                  <div className="pos-transaction-table">
                    <div className="pos-transaction-table__head">
                      <span>Invoice</span>
                      <span>Customer</span>
                      <span>Total Amount</span>
                      <span>Payment</span>
                      <span>Cashier</span>
                      <span>Time</span>
                    </div>
                    {recentTransactions.length ? (
                      recentTransactions.map((item) => (
                        <div key={item.invoice} className="pos-transaction-table__row">
                          <span className="pos-linkish">{item.invoice}</span>
                          <span>{item.customer}</span>
                          <span>{formatPeso(item.amount)}</span>
                          <span>{item.payment}</span>
                          <span>{item.cashier}</span>
                          <span>{item.time}</span>
                        </div>
                      ))
                    ) : (
                      <div className="pos-empty-note">No completed sales found for this branch yet.</div>
                    )}
                  </div>
                </section>

                <section className="pos-panel">
                  <div className="pos-panel__header">
                    <h2 className="pos-panel__title">Sales Summary</h2>
                    <span className="pos-panel__meta">This Month</span>
                  </div>
                  <div className="pos-summary-cards">
                    {summaryCards.map((card) => (
                      <article key={card.label} className="pos-summary-card">
                        <div className={`pos-summary-card__icon pos-summary-card__icon--${card.tone}`}>
                          <card.icon size={18} />
                        </div>
                        <div className="pos-summary-card__label">{card.label}</div>
                        <div className="pos-summary-card__value">{card.value}</div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <aside className="pos-cart">
              <div className="pos-cart__header">
                <h2>Cart ({cartItems.length})</h2>
                <button type="button" className="pos-cart__clear" onClick={clearCart}>
                  <Trash2 size={14} />
                  <span>Clear Cart</span>
                </button>
              </div>

              <div className="pos-cart__table-head">
                <span>Item</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Amount</span>
              </div>

              <div className="pos-cart__items">
                {cartItems.length ? (
                  cartItems.map((item) => (
                    <div key={item.id} className="pos-cart__row">
                      <div className="pos-cart__item">
                        <div className="pos-cart__thumb" style={{ background: item.tint }}>
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.name} className="pos-cart__image" />
                          ) : (
                            <item.icon size={22} strokeWidth={1.7} />
                          )}
                        </div>
                        <div>
                          <div className="pos-cart__name">{item.name}</div>
                          <div className="pos-cart__sku">{item.sku}</div>
                        </div>
                      </div>

                      <div className="pos-stepper">
                        <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => changeQuantity(item.id, item.quantity - 1)}>
                          <Minus size={13} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.name}`}
                          onClick={() => changeQuantity(item.id, Math.min(item.quantity + 1, Math.max(item.stock, 1)))}
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <div className="pos-cart__price">{formatPeso(item.price)}</div>
                      <div className="pos-cart__amount">{formatPeso(item.price * item.quantity)}</div>
                    </div>
                  ))
                ) : (
                  <div className="pos-empty-note">Add items from the product grid to start this sale.</div>
                )}
              </div>

              <div className="pos-cart__form">
                <label className="pos-field">
                  <span>Discount</span>
                  <div className="pos-field__row">
                    <button type="button" className="pos-field__prefix">
                      <TicketPercent size={14} />
                    </button>
                    <input type="number" min="0" step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
                  </div>
                </label>

                <label className="pos-field">
                  <span>Customer</span>
                  <div className="pos-field__row pos-field__row--select">
                    <button type="button" className="pos-field__prefix">
                      <User size={14} />
                    </button>
                    <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                      <option value="walk-in">Walk-in Customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="pos-field">
                  <span>Sales Note</span>
                  <textarea
                    placeholder="Add note here..."
                    rows={3}
                    value={salesNote}
                    onChange={(event) => setSalesNote(event.target.value)}
                  />
                </label>
              </div>

              <div className="pos-totals">
                <div className="pos-totals__row">
                  <span>Subtotal</span>
                  <strong>{formatPeso(subtotal)}</strong>
                </div>
                <div className="pos-totals__row">
                  <span>Discount</span>
                  <strong>{formatPeso(discountAmount)}</strong>
                </div>
                <div className="pos-totals__row">
                  <span>VAT (12%)</span>
                  <strong>{formatPeso(tax)}</strong>
                </div>
                <div className="pos-totals__grand">
                  <span>TOTAL</span>
                  <strong>{formatPeso(total)}</strong>
                </div>
                <div className="pos-customer-inline">
                  <span>Customer</span>
                  <strong>{selectedCustomer?.name ?? "Walk-in Customer"}</strong>
                </div>
              </div>

              <div className="pos-payment-methods">
                {availablePaymentMethods.slice(0, 3).map((method) => {
                  const meta = paymentMethodMeta[method] ?? { label: method.replace(/_/g, " "), className: "pos-pay-chip--other", icon: Tag };
                  const Icon = meta.icon;
                  return (
                    <button key={method} type="button" className={`pos-pay-chip ${meta.className}`}>
                      <Icon size={16} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>

              <button type="button" className="pos-pay-now" disabled={!cartItems.length}>
                <Wallet size={17} />
                <span>Pay Now (F9)</span>
              </button>
            </aside>
          </div>
        </section>

        <div className="pos-mobile-checkout">
          <div>
            <div className="pos-mobile-checkout__label">Cart Total</div>
            <div className="pos-mobile-checkout__value">{formatPeso(total)}</div>
          </div>
          <button type="button" disabled={!cartItems.length}>Checkout</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
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
import { fetchBranchOptions } from "@/lib/branch-options";
import { resolveCurrentUserInfo } from "@/lib/current-user";
import PaymentModal, { type PaymentLine, type PaymentSuccessPayload } from "./components/PaymentModal";
import ReceiptModal from "./components/ReceiptModal";
import RecallModal from "./components/RecallModal";
import VoidModal from "./components/VoidModal";
import ReturnModal from "./components/ReturnModal";
import ShiftModal from "./components/ShiftModal";
import ItemDiscountModal from "./components/ItemDiscountModal";
import CameraScanModal from "./components/CameraScanModal";
import { useRbac } from "@/components/RbacProvider";

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
  email?: string | null;
  phone?: string | null;
  credit_limit?: string | number | null;
  current_balance?: string | number | null;
  allow_credit?: boolean | null;
  default_credit_terms_days?: number | null;
};

type ProductImageRow = {
  url: string;
  is_primary?: boolean | null;
  sort_order?: number | null;
};

type CompatibilityModelRow = {
  id: string;
  brand: string;
  model_name: string;
  engine_type?: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

type ProductSourceRow = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  part_number?: string | null;
  supplier_code?: string | null;
  shelf_location?: string | null;
  selling_price?: string | number | null;
  status?: string | null;
  is_active?: boolean | null;
  category?: Array<{
    id: string;
    name: string;
  }> | null;
  brand?: Array<{
    id: string;
    name: string;
  }> | null;
  product_images?: ProductImageRow[] | null;
  product_compatibility?: Array<{
    motorcycle_model?: CompatibilityModelRow | CompatibilityModelRow[] | null;
  }> | null;
};

type InventoryStockRow = {
  product_id: string;
  quantity: number;
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
  compatibleLabels: string[];
  motorcycleModels: string[];
  engineTypes: string[];
  yearModels: string[];
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
  overridePrice?: number;
  itemDiscountType?: string;
  itemDiscountValue?: number;
  itemDiscountAmount?: number;
  approvedByUserId?: string;
};

type ReceiptState = {
  saleId: string;
  invoiceNumber: string;
  issuedAt?: string;
  payments: PaymentLine[];
  amountPaid: number;
  changeAmount: number;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopTaxId?: string;
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    totalPrice: number;
  }>;
  subtotal: number;
  discountAmountTotal: number;
  taxAmount: number;
  total: number;
};

type HeldSaleRecall = {
  id: string;
  customer_name: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price?: number;
    discount_type?: string | null;
    discount_value?: number | null;
    discount_amount?: number | null;
  }>;
};

type SummaryCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "blue" | "violet" | "orange";
};

type RecentTransactionRow = {
  saleId: string;
  invoice: string;
  customer: string;
  amount: number;
  payment: string;
  cashier: string;
  time: string;
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
  gcash: { label: "QR Ph / GCash", className: "pos-pay-chip--other", icon: Tag },
  ewallet: { label: "E-Wallet", className: "pos-pay-chip--other", icon: Tag },
  customer_credit: { label: "Customer Credit", className: "pos-pay-chip--other", icon: User },
  split: { label: "Split", className: "pos-pay-chip--other", icon: Tag },
};

const paymentMethodOrder = ["cash", "gcash", "card", "bank_transfer", "customer_credit", "split"];
const LOAD_TIMEOUT_MS = 20000;

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

function formatCompatibilityList(list?: Array<{ motorcycle_model?: CompatibilityModelRow | CompatibilityModelRow[] | null }> | null) {
  if (!list?.length) return [];

  return list
    .flatMap((entry) => {
      const models = Array.isArray(entry.motorcycle_model)
        ? entry.motorcycle_model
        : entry.motorcycle_model
          ? [entry.motorcycle_model]
          : [];

      return models.map((model) => {
      const yearRange =
        model.year_from || model.year_to
          ? ` ${model.year_from ?? ""}${model.year_to ? `-${model.year_to}` : ""}`.trimEnd()
          : "";
      const engineType = model.engine_type ? ` ${model.engine_type}` : "";
      return `${model.brand} ${model.model_name}${engineType}${yearRange}`.trim();
      });
    })
    .filter(Boolean);
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

function getCartUnitPrice(item: CartItem) {
  return item.overridePrice ?? item.price;
}

function getCartItemDiscount(item: CartItem) {
  return item.itemDiscountAmount ?? 0;
}

function getCartNetUnitPrice(item: CartItem) {
  return Math.max(0, getCartUnitPrice(item) - getCartItemDiscount(item));
}

function getCartLineTotal(item: CartItem) {
  return getCartNetUnitPrice(item) * item.quantity;
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = LOAD_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
}

export default function POSPage() {
  const { canAny } = useRbac();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
  const [selectedBrandFilter, setSelectedBrandFilter] = useState("all");
  const [selectedMotorcycleFilter, setSelectedMotorcycleFilter] = useState("all");
  const [selectedEngineFilter, setSelectedEngineFilter] = useState("all");
  const [selectedYearFilter, setSelectedYearFilter] = useState("");
  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransactionRow[]>([]);
  const [recentItems, setRecentItems] = useState<Array<{ sku: string; name: string; price: number; icon: LucideIcon; tint: string }>>([]);
  const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([
    { label: "Total Sales", value: formatPeso(0), icon: Wallet, tone: "blue" },
    { label: "Total Orders", value: "0", icon: ShoppingCart, tone: "violet" },
    { label: "Average Sales", value: formatPeso(0), icon: TicketPercent, tone: "orange" },
  ]);
  const [heldSalesCount, setHeldSalesCount] = useState(0);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState(paymentMethodOrder);
  const [currentShiftId, setCurrentShiftId] = useState<string | null>(null);
  const [shiftReviewId, setShiftReviewId] = useState<string | null>(null);
  const [currentShiftStatus, setCurrentShiftStatus] = useState<string | null>(null);
  const [expectedCash, setExpectedCash] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [reprintingSaleId, setReprintingSaleId] = useState<string | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState | null>(null);
  const [receiptHeader, setReceiptHeader] = useState("WAP Motorparts Trading");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for your purchase!");
  const [shopName, setShopName] = useState("WAP Motorparts Trading");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopTaxId, setShopTaxId] = useState("");
  const [cashDrawerEnabled, setCashDrawerEnabled] = useState(false);
  const [cashDrawerUrl, setCashDrawerUrl] = useState("");

  const deferredSearchValue = useDeferredValue(searchValue);

  useEffect(() => {
    setCurrentProductPage(1);
  }, [selectedBranchId, searchValue, selectedCategoryId, selectedBrandFilter, selectedMotorcycleFilter, selectedEngineFilter, selectedYearFilter]);

  useEffect(() => {
    let isMounted = true;

    const loadProfileAndBranches = async () => {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          if (isMounted) setError(authError.message);
          return;
        }

        if (!authUser) {
          if (isMounted) setError("Please sign in to manage POS.");
          return;
        }

        const [profileResult] = await withTimeout(
          Promise.all([
            authUser?.id
              ? supabase
                  .from("users")
                  .select("id, first_name, last_name, username, email, role_id, branch_id")
                  .eq("auth_id", authUser.id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
          ]),
          "Loading POS branches timed out."
        );

        if (!isMounted) return;

        if (profileResult.error) {
          setError(profileResult.error.message);
        }

        const profileUser = (profileResult.data as UserRow | null) ?? null;
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
        const branches = token ? ((await fetchBranchOptions(token)) as BranchOption[]) : [];
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

        const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
        const defaultBranch = branches.find((branch) => branch.id === savedBranchId)
          ?? branches.find((branch) => branch.id === profileUser?.branch_id)
          ?? branches.find((branch) => branch.is_main)
          ?? branches[0];

        setSelectedBranchId(defaultBranch?.id ?? "");
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load POS branches.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
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

      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const authHeaders = await getAuthHeaders();
        const productCatalogPromise = fetch(`/api/inventory/products?branchId=${encodeURIComponent(selectedBranchId)}`, {
          headers: authHeaders,
        }).then(async (response) => {
          const payload = await response.json() as {
            stockRows?: InventoryStockRow[];
            productRows?: ProductSourceRow[];
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error || "Unable to load products.");
          }

          return payload;
        });

        const [categoryResult, customerResult, catalogResult, branchPricingResult, salesResult, heldSalesResult, shiftResult, settingsResult] = await withTimeout(Promise.all([
          supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order", { ascending: true }),
          supabase
            .from("customers")
            .select("id, name, branch_id, customer_type, email, phone, credit_limit, current_balance, allow_credit, default_credit_terms_days")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          productCatalogPromise,
        supabase
          .from("branch_product_prices")
          .select("product_id, price, is_active")
          .eq("branch_id", selectedBranchId)
          .eq("is_active", true),
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
              .select("id, expected_cash, status")
              .eq("branch_id", selectedBranchId)
              .eq("cashier_id", cashierUserId)
              .in("status", ["open", "pending_approval"])
              .order("opened_at", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("settings")
          .select("key, value")
          .is("branch_id", null)
          .in("key", [
            "pos_receipt_header",
            "pos_receipt_footer",
            "pos_cash_drawer_enabled",
            "pos_cash_drawer_url",
            "shop_name",
            "shop_address",
            "shop_phone",
            "shop_tax_id",
          ]),
        ]), "Loading POS data timed out.");

        if (!isMounted) return;

        if (categoryResult.error || customerResult.error || branchPricingResult.error || salesResult.error || heldSalesResult.error || shiftResult.error || settingsResult.error) {
          setError(
            categoryResult.error?.message
            || customerResult.error?.message
            || branchPricingResult.error?.message
            || salesResult.error?.message
            || heldSalesResult.error?.message
            || shiftResult.error?.message
            || settingsResult.error?.message
            || "Unable to load POS data."
          );
          return;
        }

      const categoryRows = (categoryResult.data ?? []) as CategoryOption[];
      const customerRows = ((customerResult.data ?? []) as CustomerOption[]).filter(
        (customer) => !customer.branch_id || customer.branch_id === selectedBranchId
      );
      const stockRows = (catalogResult.stockRows ?? []) as InventoryStockRow[];
      const productRows = (catalogResult.productRows ?? []) as ProductSourceRow[];
      const stockMap = new Map(stockRows.map((row) => [row.product_id, parseNumber(row.quantity)]));
      const branchPriceMap = new Map(
        ((branchPricingResult.data ?? []) as Array<{ product_id: string; price: string | number | null }>).map((row) => [
          row.product_id,
          parseNumber(row.price),
        ]),
      );
      const salesRows = (salesResult.data ?? []) as SaleRow[];

      const normalizedProducts = productRows
        .filter((product) => product.is_active !== false && String(product.status ?? "active").toLowerCase() !== "inactive")
        .map((product, index) => {
          const visual = getProductVisual(index);
          const compatibleLabels = formatCompatibilityList(product.product_compatibility);
          const compatibilityModels = (product.product_compatibility ?? [])
            .map((entry) => entry.motorcycle_model)
            .filter(Boolean) as CompatibilityModelRow[];
          const category = Array.isArray(product.category) ? product.category[0] : product.category;
          const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;

          return {
            id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode ?? "",
            partNumber: product.part_number ?? "",
            supplierCode: product.supplier_code ?? "",
            shelfLocation: product.shelf_location ?? "",
            price: branchPriceMap.get(product.id) ?? parseNumber(product.selling_price),
            stock: stockMap.get(product.id) ?? 0,
            categoryId: category?.id ?? "",
            categoryName: category?.name ?? "Others",
            brandName: brand?.name ?? "",
            imageUrl: getPrimaryImage(product.product_images),
            compatibleLabels,
            motorcycleModels: compatibilityModels.map((model) => `${model.brand} ${model.model_name}`.trim()),
            engineTypes: compatibilityModels.map((model) => model.engine_type ?? "").filter(Boolean),
            yearModels: compatibilityModels.flatMap((model) => [model.year_from, model.year_to]
              .filter((year): year is number => Number.isFinite(year))
              .map((year) => String(year))),
            icon: visual.icon,
            tint: visual.tint,
          } satisfies ProductCard;
        });

      const saleIds = salesRows.map((sale) => sale.id);
      const customerIds = Array.from(new Set(salesRows.map((sale) => sale.customer_id).filter(Boolean))) as string[];
      const cashierIds = Array.from(new Set(salesRows.map((sale) => sale.cashier_id).filter(Boolean)));

        const [paymentResult, saleItemResult, transactionCustomerResult, cashierResult, monthlySalesResult] = await withTimeout(Promise.all([
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
        ]), "Loading POS transactions timed out.");

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
      const methodSet = new Set<string>(["cash", "gcash", "card", "bank_transfer", "customer_credit", "split"]);
      paymentRows.forEach((payment) => {
        const existing = paymentsBySale.get(payment.sale_id) ?? [];
        existing.push(payment.payment_method);
        paymentsBySale.set(payment.sale_id, existing);
        methodSet.add(payment.payment_method);
      });

      const transactions = salesRows.slice(0, 4).map((sale) => ({
        saleId: sale.id,
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
      const settingsMap = new Map(
        ((settingsResult.data ?? []) as Array<{ key: string; value: string | null }>).map((row) => [row.key, row.value ?? ""])
      );

      setCategories(categoryRows);
      setCustomers(customerRows);
      setProducts(normalizedProducts);
      setReceiptHeader(settingsMap.get("pos_receipt_header") || "WAP Motorparts Trading");
      setReceiptFooter(settingsMap.get("pos_receipt_footer") || "Thank you for your purchase!");
      setShopName(settingsMap.get("shop_name") || "WAP Motorparts Trading");
      setShopAddress(settingsMap.get("shop_address") || "");
      setShopPhone(settingsMap.get("shop_phone") || "");
      setShopTaxId(settingsMap.get("shop_tax_id") || "");
      setCashDrawerEnabled(settingsMap.get("pos_cash_drawer_enabled") === "true");
      setCashDrawerUrl(settingsMap.get("pos_cash_drawer_url") || "");
      setRecentTransactions(transactions);
      setRecentItems(mappedRecentItems);
      setSummaryCards([
        { label: "Total Sales", value: formatPeso(grossSales), icon: Wallet, tone: "blue" },
        { label: "Total Orders", value: totalOrders.toLocaleString("en-PH"), icon: ShoppingCart, tone: "violet" },
        { label: "Average Sales", value: formatPeso(averageSales), icon: TicketPercent, tone: "orange" },
      ]);
      setHeldSalesCount(heldSalesResult.count ?? 0);
      setAvailablePaymentMethods(paymentMethodOrder.filter((method) => methodSet.has(method)));
      const activeShift = (shiftResult.data?.[0] as { id: string; status?: string; expected_cash?: number | string | null } | undefined) ?? undefined;
      setShiftReviewId(activeShift?.id ?? null);
      setCurrentShiftStatus(activeShift?.status ?? null);
      setCurrentShiftId(activeShift?.status === "open" ? activeShift.id : null);
      setExpectedCash(parseNumber(activeShift?.expected_cash));
        setLoading(false);

        if (!(shiftResult.data ?? []).length) {
          setSalesNote((current) => current || "No open cash shift found for this cashier.");
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to load POS data.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadPosData();

    return () => {
      isMounted = false;
    };
  }, [selectedBranchId, cashierUserId, cashierName, refreshToken]);

  useEffect(() => {
    const handleBranchChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) {
        setSelectedBranchId(detail.id);
      }
    };

    window.addEventListener("branch-changed", handleBranchChanged);
    return () => window.removeEventListener("branch-changed", handleBranchChanged);
  }, []);

  const categoryTabs = [
    { id: "all", name: "All Items" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  const canApplyDiscount = canAny("pos:apply_discount", "pos:manage");
  const canOverridePrice = canAny("pos:edit", "pos:manage");
  const motorcycleFilterOptions = Array.from(new Set(products.flatMap((product) => product.motorcycleModels))).sort();
  const engineFilterOptions = Array.from(new Set(products.flatMap((product) => product.engineTypes))).sort();
  const brandFilterOptions = Array.from(new Set(products.map((product) => product.brandName).filter(Boolean))).sort();

  const normalizedQuery = deferredSearchValue.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategoryId === "all" || product.categoryId === selectedCategoryId;
    if (!matchesCategory) return false;

    const matchesBrand = selectedBrandFilter === "all" || product.brandName.toLowerCase() === selectedBrandFilter.toLowerCase();
    if (!matchesBrand) return false;

    const matchesMotorcycle = selectedMotorcycleFilter === "all"
      || product.motorcycleModels.some((value) => value.toLowerCase() === selectedMotorcycleFilter.toLowerCase());
    if (!matchesMotorcycle) return false;

    const matchesEngine = selectedEngineFilter === "all"
      || product.engineTypes.some((value) => value.toLowerCase() === selectedEngineFilter.toLowerCase());
    if (!matchesEngine) return false;

    const yearFilter = selectedYearFilter.trim();
    const matchesYear = !yearFilter || product.yearModels.includes(yearFilter);
    if (!matchesYear) return false;

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
      ...product.compatibleLabels,
      ...product.motorcycleModels,
      ...product.engineTypes,
      ...product.yearModels,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const productsPerPage = 10;
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const safeProductPage = Math.min(currentProductPage, totalProductPages);
  const paginatedProducts = filteredProducts.slice(
    (safeProductPage - 1) * productsPerPage,
    safeProductPage * productsPerPage
  );

  useEffect(() => {
    if (safeProductPage !== currentProductPage) {
      setCurrentProductPage(safeProductPage);
    }
  }, [currentProductPage, safeProductPage]);

  const subtotal = cartItems.reduce((sum, item) => sum + getCartLineTotal(item), 0);
  const discountAmount = canApplyDiscount ? Math.min(parseNumber(discountValue), subtotal) : 0;
  const taxableBase = Math.max(subtotal - discountAmount, 0);
  const tax = taxableBase * 0.12;
  const total = taxableBase + tax;

  const selectedBranch = branchOptions.find((branch) => branch.id === selectedBranchId);
  const branchSelectValue = selectedBranchId || selectedBranch?.id || "";
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const selectedCustomerCredit = selectedCustomer
    ? {
        creditLimit: parseNumber(selectedCustomer.credit_limit),
        currentBalance: parseNumber(selectedCustomer.current_balance),
        availableCredit: Math.max(
          0,
          parseNumber(selectedCustomer.credit_limit) - parseNumber(selectedCustomer.current_balance)
        ),
        allowCredit: selectedCustomer.allow_credit ?? true,
        defaultCreditTermsDays: Number(selectedCustomer.default_credit_terms_days ?? 30),
      }
    : null;
  const editingCartItem = cartItems.find((item) => item.id === editingCartItemId) ?? null;

  const handleBranchSelection = (branchId: string) => {
    setSelectedBranchId(branchId);
    setCurrentProductPage(1);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("active_branch_id", branchId);
      window.dispatchEvent(new CustomEvent("branch-changed", { detail: { id: branchId } }));
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F9") return;
      event.preventDefault();
      if (!currentShiftId) {
        setShowShiftModal(true);
        return;
      }
      if (cartItems.length) {
        setShowPaymentModal(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartItems.length, currentShiftId]);

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

  const applyItemPricing = (
    productId: string,
    overridePrice: number | undefined,
    itemDiscountType: string | undefined,
    itemDiscountValue: number,
    itemDiscountAmount: number,
    approvedByUserId?: string
  ) => {
    setCartItems((current) =>
      current.map((item) =>
        item.id === productId
          ? {
              ...item,
              overridePrice,
              itemDiscountType,
              itemDiscountValue: itemDiscountType ? itemDiscountValue : 0,
              itemDiscountAmount: itemDiscountType ? itemDiscountAmount : 0,
              approvedByUserId,
            }
          : item
      )
    );
  };

  const handleSearchSubmit = async (rawInput?: string) => {
    const rawValue = (rawInput ?? searchValue).trim();
    if (!rawValue) return;

    setError("");

    try {
      const response = await fetch(`/api/barcodes/resolve?value=${encodeURIComponent(rawValue)}`, {
        headers: await getAuthHeaders(),
      });
      const payload = await response.json();

      if (response.status === 409) {
        setError("More than one product matched this barcode. Review duplicate mappings in Barcode Studio.");
        return;
      }

      if (response.ok && payload.found && payload.productId) {
        const matchedProduct = products.find((product) => product.id === payload.productId);
        if (!matchedProduct) {
          setError("Barcode matched a product that is not stocked in the selected branch.");
          return;
        }

        addToCart(matchedProduct);
        setSearchValue("");
        return;
      }
    } catch {
      // Fall back to the already-loaded branch product list if the barcode API is unavailable.
    }

    const localMatch = products.find((product) =>
      [product.barcode, product.sku, product.partNumber, product.supplierCode]
        .filter(Boolean)
        .some((value) => value.trim().toLowerCase() === rawValue.toLowerCase())
    );

    if (localMatch) {
      addToCart(localMatch);
      setSearchValue("");
      return;
    }

    setError("No exact barcode, SKU, supplier code, or part number match found.");
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscountValue("0");
    setSelectedCustomerId("walk-in");
    setSalesNote("");
  };

  const cartPayload = cartItems.map((item) => ({
    productId: item.id,
    quantity: item.quantity,
    unitPrice: getCartUnitPrice(item),
    discountType: item.itemDiscountType,
    discountValue: item.itemDiscountValue ?? 0,
    discountAmount: item.itemDiscountAmount ?? 0,
    approvedByUserId: item.approvedByUserId,
    totalPrice: getCartLineTotal(item),
  }));

  const refreshPosData = () => {
    setRefreshToken((current) => current + 1);
  };

  const holdOrder = async () => {
    if (!cartPayload.length || !selectedBranchId || !cashierUserId) return;

    setError("");
    const response = await fetch("/api/pos/hold-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify({
        branchId: selectedBranchId,
        cashierId: cashierUserId,
        customerId: selectedCustomer?.id ?? null,
        items: cartPayload,
        subtotal,
        discountAmount,
        taxAmount: tax,
        totalAmount: total,
        notes: salesNote,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to hold this order.");
      return;
    }

    clearCart();
    refreshPosData();
  };

  const recallHeldSale = async (sale: HeldSaleRecall) => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    const recalledItems = sale.items
      .map((item) => {
        const product = productMap.get(item.product_id);
        return product
          ? {
              ...product,
              quantity: item.quantity,
              overridePrice: item.unit_price !== undefined && Math.abs(item.unit_price - product.price) > 0.009 ? item.unit_price : undefined,
              itemDiscountType: item.discount_type ?? undefined,
              itemDiscountValue: item.discount_value ?? 0,
              itemDiscountAmount: item.discount_amount ?? 0,
            }
          : null;
      })
      .filter(Boolean) as CartItem[];

    if (!recalledItems.length) return;

    setCartItems(recalledItems);
    setSelectedCustomerId(customers.find((customer) => customer.name === sale.customer_name)?.id ?? "walk-in");
    await supabase.from("sale_items").delete().eq("sale_id", sale.id);
    await supabase.from("sales").delete().eq("id", sale.id);
    refreshPosData();
  };

  const handlePaymentSuccess = (payload: PaymentSuccessPayload) => {
    setReceiptState({
      saleId: payload.saleId,
      invoiceNumber: payload.invoiceNumber,
      issuedAt: new Date().toISOString(),
      payments: payload.payments,
      amountPaid: payload.amountPaid,
      changeAmount: payload.changeAmount,
      customerName: selectedCustomer?.name ?? "Walk-in Customer",
      customerEmail: selectedCustomer?.email ?? null,
      customerPhone: selectedCustomer?.phone ?? null,
      shopName,
      shopAddress,
      shopPhone,
      shopTaxId,
      items: cartItems.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: getCartUnitPrice(item),
        discountAmount: (item.itemDiscountAmount ?? 0) * item.quantity,
        totalPrice: getCartLineTotal(item),
      })),
      subtotal,
      discountAmountTotal: discountAmount,
      taxAmount: tax,
      total,
    });
    setShowPaymentModal(false);
    setShowReceiptModal(true);
    clearCart();
    refreshPosData();
  };

  const handleReprintReceipt = async (saleId: string) => {
    setReprintingSaleId(saleId);
    setError("");

    try {
      const response = await fetch(`/api/pos/receipt?saleId=${encodeURIComponent(saleId)}`, {
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load receipt.");

      setReceiptState({
        saleId: data.saleId,
        invoiceNumber: data.invoiceNumber,
        issuedAt: data.issuedAt ?? new Date().toISOString(),
        payments: data.payments,
        amountPaid: data.amountPaid,
        changeAmount: data.changeAmount,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        shopName,
        shopAddress,
        shopPhone,
        shopTaxId,
        items: data.items,
        subtotal: data.subtotal,
        discountAmountTotal: data.discountAmount,
        taxAmount: data.taxAmount,
        total: data.total,
      });
      setShowReceiptModal(true);
    } catch (reprintError) {
      setError(reprintError instanceof Error ? reprintError.message : "Unable to load receipt.");
    } finally {
      setReprintingSaleId(null);
    }
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
              <div className="pos-header__copy">
                <span className="pos-header__eyebrow">Checkout Workspace</span>
                <h1 className="pos-header__title">POS / Sales</h1>
                <p className="pos-header__subtitle">Scan barcode or search item to start a sale.</p>
              </div>
            </div>

            <div className="pos-header__actions">
              <div className="pos-chip pos-chip--select">
                <span>Branch</span>
                <select value={branchSelectValue} onChange={(event) => handleBranchSelection(event.target.value)}>
                  {branchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pos-chip">
                <User size={14} />
                <span>Cashier: {cashierName}</span>
              </div>
              <button type="button" className="pos-btn pos-btn--warn" onClick={() => setShowRecallModal(true)}>
                <Play size={14} />
                <span>Hold Sales ({heldSalesCount})</span>
              </button>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={() => setShowRecallModal(true)}>
                <Wallet size={14} />
                <span>Park Sales</span>
              </button>
            </div>
          </header>

          <div className="pos-toolbar">
            <div className="pos-search">
              <Search size={16} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearchSubmit();
                  }
                }}
                placeholder="Scan barcode or search item..."
              />
              <button
                type="button"
                className="pos-search__scan"
                aria-label="Scan barcode"
                onClick={() => setShowCameraScanner(true)}
              >
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

            <div className="pos-tabs" aria-label="Motorparts filters">
              <select value={selectedBrandFilter} onChange={(event) => setSelectedBrandFilter(event.target.value)}>
                <option value="all">All Brands</option>
                {brandFilterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select value={selectedMotorcycleFilter} onChange={(event) => setSelectedMotorcycleFilter(event.target.value)}>
                <option value="all">All Motorcycle Models</option>
                {motorcycleFilterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select value={selectedEngineFilter} onChange={(event) => setSelectedEngineFilter(event.target.value)}>
                <option value="all">All Engine Types</option>
                {engineFilterOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <input
                type="text"
                value={selectedYearFilter}
                onChange={(event) => setSelectedYearFilter(event.target.value)}
                placeholder="Year model"
              />
            </div>

            <button
              type="button"
              className="pos-toolbar__trash"
              aria-label="Clear filters"
              onClick={() => {
                setSearchValue("");
                setSelectedCategoryId("all");
                setSelectedBrandFilter("all");
                setSelectedMotorcycleFilter("all");
                setSelectedEngineFilter("all");
                setSelectedYearFilter("");
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {error ? <div className="pos-status pos-status--error">{error}</div> : null}

          <div className="pos-quick-actions">
            <button type="button" className="pos-btn pos-btn--ghost" onClick={() => setShowShiftModal(true)}>
              <Wallet size={14} />
              <span>
                {currentShiftStatus === "pending_approval" ? "Approve Shift" : currentShiftId ? "Shift Open" : "Open Shift"}
              </span>
            </button>
            <button type="button" className="pos-btn pos-btn--ghost" onClick={() => setShowVoidModal(true)}>
              <Trash2 size={14} />
              <span>Void Sales</span>
            </button>
            <button type="button" className="pos-btn pos-btn--ghost" onClick={() => setShowReturnModal(true)}>
              <TicketPercent size={14} />
              <span>Returns</span>
            </button>
          </div>

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
                    {paginatedProducts.map((product) => (
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

                  {filteredProducts.length ? (
                    <div className="pos-pagination" aria-label="Product pagination">
                      <button
                        type="button"
                        className="pos-pagination__item pos-pagination__item--arrow"
                        disabled={safeProductPage === 1}
                        onClick={() => setCurrentProductPage((current) => Math.max(1, current - 1))}
                        aria-label="Previous page"
                      >
                        ←
                      </button>
                      {Array.from({ length: totalProductPages }, (_, index) => index + 1)
                        .filter((pageNumber) =>
                          pageNumber === 1
                          || pageNumber === totalProductPages
                          || Math.abs(pageNumber - safeProductPage) <= 2
                        )
                        .reduce<Array<number | "...">>((acc, pageNumber, index, source) => {
                          const previous = source[index - 1];
                          if (index > 0 && typeof previous === "number" && pageNumber - previous > 1) {
                            acc.push("...");
                          }
                          acc.push(pageNumber);
                          return acc;
                        }, [])
                        .map((pageNumber, index) => (
                          pageNumber === "..."
                            ? <span key={`ellipsis-${index}`} className="pos-pagination__more">…</span>
                            : (
                              <button
                                key={pageNumber}
                                type="button"
                                className={`pos-pagination__item pos-pagination__page ${safeProductPage === pageNumber ? "pos-pagination__item--active" : ""}`}
                                onClick={() => setCurrentProductPage(pageNumber)}
                              >
                                {pageNumber}
                              </button>
                            )
                        ))}
                      <button
                        type="button"
                        className="pos-pagination__item pos-pagination__item--arrow"
                        disabled={safeProductPage === totalProductPages}
                        onClick={() => setCurrentProductPage((current) => Math.min(totalProductPages, current + 1))}
                        aria-label="Next page"
                      >
                        →
                      </button>
                    </div>
                  ) : null}

                  {!filteredProducts.length ? (
                    <div className="pos-status">
                      {products.length
                        ? "No products matched your current search or filters."
                        : "No active products are available for this branch yet."}
                    </div>
                  ) : null}
                </>
              )}

              <section className="pos-panel pos-panel--recent">
                <div className="pos-panel__header">
                  <h2 className="pos-panel__title">Recent Items</h2>
                  <span className="pos-panel__meta">{recentItems.length} loaded</span>
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
                    <span className="pos-panel__link">View All</span>
                  </div>
                  <div className="pos-transaction-table">
                    <div className="pos-transaction-table__head">
                      <span>Invoice</span>
                      <span>Customer</span>
                      <span>Total Amount</span>
                      <span>Payment</span>
                      <span>Cashier</span>
                      <span>Time</span>
                      <span>Action</span>
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
                          <button
                            type="button"
                            className="pos-btn pos-btn--ghost"
                            onClick={() => void handleReprintReceipt(item.saleId)}
                            disabled={reprintingSaleId === item.saleId}
                          >
                            {reprintingSaleId === item.saleId ? "Loading..." : "Reprint"}
                          </button>
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
                <span>Edit</span>
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
                          {(item.overridePrice !== undefined || (item.itemDiscountAmount ?? 0) > 0) ? (
                            <div className="pos-cart__sku">
                              {item.overridePrice !== undefined ? `Override ${formatPeso(item.overridePrice)}` : "Base Price"}
                              {(item.itemDiscountAmount ?? 0) > 0 ? ` · Discount ${formatPeso(item.itemDiscountAmount ?? 0)}` : ""}
                            </div>
                          ) : null}
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

                      <button
                        type="button"
                        className="pos-btn pos-btn--ghost"
                        onClick={() => setEditingCartItemId(item.id)}
                        disabled={!canApplyDiscount && !canOverridePrice}
                        title={!canApplyDiscount && !canOverridePrice ? "No permission to edit item pricing" : "Adjust item price or discount"}
                      >
                        Adjust
                      </button>
                      <div className="pos-cart__price">{formatPeso(getCartNetUnitPrice(item))}</div>
                      <div className="pos-cart__amount">{formatPeso(getCartLineTotal(item))}</div>
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
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                      disabled={!canApplyDiscount}
                    />
                  </div>
                  {!canApplyDiscount ? <small className="pos-empty-note">Order discount requires POS discount permission.</small> : null}
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
                {availablePaymentMethods.filter((method) => method !== "split").slice(0, 5).map((method) => {
                  const meta = paymentMethodMeta[method] ?? { label: method.replace(/_/g, " "), className: "pos-pay-chip--other", icon: Tag };
                  const Icon = meta.icon;
                  return (
                    <button key={method} type="button" className={`pos-pay-chip ${meta.className}`} title="Available payment method">
                      <Icon size={16} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pos-payment-methods pos-payment-methods--utility">
                <button type="button" className="pos-btn pos-btn--ghost" disabled={!cartItems.length} onClick={() => void holdOrder()}>
                  <Play size={14} />
                  <span>Hold Order</span>
                </button>
              </div>

              <button
                type="button"
                className="pos-pay-now"
                disabled={!cartItems.length || !currentShiftId}
                onClick={() => {
                  if (!currentShiftId) {
                    setShowShiftModal(true);
                    return;
                  }
                  setShowPaymentModal(true);
                }}
                title={!currentShiftId ? "Open a cashier shift first." : "Process payment"}
              >
                <Wallet size={17} />
                <span>{currentShiftId ? "Pay Now (F9)" : "Open Shift To Pay"}</span>
              </button>
            </aside>
          </div>
        </section>

        <div className="pos-mobile-checkout">
          <div>
            <div className="pos-mobile-checkout__label">Cart Total</div>
            <div className="pos-mobile-checkout__value">{formatPeso(total)}</div>
          </div>
          <button
            type="button"
            disabled={!cartItems.length || !currentShiftId}
            onClick={() => {
              if (!currentShiftId) {
                setShowShiftModal(true);
                return;
              }
              setShowPaymentModal(true);
            }}
          >
            {currentShiftId ? "Checkout" : "Open Shift"}
          </button>
        </div>

        {showPaymentModal ? (
          <PaymentModal
            cartItems={cartPayload}
            subtotal={subtotal}
            discountAmount={discountAmount}
            taxAmount={tax}
            total={total}
            customerId={selectedCustomer?.id ?? null}
            customerName={selectedCustomer?.name ?? "Walk-in Customer"}
            customerCredit={selectedCustomerCredit}
            branchId={selectedBranchId}
            cashierId={cashierUserId}
            shiftId={currentShiftId}
            notes={salesNote}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={handlePaymentSuccess}
          />
        ) : null}

        {showReceiptModal && receiptState ? (
          <ReceiptModal
            invoiceNumber={receiptState.invoiceNumber}
            saleId={receiptState.saleId}
            branchName={selectedBranch?.name ?? "Branch"}
            cashierName={cashierName}
            customerName={receiptState.customerName}
            customerEmail={receiptState.customerEmail}
            customerPhone={receiptState.customerPhone}
            issuedAt={receiptState.issuedAt}
            shopName={receiptState.shopName}
            shopAddress={receiptState.shopAddress}
            shopPhone={receiptState.shopPhone}
            shopTaxId={receiptState.shopTaxId}
            items={receiptState.items}
            subtotal={receiptState.subtotal}
            discountAmount={receiptState.discountAmountTotal}
            taxAmount={receiptState.taxAmount}
            total={receiptState.total}
            payments={receiptState.payments}
            amountPaid={receiptState.amountPaid}
            changeAmount={receiptState.changeAmount}
            receiptHeader={receiptHeader}
            receiptFooter={receiptFooter}
            cashDrawerEnabled={cashDrawerEnabled}
            cashDrawerUrl={cashDrawerUrl}
            onClose={() => {
              setShowReceiptModal(false);
              setReceiptState(null);
            }}
          />
        ) : null}

        {showRecallModal ? (
          <RecallModal
            branchId={selectedBranchId}
            onClose={() => setShowRecallModal(false)}
            onRecall={recallHeldSale}
          />
        ) : null}

        {showVoidModal ? (
          <VoidModal
            branchId={selectedBranchId}
            cashierId={cashierUserId}
            onClose={() => setShowVoidModal(false)}
            onSuccess={refreshPosData}
          />
        ) : null}

        {showReturnModal ? (
          <ReturnModal
            branchId={selectedBranchId}
            cashierId={cashierUserId}
            onClose={() => setShowReturnModal(false)}
            onSuccess={refreshPosData}
          />
        ) : null}

        {showShiftModal ? (
          <ShiftModal
            branchId={selectedBranchId}
            cashierId={cashierUserId}
            cashierName={cashierName}
            currentShiftId={shiftReviewId}
            expectedCash={expectedCash}
            onClose={() => setShowShiftModal(false)}
            onSuccess={(shiftId) => {
              setCurrentShiftId(shiftId);
              setShiftReviewId(shiftId);
              setCurrentShiftStatus(shiftId ? "open" : null);
              setShowShiftModal(false);
              refreshPosData();
            }}
          />
        ) : null}

        {editingCartItem ? (
          <ItemDiscountModal
            item={editingCartItem}
            canOverridePrice={canOverridePrice}
            canApplyDiscount={canApplyDiscount}
            onClose={() => setEditingCartItemId(null)}
            onApply={applyItemPricing}
          />
        ) : null}

        {showCameraScanner ? (
          <CameraScanModal
            onClose={() => setShowCameraScanner(false)}
            onDetected={(code) => {
              setSearchValue(code);
              void handleSearchSubmit(code);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

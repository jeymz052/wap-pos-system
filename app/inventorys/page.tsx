"use client";

import { useEffect, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Barcode,
  Box,
  Boxes,
  CircleAlert,
  CircleCheckBig,
  CircleOff,
  Eye,
  History,
  ImageIcon,
  PackagePlus,
  Pencil,
  Search,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import BarcodeStudioModal from "@/components/barcodes/BarcodeStudioModal";
import { supabase } from "@/lib/supabase";
import { fetchBranchOptions } from "@/lib/branch-options";
import { useRbac } from "@/components/RbacProvider";
import { useSubscriptionAccess } from "@/components/SubscriptionProvider";
import { formatPlanName } from "@/lib/subscription-config";

type BranchOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type FilterOption = {
  id: string;
  name: string;
};

type MotorcycleModelOption = {
  id: string;
  brand: string;
  model_name: string;
  engine_type?: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

type ProductImageRow = {
  url: string;
  is_primary?: boolean | null;
  sort_order?: number | null;
};

type ProductVariantRow = {
  id?: string;
  variant_name?: string | null;
  variant_value?: string | null;
  sku?: string | null;
  barcode?: string | null;
  additional_cost?: string | number | null;
  additional_price?: string | number | null;
  additional_wholesale_price?: string | number | null;
  minimum_price?: string | number | null;
  product_variant_stocks?: Array<{
    quantity?: number | null;
    branch_id?: string | null;
  }> | null;
};

type InventoryBatchRow = {
  id: string;
  batch_number: string;
  quantity_received: number;
  quantity_on_hand: number;
  expiry_date?: string | null;
  created_at: string;
};

type InventorySerialRow = {
  id: string;
  serial_number: string;
  status: string;
  created_at: string;
};

type CompatibilityRow = {
  notes?: string | null;
  motorcycle_model?: MotorcycleModelOption | null;
};

type InventorySourceRow = {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  updated_at: string;
  branch?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
    part_number?: string | null;
    sku: string;
    barcode?: string | null;
    supplier_code?: string | null;
    unit_type?: string | null;
    cost_price?: string | number | null;
    selling_price?: string | number | null;
    wholesale_price?: string | number | null;
    minimum_price?: string | number | null;
    reorder_level?: number | null;
    critical_stock_level?: number | null;
    shelf_location?: string | null;
    warranty_period_days?: number | null;
    status?: string | null;
    has_serial_tracking?: boolean | null;
    has_batch_tracking?: boolean | null;
    has_expiry_tracking?: boolean | null;
    category?: {
      id: string;
      name: string;
    } | null;
    brand?: {
      id: string;
      name: string;
    } | null;
    supplier?: {
      id: string;
      name: string;
    } | null;
    product_variants?: ProductVariantRow[] | null;
    product_images?: ProductImageRow[] | null;
    product_compatibility?: CompatibilityRow[] | null;
  } | null;
};

type MovementRow = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string | null;
  notes?: string | null;
  created_at: string;
};

type InventoryItem = {
  id: string;
  inventoryId: string;
  name: string;
  sku: string;
  partNumber: string;
  barcode: string;
  supplierCode: string;
  unitType: string;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  minimumPrice: number;
  quantity: number;
  reorderLevel: number;
  criticalStockLevel: number;
  shelfLocation: string;
  warrantyDays: number;
  status: string;
  hasSerialTracking: boolean;
  hasBatchTracking: boolean;
  hasExpiryTracking: boolean;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  imageUrl: string;
  compatibleModelIds: string[];
  compatibleModels: string[];
  variants: ProductVariantForm[];
  updatedAt: string;
};

type InventorySnapshot = {
  items: InventoryItem[];
  topMovingItems: Array<{ productId: string; quantity: number }>;
};

type StatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "inactive";
type DialogMode = "create" | "edit";
type ProductStep = "identity" | "pricingStock" | "variantsFitment" | "mediaHistory";
type InventoryQuickAction = "adjust" | "transfer" | "audit";
type QuickActionReason = "adjustment" | "damage" | "return_in" | "return_out";

type QuickActionFormState = {
  adjustMode: "delta" | "set";
  adjustReason: QuickActionReason;
  adjustQuantity: string;
  adjustNotes: string;
  transferBranchId: string;
  transferQuantity: string;
  transferNotes: string;
  auditCountedQuantity: string;
  auditNotes: string;
};

type ProductVariantForm = {
  id?: string;
  variantName: string;
  variantValue: string;
  sku: string;
  barcode: string;
  additionalCost: string;
  additionalPrice: string;
  additionalWholesalePrice: string;
  minimumPrice: string;
  quantity: string;
};

type ProductFormState = {
  name: string;
  partNumber: string;
  sku: string;
  barcode: string;
  supplierCode: string;
  categoryId: string;
  brandId: string;
  supplierId: string;
  unitType: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  minimumPrice: string;
  quantity: string;
  reorderLevel: string;
  criticalStockLevel: string;
  shelfLocation: string;
  warrantyDays: string;
  status: "active" | "inactive";
  hasSerialTracking: boolean;
  hasBatchTracking: boolean;
  hasExpiryTracking: boolean;
  compatibleModelIds: string[];
  imageUrl: string;
  variants: ProductVariantForm[];
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

type InventoryValuationRow = {
  product_id: string;
  quantity: number;
  total_cost_value: number | string;
  total_retail_value: number | string;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-PH");
const pieColors = ["#2563eb", "#ef4444", "#f97316", "#16a34a", "#7c3aed", "#0891b2"];
const itemsPerPage = 10;
const productSteps: Array<{ id: ProductStep; label: string; subtitle: string }> = [
  { id: "identity", label: "Identity", subtitle: "Product, SKU, barcode, brand, and tracking" },
  { id: "pricingStock", label: "Pricing & Stock", subtitle: "Prices, quantity, reorder, and location" },
  { id: "variantsFitment", label: "Variants & Fitment", subtitle: "Variants and motorcycle compatibility" },
  { id: "mediaHistory", label: "Media & History", subtitle: "Images and stock movement history" },
];

function createEmptyVariant(): ProductVariantForm {
  return {
    variantName: "",
    variantValue: "",
    sku: "",
    barcode: "",
    additionalCost: "0",
    additionalPrice: "0",
    additionalWholesalePrice: "0",
    minimumPrice: "0",
    quantity: "0",
  };
}

function normalizeVariantRows(rows?: ProductVariantRow[] | null, branchId?: string): ProductVariantForm[] {
  if (!rows?.length) return [];

  return rows.map((row) => ({
    id: row.id,
    variantName: row.variant_name ?? "",
    variantValue: row.variant_value ?? "",
    sku: row.sku ?? "",
    barcode: row.barcode ?? "",
    additionalCost: String(parseNumber(row.additional_cost)),
    additionalPrice: String(parseNumber(row.additional_price)),
    additionalWholesalePrice: String(parseNumber(row.additional_wholesale_price)),
    minimumPrice: String(parseNumber(row.minimum_price)),
    quantity: String(
      row.product_variant_stocks?.find((stock) => !branchId || stock.branch_id === branchId)?.quantity ?? 0
    ),
  }));
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value).replace("PHP", "\u20b1");
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatQuantity(quantity: number, unitType: string) {
  return `${numberFormatter.format(quantity)} ${unitType || "pcs"}`;
}

function formatSignedQuantity(quantity: number, unitType: string) {
  const prefix = quantity > 0 ? "+" : "";
  return `${prefix}${numberFormatter.format(quantity)} ${unitType || "pcs"}`;
}

function getStockStatus(item: InventoryItem) {
  if (item.status !== "active") return "inactive";
  if (item.quantity <= 0) return "out_of_stock";
  if (item.quantity <= Math.max(item.reorderLevel, item.criticalStockLevel)) return "low_stock";
  return "in_stock";
}

function getStatusLabel(status: string) {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
    case "inactive":
      return "Inactive";
    default:
      return "Unknown";
  }
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

function formatCompatibilityList(list: CompatibilityRow[] | null | undefined) {
  if (!list?.length) return { labels: [] as string[], ids: [] as string[] };

  const labels = list
    .map((entry) => {
      const model = entry.motorcycle_model;
      if (!model) return "";

      const yearRange =
        model.year_from || model.year_to
          ? ` ${model.year_from ?? ""}${model.year_to ? `-${model.year_to}` : ""}`.trimEnd()
          : "";
      const engineType = model.engine_type ? ` ${model.engine_type}` : "";
      return `${model.brand} ${model.model_name}${engineType}${yearRange}`.trim();
    })
    .filter(Boolean);

  const ids = list
    .map((entry) => entry.motorcycle_model?.id ?? "")
    .filter(Boolean);

  return { labels, ids };
}

function createEmptyFormState(): ProductFormState {
  return {
    name: "",
    partNumber: "",
    sku: "",
    barcode: "",
    supplierCode: "",
    categoryId: "",
    brandId: "",
    supplierId: "",
    unitType: "pcs",
    costPrice: "0",
    sellingPrice: "0",
    wholesalePrice: "0",
    minimumPrice: "0",
    quantity: "0",
    reorderLevel: "0",
    criticalStockLevel: "0",
    shelfLocation: "",
    warrantyDays: "0",
    status: "active",
    hasSerialTracking: false,
    hasBatchTracking: false,
    hasExpiryTracking: false,
    compatibleModelIds: [],
    imageUrl: "",
    variants: [],
  };
}

function createFormStateFromItem(item: InventoryItem): ProductFormState {
  return {
    name: item.name,
    partNumber: item.partNumber,
    sku: item.sku,
    barcode: item.barcode,
    supplierCode: item.supplierCode,
    categoryId: item.categoryId,
    brandId: item.brandId,
    supplierId: item.supplierId,
    unitType: item.unitType,
    costPrice: String(item.costPrice),
    sellingPrice: String(item.sellingPrice),
    wholesalePrice: String(item.wholesalePrice),
    minimumPrice: String(item.minimumPrice),
    quantity: String(item.quantity),
    reorderLevel: String(item.reorderLevel),
    criticalStockLevel: String(item.criticalStockLevel),
    shelfLocation: item.shelfLocation,
    warrantyDays: String(item.warrantyDays),
    status: item.status === "inactive" ? "inactive" : "active",
    hasSerialTracking: item.hasSerialTracking,
    hasBatchTracking: item.hasBatchTracking,
    hasExpiryTracking: item.hasExpiryTracking,
    compatibleModelIds: item.compatibleModelIds,
    imageUrl: item.imageUrl,
    variants: item.variants,
  };
}

function formatMovementType(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchInventorySnapshot(selectedBranchId: string, token: string): Promise<InventorySnapshot> {
  const response = await fetch(`/api/inventory/snapshot?branchId=${encodeURIComponent(selectedBranchId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = (await response.json()) as {
    inventoryRows?: InventorySourceRow[];
    movementRows?: Array<{ product_id: string; quantity: number }>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || "Unable to load inventory snapshot.");
  }

  const rows = (result.inventoryRows ?? []) as InventorySourceRow[];
  const normalizedItems = rows
    .filter((row) => row.product)
    .map((row) => {
      const product = row.product!;
      const compatibility = formatCompatibilityList(product.product_compatibility);

      return {
        id: product.id,
        inventoryId: row.id,
        name: product.name,
        sku: product.sku,
        partNumber: product.part_number ?? "",
        barcode: product.barcode ?? "",
        supplierCode: product.supplier_code ?? "",
        unitType: product.unit_type ?? "pcs",
        costPrice: parseNumber(product.cost_price),
        sellingPrice: parseNumber(product.selling_price),
        wholesalePrice: parseNumber(product.wholesale_price),
        minimumPrice: parseNumber(product.minimum_price),
        quantity: row.quantity,
        reorderLevel: product.reorder_level ?? 0,
        criticalStockLevel: product.critical_stock_level ?? 0,
        shelfLocation: product.shelf_location ?? "",
        warrantyDays: product.warranty_period_days ?? 0,
        status: product.status ?? "active",
        hasSerialTracking: Boolean(product.has_serial_tracking),
        hasBatchTracking: Boolean(product.has_batch_tracking),
        hasExpiryTracking: Boolean(product.has_expiry_tracking),
        categoryId: product.category?.id ?? "",
        categoryName: product.category?.name ?? "Uncategorized",
        brandId: product.brand?.id ?? "",
        brandName: product.brand?.name ?? "No Brand",
        supplierId: product.supplier?.id ?? "",
        supplierName: product.supplier?.name ?? "No Supplier",
        branchId: row.branch_id,
        branchName: row.branch?.name ?? "Branch",
        imageUrl: getPrimaryImage(product.product_images),
        compatibleModelIds: compatibility.ids,
        compatibleModels: compatibility.labels,
        variants: normalizeVariantRows(product.product_variants, selectedBranchId),
        updatedAt: row.updated_at,
      } satisfies InventoryItem;
    });

  const movementRows = (result.movementRows ?? []) as Array<{ product_id: string; quantity: number }>;
  const movementMap = new Map<string, number>();

  movementRows.forEach((entry) => {
    movementMap.set(entry.product_id, (movementMap.get(entry.product_id) ?? 0) + Math.abs(entry.quantity));
  });

  const topMovingItems = Array.from(movementMap.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([productId, quantity]) => ({ productId, quantity }));

  return {
    items: normalizedItems,
    topMovingItems,
  };
}

export default function InventoryPage() {
  const { canAny } = useRbac();
  const { hasFeature, requiredPlanFor } = useSubscriptionAccess();
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [suppliers, setSuppliers] = useState<FilterOption[]>([]);
  const [motorcycleModels, setMotorcycleModels] = useState<MotorcycleModelOption[]>([]);
  const canViewCostPrice = canAny("inventory:view_cost_price", "inventory:manage");
  const canEditInventory = canAny("inventory:edit", "inventory:manage");
  const canDeleteProduct = canAny("inventory:delete", "inventory:manage");
  const canUseBarcodePrinting = hasFeature("barcode_printing");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [topMovingItems, setTopMovingItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("active_branch_id") ?? "";
  });
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [selectedBrandId, setSelectedBrandId] = useState("all");
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [activeStep, setActiveStep] = useState<ProductStep>("identity");
  const [editingItemId, setEditingItemId] = useState("");
  const [quickActionOpen, setQuickActionOpen] = useState<InventoryQuickAction | null>(null);
  const [quickActionState, setQuickActionState] = useState<QuickActionFormState>({
    adjustMode: "delta",
    adjustReason: "adjustment",
    adjustQuantity: "1",
    adjustNotes: "",
    transferBranchId: "",
    transferQuantity: "1",
    transferNotes: "",
    auditCountedQuantity: "0",
    auditNotes: "",
  });
  const [barcodeStudioOpen, setBarcodeStudioOpen] = useState(false);
  const [barcodeStudioProductId, setBarcodeStudioProductId] = useState("");
  const [selectedBarcodeIds, setSelectedBarcodeIds] = useState<string[]>([]);
  const [formState, setFormState] = useState<ProductFormState>(createEmptyFormState());
  const [historyRows, setHistoryRows] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatchRow[]>([]);
  const [inventorySerials, setInventorySerials] = useState<InventorySerialRow[]>([]);
  const [valuationTotals, setValuationTotals] = useState({ cost: 0, retail: 0 });
  const [expiringBatchItems, setExpiringBatchItems] = useState<InventoryBatchRow[]>([]);
  const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") ?? "" : "";
  const resolvedBranchId =
    (selectedBranchId && branches.some((branch) => branch.id === selectedBranchId) && selectedBranchId) ||
    (savedBranchId && branches.some((branch) => branch.id === savedBranchId) && savedBranchId) ||
    branches.find((branch) => branch.is_main)?.id ||
    branches[0]?.id ||
    "";

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategoryId(value);
    setPage(1);
  };

  const handleBrandChange = (value: string) => {
    setSelectedBrandId(value);
    setPage(1);
  };

  const handleSupplierChange = (value: string) => {
    setSelectedSupplierId(value);
    setPage(1);
  };

  const handleStatusChange = (value: StatusFilter) => {
    setSelectedStatus(value);
    setPage(1);
  };

  const getAccessToken = async () => {
    const sessionResult = await supabase.auth.getSession();
    return sessionResult.data.session?.access_token ?? "";
  };

  const refreshInventory = async (branchId: string) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    const [snapshot, valuationResult, expiringResult] = await Promise.all([
      fetchInventorySnapshot(branchId, token),
      supabase.from("v_inventory_valuation").select("product_id, quantity, total_cost_value, total_retail_value").eq("branch_id", branchId),
      supabase
        .from("v_expiring_inventory_batches")
        .select("id, batch_number, quantity_received, quantity_on_hand, expiry_date, created_at")
        .eq("branch_id", branchId)
        .order("expiry_date", { ascending: true })
        .limit(5),
    ]);
    setInventoryItems(snapshot.items);
    setTopMovingItems(snapshot.topMovingItems);
    setSelectedBarcodeIds((current) => current.filter((id) => snapshot.items.some((item) => item.id === id)));
    setSelectedItemId((current) => {
      if (current && snapshot.items.some((item) => item.id === current)) return current;
      return snapshot.items[0]?.id ?? "";
    });
    const valuationRows = (valuationResult.data ?? []) as InventoryValuationRow[];
    setValuationTotals({
      cost: valuationRows.reduce((sum, row) => sum + parseNumber(row.total_cost_value), 0),
      retail: valuationRows.reduce((sum, row) => sum + parseNumber(row.total_retail_value), 0),
    });
    setExpiringBatchItems((expiringResult.data ?? []) as InventoryBatchRow[]);
  };

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      const [
        categoryResult,
        brandResult,
        supplierResult,
        motorcycleModelResult,
      ] = await Promise.all([
        supabase.from("categories").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("brands").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("suppliers").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase
          .from("motorcycle_models")
          .select("id, brand, model_name, engine_type, year_from, year_to")
          .eq("is_active", true)
          .order("brand", { ascending: true })
          .order("model_name", { ascending: true }),
      ]);

      if (!isMounted) return;

      const token = (await getAccessToken()).trim();
      const branchRows = token ? ((await fetchBranchOptions(token)) as BranchOption[]) : [];
      const mainBranch = branchRows.find((branch) => branch.is_main) ?? branchRows[0] ?? null;
      const savedBranchId = typeof window !== "undefined" ? window.localStorage.getItem("active_branch_id") : null;

      setBranches(branchRows);
      setCategories((categoryResult.data ?? []) as FilterOption[]);
      setBrands((brandResult.data ?? []) as FilterOption[]);
      setSuppliers((supplierResult.data ?? []) as FilterOption[]);
      setMotorcycleModels((motorcycleModelResult.data ?? []) as MotorcycleModelOption[]);
      setSelectedBranchId((current) => {
        const validBranchIds = new Set(branchRows.map((branch) => branch.id));
        if (current && validBranchIds.has(current)) return current;
        if (savedBranchId && validBranchIds.has(savedBranchId)) return savedBranchId;
        return mainBranch?.id || branchRows[0]?.id || current || "";
      });

      if (!mainBranch?.id) {
        setLoading(false);
      }
    };

    const scheduleLoad = () => {
      void loadLookups();
    };

    void loadLookups();

    const { data: authState } = supabase.auth.onAuthStateChange(() => {
      scheduleLoad();
    });

    return () => {
      isMounted = false;
      authState.subscription.unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    if (!resolvedBranchId) return;

    let isMounted = true;

    const loadInventory = async () => {
      setLoading(true);
      setError("");

      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        const [snapshot, valuationResult, expiringResult] = await Promise.all([
          fetchInventorySnapshot(resolvedBranchId, token),
          supabase.from("v_inventory_valuation").select("product_id, quantity, total_cost_value, total_retail_value").eq("branch_id", resolvedBranchId),
          supabase
            .from("v_expiring_inventory_batches")
            .select("id, batch_number, quantity_received, quantity_on_hand, expiry_date, created_at")
            .eq("branch_id", resolvedBranchId)
            .order("expiry_date", { ascending: true })
            .limit(5),
        ]);
        if (!isMounted) return;
        setInventoryItems(snapshot.items);
        setTopMovingItems(snapshot.topMovingItems);
        setSelectedBarcodeIds((current) => current.filter((id) => snapshot.items.some((item) => item.id === id)));
        setSelectedItemId((current) => {
          if (current && snapshot.items.some((item) => item.id === current)) return current;
          return snapshot.items[0]?.id ?? "";
        });
        const valuationRows = (valuationResult.data ?? []) as InventoryValuationRow[];
        setValuationTotals({
          cost: valuationRows.reduce((sum, row) => sum + parseNumber(row.total_cost_value), 0),
          retail: valuationRows.reduce((sum, row) => sum + parseNumber(row.total_retail_value), 0),
        });
        setExpiringBatchItems((expiringResult.data ?? []) as InventoryBatchRow[]);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadInventory();

    return () => {
      isMounted = false;
    };
  }, [resolvedBranchId]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!dialogOpen || !editingItemId || !resolvedBranchId) return;

    let isMounted = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      const result = await supabase
        .from("stock_movements")
        .select("id, product_id, movement_type, quantity, quantity_before, quantity_after, reference_type, notes, created_at")
        .eq("product_id", editingItemId)
        .eq("branch_id", resolvedBranchId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!isMounted) return;

      setHistoryRows((result.data ?? []) as MovementRow[]);
      setHistoryLoading(false);
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [dialogOpen, editingItemId, resolvedBranchId]);

  useEffect(() => {
    if (!selectedItemId || !resolvedBranchId) return;

    let isMounted = true;

    const loadTrackingData = async () => {
      const [batchResult, serialResult] = await Promise.all([
        supabase
          .from("inventory_batches")
          .select("id, batch_number, quantity_received, quantity_on_hand, expiry_date, created_at")
          .eq("product_id", selectedItemId)
          .eq("branch_id", resolvedBranchId)
          .order("created_at", { ascending: false }),
        supabase
          .from("inventory_serial_numbers")
          .select("id, serial_number, status, created_at")
          .eq("product_id", selectedItemId)
          .eq("branch_id", resolvedBranchId)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (!isMounted) return;
      setInventoryBatches((batchResult.data ?? []) as InventoryBatchRow[]);
      setInventorySerials((serialResult.data ?? []) as InventorySerialRow[]);
    };

    void loadTrackingData();

    return () => {
      isMounted = false;
    };
  }, [selectedItemId, resolvedBranchId]);

  const filteredItems = inventoryItems.filter((item) => {
    const searchNeedle = searchValue.trim().toLowerCase();
    const matchesSearch =
      !searchNeedle ||
      [item.name, item.sku, item.partNumber, item.barcode, item.brandName, item.categoryName, item.supplierName]
        .join(" ")
        .toLowerCase()
        .includes(searchNeedle);
    const matchesCategory = selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
    const matchesBrand = selectedBrandId === "all" || item.brandId === selectedBrandId;
    const matchesSupplier = selectedSupplierId === "all" || item.supplierId === selectedSupplierId;
    const matchesStatus = selectedStatus === "all" || getStockStatus(item) === selectedStatus;

    return matchesSearch && matchesCategory && matchesBrand && matchesSupplier && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const activePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage);
  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ??
    paginatedItems[0] ??
    filteredItems[0] ??
    inventoryItems[0] ??
    null;
  const quickActionItem = selectedItem ?? filteredItems[0] ?? inventoryItems[0] ?? null;

  const totalItems = filteredItems.length;
  const inStockItems = filteredItems.filter((item) => getStockStatus(item) === "in_stock").length;
  const lowStockItems = filteredItems.filter((item) => getStockStatus(item) === "low_stock");
  const outOfStockItems = filteredItems.filter((item) => getStockStatus(item) === "out_of_stock").length;
  const inventoryValue = filteredItems.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  const stockOverviewMap = new Map<string, number>();

  filteredItems.forEach((item) => {
    stockOverviewMap.set(item.categoryName, (stockOverviewMap.get(item.categoryName) ?? 0) + item.quantity);
  });

  const stockOverview = Array.from(stockOverviewMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);

  const topMovingProducts = topMovingItems
    .map((entry) => ({
      quantity: entry.quantity,
      item: inventoryItems.find((item) => item.id === entry.productId) ?? null,
    }))
    .filter((entry): entry is { quantity: number; item: InventoryItem } => Boolean(entry.item));

  const activeBranch = branches.find((branch) => branch.id === resolvedBranchId);
  const activeStepIndex = productSteps.findIndex((step) => step.id === activeStep);
  const isFirstStep = activeStepIndex <= 0;
  const isLastStep = activeStepIndex === productSteps.length - 1;

  const selectedFormModels = motorcycleModels.filter((model) => formState.compatibleModelIds.includes(model.id));
  const barcodeStudioProducts = inventoryItems.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    barcode: item.barcode,
    partNumber: item.partNumber,
    supplierCode: item.supplierCode,
    brandName: item.brandName,
    shelfLocation: item.shelfLocation,
    sellingPrice: item.sellingPrice,
  }));
  const allVisibleSelected = paginatedItems.length > 0 && paginatedItems.every((item) => selectedBarcodeIds.includes(item.id));

  const setFormField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const goToPreviousStep = () => {
    const previousStep = productSteps[Math.max(0, activeStepIndex - 1)]?.id ?? productSteps[0].id;
    setActiveStep(previousStep);
  };

  const goToNextStep = () => {
    const nextStep = productSteps[Math.min(productSteps.length - 1, activeStepIndex + 1)]?.id ?? productSteps[0].id;
    setActiveStep(nextStep);
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setEditingItemId("");
    setFormState(createEmptyFormState());
    setActiveStep("identity");
    setHistoryRows([]);
    setDialogOpen(true);
  };

  const openEditDialog = (item: InventoryItem) => {
    setDialogMode("edit");
    setEditingItemId(item.id);
    setFormState(createFormStateFromItem(item));
    setActiveStep("identity");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving || deleting) return;
    setHistoryRows([]);
    setDialogOpen(false);
  };

  const openBarcodeStudio = (item?: InventoryItem) => {
    if (!canUseBarcodePrinting) {
      setNotice({
        tone: "error",
        message: `Barcode printing requires ${formatPlanName(requiredPlanFor("barcode_printing"))}.`,
      });
      return;
    }

    const targetItem = item ?? selectedItem ?? filteredItems[0] ?? null;
    if (!targetItem) {
      setNotice({ tone: "error", message: "Select a product first to manage or print barcodes." });
      return;
    }

    setBarcodeStudioProductId(targetItem.id);
    setSelectedBarcodeIds((current) => (current.length ? Array.from(new Set([...current, targetItem.id])) : [targetItem.id]));
    setBarcodeStudioOpen(true);
  };

  const openQuickAction = (action: InventoryQuickAction) => {
    const targetItem = selectedItem ?? filteredItems[0] ?? inventoryItems[0] ?? null;
    if (!targetItem) {
      setNotice({ tone: "error", message: "Select an inventory item first." });
      return;
    }

    setSelectedItemId(targetItem.id);
    setQuickActionState({
      adjustMode: "delta",
      adjustReason: action === "adjust" ? "adjustment" : "adjustment",
      adjustQuantity: "1",
      adjustNotes: "",
      transferBranchId: branches.find((branch) => branch.id !== resolvedBranchId)?.id ?? "",
      transferQuantity: "1",
      transferNotes: "",
      auditCountedQuantity: String(targetItem.quantity),
      auditNotes: "",
    });
    setQuickActionOpen(action);
  };

  const closeQuickAction = () => {
    setQuickActionOpen(null);
  };

  const updateQuickActionField = <K extends keyof QuickActionFormState>(key: K, value: QuickActionFormState[K]) => {
    setQuickActionState((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submitQuickAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!quickActionOpen || !quickActionItem || !resolvedBranchId) {
      setNotice({ tone: "error", message: "Select an inventory item first." });
      return;
    }

    try {
      setSaving(true);

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      if (quickActionOpen === "adjust") {
        const quantityValue = Math.max(0, parseNumber(quickActionState.adjustQuantity));
        if (!Number.isFinite(quantityValue)) {
          throw new Error("Adjustment quantity must be a valid number.");
        }

        const signedQuantity =
          quickActionState.adjustMode === "set"
            ? quantityValue
            : quickActionState.adjustReason === "damage" || quickActionState.adjustReason === "return_out"
              ? -Math.abs(quantityValue)
              : Math.abs(quantityValue);

        const response = await fetch("/api/inventory/adjustments", {
          method: "POST",
          headers,
          body: JSON.stringify({
            productId: quickActionItem.id,
            branchId: resolvedBranchId,
            quantity: signedQuantity,
            mode: quickActionState.adjustMode,
            reasonType: quickActionState.adjustReason,
            notes: quickActionState.adjustNotes,
          }),
        });

        const payload = (await response.json()) as { error?: string; quantityAfter?: number };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to save adjustment.");
        }

        setNotice({
          tone: "success",
          message: `Stock adjustment saved. New quantity: ${formatQuantity(payload.quantityAfter ?? quickActionItem.quantity, quickActionItem.unitType)}.`,
        });
      }

      if (quickActionOpen === "transfer") {
        if (!quickActionState.transferBranchId) {
          throw new Error("Select a destination branch.");
        }

        const response = await fetch("/api/inventory/transfers", {
          method: "POST",
          headers,
          body: JSON.stringify({
            productId: quickActionItem.id,
            fromBranchId: resolvedBranchId,
            toBranchId: quickActionState.transferBranchId,
            quantity: Math.max(0, parseNumber(quickActionState.transferQuantity)),
            notes: quickActionState.transferNotes,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to save transfer.");
        }

        setNotice({
          tone: "success",
          message: `Stock transfer saved for ${quickActionItem.name}.`,
        });
      }

      if (quickActionOpen === "audit") {
        const response = await fetch("/api/inventory/stock-counts", {
          method: "POST",
          headers,
          body: JSON.stringify({
            productId: quickActionItem.id,
            branchId: resolvedBranchId,
            countedQuantity: Math.max(0, parseNumber(quickActionState.auditCountedQuantity)),
            notes: quickActionState.auditNotes,
          }),
        });

        const payload = (await response.json()) as { error?: string; variance?: number };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to save stock count.");
        }

        setNotice({
          tone: "success",
          message: `Stock count saved. Variance: ${formatSignedQuantity(payload.variance ?? 0, quickActionItem.unitType)}.`,
        });
      }

      closeQuickAction();
      await refreshInventory(resolvedBranchId);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save inventory action." });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/inventory/upload-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Image upload failed.");
      }

      setFormField("imageUrl", result.url);
      setNotice({ tone: "success", message: "Product image uploaded successfully." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to upload image." });
    } finally {
      setSaving(false);
    }
  };

  const toggleCompatibility = (modelId: string) => {
    setFormState((current) => {
      const exists = current.compatibleModelIds.includes(modelId);
      return {
        ...current,
        compatibleModelIds: exists
          ? current.compatibleModelIds.filter((id) => id !== modelId)
          : [...current.compatibleModelIds, modelId],
      };
    });
  };

  const addVariantRow = () => {
    setFormState((current) => ({
      ...current,
      variants: [...current.variants, createEmptyVariant()],
    }));
  };

  const updateVariantRow = (index: number, field: keyof ProductVariantForm, value: string) => {
    setFormState((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant
      ),
    }));
  };

  const removeVariantRow = (index: number) => {
    setFormState((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  };

  const validateForm = () => {
    if (!formState.name.trim()) return "Product name is required.";
    if (!formState.sku.trim()) return "SKU is required.";
    if (!resolvedBranchId) return "Please select a branch first.";
    return "";
  };

  const handleSaveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setNotice({ tone: "error", message: validationError });
      return;
    }

    setSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/inventory/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: dialogMode === "edit" ? editingItemId : undefined,
          branchId: resolvedBranchId,
          product: {
            name: formState.name.trim(),
            part_number: formState.partNumber.trim() || null,
            sku: formState.sku.trim(),
            barcode: formState.barcode.trim() || null,
            supplier_code: formState.supplierCode.trim() || null,
            category_id: formState.categoryId || null,
            brand_id: formState.brandId || null,
            supplier_id: formState.supplierId || null,
            unit_type: formState.unitType.trim() || "pcs",
            cost_price: parseNumber(formState.costPrice),
            selling_price: parseNumber(formState.sellingPrice),
            wholesale_price: parseNumber(formState.wholesalePrice),
            minimum_price: parseNumber(formState.minimumPrice),
            quantity: Math.max(0, parseNumber(formState.quantity)),
            reorder_level: Math.max(0, parseNumber(formState.reorderLevel)),
            critical_stock_level: Math.max(0, parseNumber(formState.criticalStockLevel)),
            shelf_location: formState.shelfLocation.trim() || null,
            warranty_period_days: Math.max(0, parseNumber(formState.warrantyDays)),
            has_serial_tracking: formState.hasSerialTracking,
            has_batch_tracking: formState.hasBatchTracking,
            has_expiry_tracking: formState.hasExpiryTracking,
            status: formState.status,
          },
          imageUrl: formState.imageUrl.trim(),
          compatibleModelIds: formState.compatibleModelIds,
          variants: formState.variants,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save product.");
      }

      await refreshInventory(resolvedBranchId);
      setDialogOpen(false);
      setNotice({
        tone: "success",
        message: dialogMode === "create" ? "Product added successfully." : "Product updated successfully.",
      });
    } catch (saveError) {
      setNotice({
        tone: "error",
        message: saveError instanceof Error ? saveError.message : "Failed to save product.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (item: InventoryItem) => {
    const confirmed = window.confirm(`Delete "${item.name}"? This will remove the product and its inventory records.`);
    if (!confirmed) return;

    setDeleting(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/inventory/products", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId: item.id, branchId: resolvedBranchId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete product.");
      }

      await refreshInventory(resolvedBranchId);
      if (editingItemId === item.id) {
        setDialogOpen(false);
      }
      setNotice({ tone: "success", message: "Product deleted successfully." });
    } catch (deleteError) {
      setNotice({
        tone: "error",
        message: deleteError instanceof Error ? deleteError.message : "Failed to delete product.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page inventory-page">
      <div className="inventory-shell">
        <div className="inventory-header">
          <div className="inventory-header__title-group">
            <div className="inventory-header__icon">
              <Boxes size={20} />
            </div>
            <div>
              <h1 className="inventory-header__title">Inventory</h1>
              <p className="inventory-header__subtitle">Manage your stock items and inventory</p>
            </div>
          </div>

          <div className="inventory-header__actions">
            <label className="inventory-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search by item name, code or barcode..."
                value={searchValue}
                onChange={(event) => handleSearchChange(event.target.value)}
              />
            </label>
          </div>
        </div>

        {notice ? (
          <div className={`inventory-banner inventory-banner--${notice.tone}`}>
            {notice.message}
          </div>
        ) : null}

        <div className="inventory-stats stats-row">
          <article className="stat-card inventory-stat-card">
            <div className="stat-card__icon stat-card__icon--blue">
              <Box size={20} />
            </div>
            <div className="dashboard-stat-card__content">
              <div className="stat-card__label">Total Items</div>
              <div className="stat-card__value">{numberFormatter.format(totalItems)}</div>
              <div className="stat-card__sub">All inventory items</div>
            </div>
          </article>

          <article className="stat-card inventory-stat-card">
            <div className="stat-card__icon stat-card__icon--green">
              <CircleCheckBig size={20} />
            </div>
            <div className="dashboard-stat-card__content">
              <div className="stat-card__label">In Stock</div>
              <div className="stat-card__value">{numberFormatter.format(inStockItems)}</div>
              <div className="stat-card__sub">
                {totalItems > 0 ? `${((inStockItems / totalItems) * 100).toFixed(1)}% of listed items` : "No items yet"}
              </div>
            </div>
          </article>

          <article className="stat-card inventory-stat-card">
            <div className="stat-card__icon stat-card__icon--orange">
              <AlertTriangle size={20} />
            </div>
            <div className="dashboard-stat-card__content">
              <div className="stat-card__label">Low Stock</div>
              <div className="stat-card__value">{numberFormatter.format(lowStockItems.length)}</div>
              <div className="stat-card__sub">Below reorder or critical level</div>
            </div>
          </article>

          <article className="stat-card inventory-stat-card">
            <div className="stat-card__icon stat-card__icon--red">
              <CircleOff size={20} />
            </div>
            <div className="dashboard-stat-card__content">
              <div className="stat-card__label">Out of Stock</div>
              <div className="stat-card__value">{numberFormatter.format(outOfStockItems)}</div>
              <div className="stat-card__sub">Need to restock</div>
            </div>
          </article>

          <article className="stat-card inventory-stat-card">
            <div className="stat-card__icon stat-card__icon--purple">
              <ShoppingBag size={20} />
            </div>
            <div className="dashboard-stat-card__content">
              <div className="stat-card__label">Total Inventory Value</div>
              <div className="stat-card__value">{formatCurrency(inventoryValue)}</div>
              <div className="stat-card__sub">{activeBranch?.name ?? "Branch"} stock valuation</div>
            </div>
          </article>
        </div>

        <section className="inventory-panel">
          <div className="inventory-toolbar">
            <div className="inventory-toolbar__top">
              <div className="inventory-toolbar__filters">
                <select
                  className="inventory-control"
                  value={selectedCategoryId}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <select
                  className="inventory-control"
                  value={selectedBrandId}
                  onChange={(event) => handleBrandChange(event.target.value)}
                >
                  <option value="all">All Brands</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>

                <select
                  className="inventory-control"
                  value={selectedSupplierId}
                  onChange={(event) => handleSupplierChange(event.target.value)}
                >
                  <option value="all">All Suppliers</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>

                <select
                  className="inventory-control"
                  value={selectedStatus}
                  onChange={(event) => handleStatusChange(event.target.value as StatusFilter)}
                >
                  <option value="all">All Status</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <label className="inventory-toolbar__search">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Search barcode or search item..."
                  value={searchValue}
                  onChange={(event) => handleSearchChange(event.target.value)}
                />
              </label>
              <div className="inventory-toolbar__actions">
                <button type="button" className="inventory-action inventory-action--light">
                  <Upload size={14} />
                  <span>Export</span>
                </button>
                <button type="button" className="inventory-action inventory-action--light">
                  <PackagePlus size={14} />
                  <span>Import</span>
                </button>
                <button type="button" className="inventory-action inventory-action--light" onClick={() => openBarcodeStudio()} disabled={!canUseBarcodePrinting}>
                  <Barcode size={14} />
                  <span>{selectedBarcodeIds.length ? `Barcode Printing (${selectedBarcodeIds.length})` : "Barcode Printing"}</span>
                </button>
                <button type="button" className="inventory-action inventory-action--primary" onClick={openCreateDialog}>
                  <PackagePlus size={14} />
                  <span>Add New Item</span>
                </button>
              </div>
            </div>

            <div className="inventory-toolbar__bottom">
              <div className="inventory-toolbar__actions inventory-toolbar__actions--secondary">
                <button type="button" className="inventory-action inventory-action--light" onClick={() => openQuickAction("adjust")}>
                  <Box size={14} />
                  <span>Stock Adjustment</span>
                </button>
                <button type="button" className="inventory-action inventory-action--light" onClick={() => openQuickAction("transfer")}>
                  <ArrowLeftRight size={14} />
                  <span>Branch Transfer</span>
                </button>
                <button type="button" className="inventory-action inventory-action--light" onClick={() => openQuickAction("audit")}>
                  <History size={14} />
                  <span>Stock Count / Audit</span>
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="inventory-state inventory-state--error">
              <ShieldAlert size={20} />
              <span>{error}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="inventory-state">
              <span>Loading inventory from your database...</span>
            </div>
          ) : (
            <>
            <div className="inventory-content-grid">
              <div className="inventory-main-column">
                <div className="inventory-table-card">
                  <div className="inventory-table-wrap">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={() =>
                              setSelectedBarcodeIds((current) =>
                                allVisibleSelected
                                  ? current.filter((id) => !paginatedItems.some((item) => item.id === id))
                                  : Array.from(new Set([...current, ...paginatedItems.map((item) => item.id)]))
                              )
                            }
                          />
                        </th>
                        <th>#</th>
                        <th>Item Code</th>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th>Brand</th>
                        <th>Cost Price</th>
                        <th>Selling Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item, index) => {
                        const stockStatus = getStockStatus(item);

                        return (
                          <tr
                            key={item.inventoryId}
                            className={selectedItem?.id === item.id ? "inventory-table__row--active" : ""}
                            onClick={() => setSelectedItemId(item.id)}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedBarcodeIds.includes(item.id)}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  setSelectedBarcodeIds((current) =>
                                    current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
                                  );
                                }}
                              />
                            </td>
                            <td>{(activePage - 1) * itemsPerPage + index + 1}</td>
                            <td className="inventory-table__mono">{item.sku}</td>
                            <td>
                              <div className="inventory-item-cell">
                                <div className="inventory-item-cell__thumb">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt={item.name} className="inventory-item-cell__image" />
                                  ) : (
                                    <ImageIcon size={16} />
                                  )}
                                </div>
                                <div>
                                  <div className="inventory-item-cell__name">{item.name}</div>
                                  <div className="inventory-item-cell__meta">
                                    {item.partNumber || item.barcode || item.branchName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>{item.categoryName}</td>
                            <td>{item.brandName}</td>
                            <td>{canViewCostPrice ? formatCurrency(item.costPrice) : "Restricted"}</td>
                            <td>{formatCurrency(item.sellingPrice)}</td>
                            <td>{formatQuantity(item.quantity, item.unitType)}</td>
                            <td>
                              <span className={`inventory-status inventory-status--${stockStatus.replace(/_/g, "-")}`}>
                                {getStatusLabel(stockStatus)}
                              </span>
                            </td>
                            <td>
                              <div className="inventory-row-actions">
                                <button
                                  type="button"
                                  className="inventory-icon-button"
                                  aria-label={`View ${item.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedItemId(item.id);
                                  }}
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="inventory-icon-button"
                                  aria-label={`Open barcode studio for ${item.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openBarcodeStudio(item);
                                  }}
                                >
                                  <Barcode size={13} />
                                </button>
                                {canEditInventory ? (
                                  <button
                                    type="button"
                                    className="inventory-icon-button"
                                    aria-label={`Edit ${item.name}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditDialog(item);
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                ) : null}
                                {canDeleteProduct ? (
                                  <button
                                    type="button"
                                    className="inventory-icon-button inventory-icon-button--danger"
                                    aria-label={`Delete ${item.name}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteProduct(item);
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {!paginatedItems.length ? (
                    <div className="inventory-empty">
                      <CircleAlert size={18} />
                      <span>No inventory items matched your current filters.</span>
                    </div>
                  ) : null}
                </div>

                  <div className="inventory-table-footer">
                    <span>
                      Showing {paginatedItems.length ? (activePage - 1) * itemsPerPage + 1 : 0} to{" "}
                      {Math.min(activePage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items
                    </span>

                    <div className="inventory-pagination">
                      <button
                        type="button"
                        className="inventory-pagination__button"
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={activePage <= 1}
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span className="inventory-pagination__current">{activePage}</span>
                      <button
                        type="button"
                        className="inventory-pagination__button"
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        disabled={activePage >= totalPages}
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="inventory-bottom-grid">
                  <section className="inventory-mini-card">
                    <div className="inventory-mini-card__header">
                      <span>Stock Overview by Category</span>
                    </div>
                    <div className="inventory-overview">
                      <div className="inventory-overview__chart">
                        {hasMounted && stockOverview.length ? (
                          <ResponsiveContainer width="100%" height={150}>
                            <PieChart>
                              <Pie
                                data={stockOverview}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={36}
                                outerRadius={62}
                                paddingAngle={2}
                              >
                                {stockOverview.map((entry, index) => (
                                  <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="inventory-overview__empty">No category stock data yet</div>
                        )}
                      </div>

                      <div className="inventory-overview__legend">
                        {stockOverview.map((entry, index) => (
                          <div key={entry.name} className="inventory-overview__legend-row">
                            <span className="inventory-overview__legend-group">
                              <span className="inventory-overview__legend-dot" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
                              <span>{entry.name}</span>
                            </span>
                            <strong>{numberFormatter.format(entry.value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="inventory-mini-card">
                    <div className="inventory-mini-card__header">
                      <span>Low Stock Alerts</span>
                    </div>
                    <div className="inventory-mini-card__list inventory-mini-card__list--compact">
                      {lowStockItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="inventory-alert-row">
                          <div>
                            <strong>{item.name}</strong>
                            <span>{item.partNumber || item.sku}</span>
                          </div>
                          <div className="inventory-alert-row__meta">
                            <span>Stock: {item.quantity}</span>
                            <span>Reorder: {item.reorderLevel}</span>
                          </div>
                        </div>
                      ))}

                      {!lowStockItems.length ? <div className="inventory-overview__empty">No low stock alerts for this branch</div> : null}
                    </div>
                  </section>

                  <section className="inventory-mini-card">
                    <div className="inventory-mini-card__header">
                      <span>Top Moving Items This Month</span>
                    </div>
                    <div className="inventory-mini-card__list inventory-mini-card__list--compact">
                      {topMovingProducts.map(({ item, quantity }) => (
                        <div key={item.id} className="inventory-top-row">
                          <div className="inventory-top-row__main">
                            <strong>{item.name}</strong>
                            <span>{item.brandName}</span>
                          </div>
                          <strong>{numberFormatter.format(quantity)} pcs</strong>
                        </div>
                      ))}

                      {!topMovingProducts.length ? <div className="inventory-overview__empty">No stock movement records yet</div> : null}
                    </div>
                  </section>

                  <section className="inventory-mini-card">
                    <div className="inventory-mini-card__header">
                      <span>Inventory Valuation</span>
                    </div>
                    <div className="inventory-mini-card__list inventory-mini-card__list--compact">
                      <div className="inventory-top-row">
                        <div className="inventory-top-row__main">
                          <strong>Cost Value</strong>
                          <span>Based on current stock on hand</span>
                        </div>
                        <strong>{formatCurrency(valuationTotals.cost)}</strong>
                      </div>
                      <div className="inventory-top-row">
                        <div className="inventory-top-row__main">
                          <strong>Retail Value</strong>
                          <span>Projected sell-through value</span>
                        </div>
                        <strong>{formatCurrency(valuationTotals.retail)}</strong>
                      </div>
                      <div className="inventory-top-row">
                        <div className="inventory-top-row__main">
                          <strong>Gross Margin Potential</strong>
                          <span>Retail minus cost value</span>
                        </div>
                        <strong>{formatCurrency(valuationTotals.retail - valuationTotals.cost)}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="inventory-mini-card">
                    <div className="inventory-mini-card__header">
                      <span>Expiring Batches</span>
                    </div>
                    <div className="inventory-mini-card__list inventory-mini-card__list--compact">
                      {expiringBatchItems.map((batch) => (
                        <div key={batch.id} className="inventory-alert-row">
                          <div>
                            <strong>{batch.batch_number}</strong>
                            <span>{batch.quantity_on_hand} on hand</span>
                          </div>
                          <div className="inventory-alert-row__meta">
                            <span>{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString("en-US") : "No expiry"}</span>
                          </div>
                        </div>
                      ))}

                      {!expiringBatchItems.length ? <div className="inventory-overview__empty">No expiring batch records for this branch</div> : null}
                    </div>
                  </section>
                </div>
              </div>

              <aside className="inventory-detail-card">
                <div className="inventory-detail-card__header">
                  <span>Item Details</span>
                </div>

                {selectedItem ? (
                  <div className="inventory-detail-card__body">
                    <div className="inventory-detail-card__media">
                      {selectedItem.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedItem.imageUrl} alt={selectedItem.name} className="inventory-detail-card__image" />
                      ) : (
                        <div className="inventory-detail-card__placeholder">
                          <ImageIcon size={28} />
                        </div>
                      )}
                    </div>

                    <div className="inventory-detail-card__title-row">
                      <div>
                        <h2>{selectedItem.name}</h2>
                        <p>{selectedItem.partNumber || selectedItem.sku}</p>
                      </div>
                      <span className={`inventory-status inventory-status--${getStockStatus(selectedItem).replace(/_/g, "-")}`}>
                        {getStatusLabel(getStockStatus(selectedItem))}
                      </span>
                    </div>

                    <div className="inventory-detail-grid">
                      <div><span>Item Code</span><strong>{selectedItem.sku}</strong></div>
                      <div><span>Category</span><strong>{selectedItem.categoryName}</strong></div>
                      <div><span>Brand</span><strong>{selectedItem.brandName}</strong></div>
                      <div><span>Supplier</span><strong>{selectedItem.supplierName}</strong></div>
                      <div><span>Cost Price</span><strong>{formatCurrency(selectedItem.costPrice)}</strong></div>
                      <div><span>Selling Price</span><strong>{formatCurrency(selectedItem.sellingPrice)}</strong></div>
                      <div><span>Wholesale Price</span><strong>{formatCurrency(selectedItem.wholesalePrice)}</strong></div>
                      <div><span>Minimum Price</span><strong>{formatCurrency(selectedItem.minimumPrice)}</strong></div>
                      <div><span>Current Stock</span><strong>{formatQuantity(selectedItem.quantity, selectedItem.unitType)}</strong></div>
                      <div><span>Reorder Level</span><strong>{numberFormatter.format(selectedItem.reorderLevel)}</strong></div>
                      <div><span>Critical Level</span><strong>{numberFormatter.format(selectedItem.criticalStockLevel)}</strong></div>
                      <div><span>Location</span><strong>{selectedItem.shelfLocation || "-"}</strong></div>
                      <div><span>Barcode</span><strong className="inventory-detail-grid__mono">{selectedItem.barcode || "-"}</strong></div>
                      <div><span>Warranty</span><strong>{selectedItem.warrantyDays ? `${selectedItem.warrantyDays} days` : "No warranty"}</strong></div>
                      <div><span>Variants</span><strong>{selectedItem.variants.length}</strong></div>
                      <div><span>Serial Tracking</span><strong>{selectedItem.hasSerialTracking ? "Enabled" : "Optional"}</strong></div>
                      <div><span>Batch Tracking</span><strong>{selectedItem.hasBatchTracking ? "Enabled" : "Optional"}</strong></div>
                      <div><span>Expiry Tracking</span><strong>{selectedItem.hasExpiryTracking ? "Enabled" : "Optional"}</strong></div>
                    </div>

                    <div className="inventory-detail-section">
                      <span className="inventory-detail-section__label">Product Variants</span>
                      <div className="inventory-chip-list">
                        {selectedItem.variants.length ? (
                          selectedItem.variants.map((variant, index) => (
                            <span key={`${variant.variantName}-${variant.variantValue}-${index}`} className="inventory-chip">
                              {variant.variantName}: {variant.variantValue} ({variant.quantity})
                            </span>
                          ))
                        ) : (
                          <span className="inventory-chip inventory-chip--muted">No variants configured</span>
                        )}
                      </div>
                    </div>

                    <div className="inventory-detail-section">
                      <span className="inventory-detail-section__label">Compatible Motorcycle Models</span>
                      <div className="inventory-chip-list">
                        {selectedItem.compatibleModels.length ? (
                          selectedItem.compatibleModels.map((model) => (
                            <span key={model} className="inventory-chip">
                              {model}
                            </span>
                          ))
                        ) : (
                          <span className="inventory-chip inventory-chip--muted">No compatibility records yet</span>
                        )}
                      </div>
                    </div>

                    <div className="inventory-detail-section">
                      <span className="inventory-detail-section__label">Batch Tracking</span>
                      <div className="inventory-tracking-list">
                        {inventoryBatches.length ? (
                          inventoryBatches.map((batch) => (
                            <div key={batch.id} className="inventory-tracking-row">
                              <strong>{batch.batch_number}</strong>
                              <span>{batch.quantity_on_hand} on hand / {batch.quantity_received} received</span>
                              <span>{batch.expiry_date ? `Expires ${new Date(batch.expiry_date).toLocaleDateString("en-US")}` : "No expiry date"}</span>
                            </div>
                          ))
                        ) : (
                          <span className="inventory-chip inventory-chip--muted">No batch records yet</span>
                        )}
                      </div>
                    </div>

                    <div className="inventory-detail-section">
                      <span className="inventory-detail-section__label">Serial Tracking</span>
                      <div className="inventory-tracking-list">
                        {inventorySerials.length ? (
                          inventorySerials.map((serial) => (
                            <div key={serial.id} className="inventory-tracking-row">
                              <strong>{serial.serial_number}</strong>
                              <span>{formatMovementType(serial.status)}</span>
                              <span>{new Date(serial.created_at).toLocaleDateString("en-US")}</span>
                            </div>
                          ))
                        ) : (
                          <span className="inventory-chip inventory-chip--muted">No serial numbers recorded yet</span>
                        )}
                      </div>
                    </div>

                    <div className="inventory-detail-card__actions">
                      <button type="button" className="inventory-action inventory-action--light" onClick={() => openBarcodeStudio(selectedItem)} disabled={!canUseBarcodePrinting}>
                        <Barcode size={14} />
                        <span>Barcode Studio</span>
                      </button>
                      <button type="button" className="inventory-action inventory-action--primary" onClick={() => openEditDialog(selectedItem)}>
                        <Pencil size={14} />
                        <span>Edit Item</span>
                      </button>
                      <button
                        type="button"
                        className="inventory-action inventory-action--danger"
                        onClick={() => void handleDeleteProduct(selectedItem)}
                      >
                        <Trash2 size={14} />
                        <span>Delete Item</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inventory-empty inventory-empty--detail">
                    <ImageIcon size={18} />
                    <span>Select an item to view its details.</span>
                  </div>
                )}
              </aside>
            </div>

            </>
          )}
        </section>
      </div>

      {dialogOpen ? (
        <div className="inventory-modal">
          <div className="inventory-modal__backdrop" onClick={closeDialog} />
          <div className="inventory-modal__panel">
            <div className="inventory-modal__header">
              <div>
                <h2>{dialogMode === "create" ? "Add New Product" : "Edit Product"}</h2>
                <p>{dialogMode === "create" ? "Create a new inventory item" : "Update this product using your live database records"}</p>
              </div>

              <button type="button" className="inventory-modal__close" onClick={closeDialog} aria-label="Close product form">
                <X size={16} />
              </button>
            </div>

            <div className="inventory-modal__stepper" role="tablist" aria-label="Product steps">
              {productSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={activeStep === step.id}
                  className={`inventory-modal__step ${activeStep === step.id ? "inventory-modal__step--active" : ""}`}
                  onClick={() => setActiveStep(step.id)}
                >
                  <span className="inventory-modal__step-index">{index + 1}</span>
                  <span className="inventory-modal__step-copy">
                    <strong>{step.label}</strong>
                    <span>{step.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>

            <form className="inventory-form" onSubmit={handleSaveProduct}>
              <div className="inventory-form__body">
                {activeStep === "identity" ? (
                  <div className="inventory-form__grid">
                    <label className="inventory-field">
                      <span>Product Name</span>
                      <input value={formState.name} onChange={(event) => setFormField("name", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Part Number</span>
                      <input value={formState.partNumber} onChange={(event) => setFormField("partNumber", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>SKU</span>
                      <input value={formState.sku} onChange={(event) => setFormField("sku", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Barcode</span>
                      <input value={formState.barcode} onChange={(event) => setFormField("barcode", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Category</span>
                      <select value={formState.categoryId} onChange={(event) => setFormField("categoryId", event.target.value)}>
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inventory-field">
                      <span>Brand</span>
                      <select value={formState.brandId} onChange={(event) => setFormField("brandId", event.target.value)}>
                        <option value="">Select brand</option>
                        {brands.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inventory-field">
                      <span>Supplier</span>
                      <select value={formState.supplierId} onChange={(event) => setFormField("supplierId", event.target.value)}>
                        <option value="">Select supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inventory-field">
                      <span>Supplier Code</span>
                      <input value={formState.supplierCode} onChange={(event) => setFormField("supplierCode", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Unit Type</span>
                      <input value={formState.unitType} onChange={(event) => setFormField("unitType", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Branch</span>
                      <input value={activeBranch?.name ?? ""} disabled />
                    </label>
                    <label className="inventory-field">
                      <span>Status</span>
                      <select value={formState.status} onChange={(event) => setFormField("status", event.target.value as "active" | "inactive")}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <div className="inventory-field inventory-field--checks">
                      <span>Tracking Options</span>
                      <label className="inventory-check">
                        <input
                          type="checkbox"
                          checked={formState.hasSerialTracking}
                          onChange={(event) => setFormField("hasSerialTracking", event.target.checked)}
                        />
                        <span>Serial number tracking</span>
                      </label>
                      <label className="inventory-check">
                        <input
                          type="checkbox"
                          checked={formState.hasBatchTracking}
                          onChange={(event) => setFormField("hasBatchTracking", event.target.checked)}
                        />
                        <span>Batch tracking</span>
                      </label>
                      <label className="inventory-check">
                        <input
                          type="checkbox"
                          checked={formState.hasExpiryTracking}
                          onChange={(event) => setFormField("hasExpiryTracking", event.target.checked)}
                        />
                        <span>Expiry tracking</span>
                      </label>
                    </div>
                  </div>
                ) : null}

                {activeStep === "pricingStock" ? (
                  <div className="inventory-form__grid">
                    <label className="inventory-field">
                      <span>Cost Price</span>
                      <input type="number" min="0" step="0.01" value={formState.costPrice} onChange={(event) => setFormField("costPrice", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Selling Price</span>
                      <input type="number" min="0" step="0.01" value={formState.sellingPrice} onChange={(event) => setFormField("sellingPrice", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Wholesale Price</span>
                      <input type="number" min="0" step="0.01" value={formState.wholesalePrice} onChange={(event) => setFormField("wholesalePrice", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Minimum Price</span>
                      <input type="number" min="0" step="0.01" value={formState.minimumPrice} onChange={(event) => setFormField("minimumPrice", event.target.value)} />
                    </label>
                  </div>
                ) : null}

                {activeStep === "pricingStock" ? (
                  <div className="inventory-form__grid">
                    <label className="inventory-field">
                      <span>Stock Quantity</span>
                      <input type="number" min="0" step="1" value={formState.quantity} onChange={(event) => setFormField("quantity", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Reorder Level</span>
                      <input type="number" min="0" step="1" value={formState.reorderLevel} onChange={(event) => setFormField("reorderLevel", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Critical Stock Level</span>
                      <input type="number" min="0" step="1" value={formState.criticalStockLevel} onChange={(event) => setFormField("criticalStockLevel", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Shelf / Bin Location</span>
                      <input value={formState.shelfLocation} onChange={(event) => setFormField("shelfLocation", event.target.value)} />
                    </label>
                    <label className="inventory-field">
                      <span>Warranty Period (Days)</span>
                      <input type="number" min="0" step="1" value={formState.warrantyDays} onChange={(event) => setFormField("warrantyDays", event.target.value)} />
                    </label>
                  </div>
                ) : null}

                {activeStep === "variantsFitment" ? (
                  <div className="inventory-variants-tab">
                    <div className="inventory-variants-tab__header">
                      <div>
                        <strong>{formState.variants.length} variant row(s)</strong>
                        <span>Use this for size, color, model-specific, or trim-specific product variants.</span>
                      </div>
                      <button type="button" className="inventory-action inventory-action--light" onClick={addVariantRow}>
                        <PackagePlus size={14} />
                        <span>Add Variant</span>
                      </button>
                    </div>

                    {formState.variants.length ? (
                      <div className="inventory-variants-list">
                        {formState.variants.map((variant, index) => (
                          <div key={`${variant.id ?? "new"}-${index}`} className="inventory-variant-card">
                            <div className="inventory-form__grid">
                              <label className="inventory-field">
                                <span>Variant Name</span>
                                <input value={variant.variantName} onChange={(event) => updateVariantRow(index, "variantName", event.target.value)} placeholder="e.g. Size" />
                              </label>
                              <label className="inventory-field">
                                <span>Variant Value</span>
                                <input value={variant.variantValue} onChange={(event) => updateVariantRow(index, "variantValue", event.target.value)} placeholder="e.g. Large" />
                              </label>
                              <label className="inventory-field">
                                <span>Variant SKU</span>
                                <input value={variant.sku} onChange={(event) => updateVariantRow(index, "sku", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Variant Barcode</span>
                                <input value={variant.barcode} onChange={(event) => updateVariantRow(index, "barcode", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Additional Cost</span>
                                <input type="number" min="0" step="0.01" value={variant.additionalCost} onChange={(event) => updateVariantRow(index, "additionalCost", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Additional Selling Price</span>
                                <input type="number" min="0" step="0.01" value={variant.additionalPrice} onChange={(event) => updateVariantRow(index, "additionalPrice", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Additional Wholesale Price</span>
                                <input type="number" min="0" step="0.01" value={variant.additionalWholesalePrice} onChange={(event) => updateVariantRow(index, "additionalWholesalePrice", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Minimum Price</span>
                                <input type="number" min="0" step="0.01" value={variant.minimumPrice} onChange={(event) => updateVariantRow(index, "minimumPrice", event.target.value)} />
                              </label>
                              <label className="inventory-field">
                                <span>Variant Stock Qty</span>
                                <input type="number" min="0" step="1" value={variant.quantity} onChange={(event) => updateVariantRow(index, "quantity", event.target.value)} />
                              </label>
                            </div>

                            <div className="inventory-variant-card__actions">
                              <button type="button" className="inventory-action inventory-action--danger-light" onClick={() => removeVariantRow(index)}>
                                <Trash2 size={14} />
                                <span>Remove Variant</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="inventory-overview__empty">No product variants added yet.</div>
                    )}
                  </div>
                ) : null}

                {activeStep === "variantsFitment" ? (
                  <div className="inventory-compatibility">
                    <div className="inventory-compatibility__summary">
                      <strong>{selectedFormModels.length} model(s) selected</strong>
                      <span>Select compatible motorcycle models for this part.</span>
                    </div>

                    <div className="inventory-compatibility__list">
                      {motorcycleModels.map((model) => {
                        const checked = formState.compatibleModelIds.includes(model.id);
                        const yearLabel =
                          model.year_from || model.year_to
                            ? `${model.year_from ?? ""}${model.year_to ? `-${model.year_to}` : ""}`
                            : "All years";

                        return (
                          <label key={model.id} className={`inventory-compatibility__item ${checked ? "inventory-compatibility__item--active" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCompatibility(model.id)}
                            />
                            <div>
                              <strong>{model.brand} {model.model_name}</strong>
                              <span>{model.engine_type || "Engine n/a"} • {yearLabel}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {activeStep === "mediaHistory" ? (
                  <div className="inventory-images-tab">
                    <div className="inventory-images-tab__preview">
                      {formState.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={formState.imageUrl} alt={formState.name || "Product preview"} className="inventory-images-tab__image" />
                      ) : (
                        <div className="inventory-images-tab__placeholder">
                          <ImageIcon size={30} />
                          <span>No image selected</span>
                        </div>
                      )}
                    </div>

                    <div className="inventory-images-tab__controls">
                      <label className="inventory-field">
                        <span>Image URL</span>
                        <input value={formState.imageUrl} onChange={(event) => setFormField("imageUrl", event.target.value)} />
                      </label>

                      <label className="inventory-upload">
                        <Upload size={16} />
                        <span>Upload Product Image</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} />
                      </label>

                      <p className="inventory-images-tab__hint">
                        Uploaded images are stored directly in your product image record as the primary image value.
                      </p>
                    </div>
                  </div>
                ) : null}

                {activeStep === "mediaHistory" ? (
                  <div className="inventory-history-tab">
                    {dialogMode === "create" ? (
                      <div className="inventory-overview__empty">History becomes available after the product is created.</div>
                    ) : historyLoading ? (
                      <div className="inventory-overview__empty">Loading stock history...</div>
                    ) : historyRows.length ? (
                      <div className="inventory-history-list">
                        {historyRows.map((row) => (
                          <div key={row.id} className="inventory-history-row">
                            <div className="inventory-history-row__icon">
                              <History size={14} />
                            </div>
                            <div className="inventory-history-row__content">
                              <strong>{formatMovementType(row.movement_type)}</strong>
                              <span>
                                Qty {numberFormatter.format(row.quantity)} • {numberFormatter.format(row.quantity_before)} to {numberFormatter.format(row.quantity_after)}
                              </span>
                              <span>{new Date(row.created_at).toLocaleString("en-US")}</span>
                              {row.notes ? <p>{row.notes}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="inventory-overview__empty">No stock history recorded yet for this branch.</div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="inventory-form__footer">
                {dialogMode === "edit" && editingItemId && canDeleteProduct ? (
                  <button
                    type="button"
                    className="inventory-action inventory-action--danger-light"
                    onClick={() => {
                      const item = inventoryItems.find((entry) => entry.id === editingItemId);
                      if (item) {
                        void handleDeleteProduct(item);
                      }
                    }}
                    disabled={saving || deleting}
                  >
                    <Trash2 size={14} />
                    <span>{deleting ? "Deleting..." : "Delete Product"}</span>
                  </button>
                ) : <span />}

                <div className="inventory-form__footer-actions">
                  <button type="button" className="inventory-action inventory-action--light" onClick={closeDialog} disabled={saving || deleting}>
                    Cancel
                  </button>
                  {!isFirstStep ? (
                    <button type="button" className="inventory-action inventory-action--light" onClick={goToPreviousStep} disabled={saving || deleting}>
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </button>
                  ) : null}
                  <button
                    type={isLastStep ? "submit" : "button"}
                    className="inventory-action inventory-action--primary"
                    onClick={isLastStep ? undefined : goToNextStep}
                    disabled={saving || deleting}
                  >
                    <PackagePlus size={14} />
                    <span>
                      {saving
                        ? "Saving..."
                        : isLastStep
                          ? dialogMode === "create"
                            ? "Create Product"
                            : "Save Changes"
                          : "Continue"}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {quickActionOpen ? (
        <div className="inventory-modal">
          <div className="inventory-modal__backdrop" onClick={closeQuickAction} />
          <div className="inventory-modal__panel inventory-modal__panel--quick">
            <div className="inventory-modal__header">
              <div>
                <h2>
                  {quickActionOpen === "adjust"
                    ? "Stock Adjustment"
                    : quickActionOpen === "transfer"
                      ? "Branch Transfer"
                      : "Stock Count / Audit"}
                </h2>
                <p>
                  {quickActionOpen === "adjust"
                    ? "Adjust the selected item quantity from the toolbar button."
                    : quickActionOpen === "transfer"
                      ? "Move stock between branches from the toolbar button."
                      : "Record a physical count and compare it with the system quantity from the toolbar button."}
                </p>
              </div>

              <button type="button" className="inventory-modal__close" onClick={closeQuickAction} aria-label="Close quick action">
                <X size={16} />
              </button>
            </div>

            <form className="inventory-quick-modal" onSubmit={submitQuickAction}>
              <div className="inventory-quick-modal__summary">
                <span>Selected item</span>
                <strong>{quickActionItem?.name ?? "No item selected"}</strong>
                <p>{quickActionItem?.sku ?? "-"}</p>
              </div>

              {quickActionOpen === "adjust" ? (
                <div className="inventory-form__grid inventory-quick-modal__grid">
                  <label className="inventory-field">
                    <span>Current Stock</span>
                    <input value={quickActionItem ? formatQuantity(quickActionItem.quantity, quickActionItem.unitType) : ""} disabled />
                  </label>
                  <label className="inventory-field">
                    <span>Action Type</span>
                    <select
                      value={quickActionState.adjustMode}
                      onChange={(event) => updateQuickActionField("adjustMode", event.target.value as "delta" | "set")}
                    >
                      <option value="delta">Quantity change</option>
                      <option value="set">Set exact quantity</option>
                    </select>
                  </label>
                  <label className="inventory-field">
                    <span>Adjustment Reason</span>
                    <select
                      value={quickActionState.adjustReason}
                      onChange={(event) => updateQuickActionField("adjustReason", event.target.value as QuickActionReason)}
                    >
                      <option value="adjustment">General adjustment</option>
                      <option value="damage">Damaged stock</option>
                      <option value="return_in">Returned stock</option>
                      <option value="return_out">Returned to supplier</option>
                    </select>
                  </label>
                  <label className="inventory-field">
                    <span>{quickActionState.adjustMode === "set" ? "Target Quantity" : "Quantity Change"}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={quickActionState.adjustQuantity}
                      onChange={(event) => updateQuickActionField("adjustQuantity", event.target.value)}
                    />
                  </label>
                  <label className="inventory-field">
                    <span>Notes</span>
                    <input
                      value={quickActionState.adjustNotes}
                      onChange={(event) => updateQuickActionField("adjustNotes", event.target.value)}
                      placeholder="Damage, correction, spoilage, etc."
                    />
                  </label>
                </div>
              ) : null}

              {quickActionOpen === "transfer" ? (
                <div className="inventory-form__grid inventory-quick-modal__grid">
                  <label className="inventory-field">
                    <span>From Branch</span>
                    <input value={activeBranch?.name ?? ""} disabled />
                  </label>
                  <label className="inventory-field">
                    <span>Target Branch</span>
                    <select
                      value={quickActionState.transferBranchId}
                      onChange={(event) => updateQuickActionField("transferBranchId", event.target.value)}
                    >
                      <option value="">Select branch</option>
                      {branches
                        .filter((branch) => branch.id !== resolvedBranchId)
                        .map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="inventory-field">
                    <span>Transfer Quantity</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={quickActionState.transferQuantity}
                      onChange={(event) => updateQuickActionField("transferQuantity", event.target.value)}
                    />
                  </label>
                  <label className="inventory-field">
                    <span>Reference Note</span>
                    <input
                      value={quickActionState.transferNotes}
                      onChange={(event) => updateQuickActionField("transferNotes", event.target.value)}
                      placeholder="Transfer reference or remarks"
                    />
                  </label>
                </div>
              ) : null}

              {quickActionOpen === "audit" ? (
                <div className="inventory-form__grid inventory-quick-modal__grid">
                  <label className="inventory-field">
                    <span>System Quantity</span>
                    <input value={quickActionItem ? formatQuantity(quickActionItem.quantity, quickActionItem.unitType) : ""} disabled />
                  </label>
                  <label className="inventory-field">
                    <span>Last Counted Quantity</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={quickActionState.auditCountedQuantity}
                      onChange={(event) => updateQuickActionField("auditCountedQuantity", event.target.value)}
                    />
                  </label>
                  <label className="inventory-field">
                    <span>Variance</span>
                    <input
                      value={quickActionItem ? formatSignedQuantity(parseNumber(quickActionState.auditCountedQuantity) - quickActionItem.quantity, quickActionItem.unitType) : "0"}
                      disabled
                    />
                  </label>
                  <label className="inventory-field">
                    <span>Audit Notes</span>
                    <input
                      value={quickActionState.auditNotes}
                      onChange={(event) => updateQuickActionField("auditNotes", event.target.value)}
                      placeholder="Reason for the count / findings"
                    />
                  </label>
                </div>
              ) : null}

              <div className="inventory-quick-modal__footer">
                <button type="button" className="inventory-action inventory-action--light" onClick={closeQuickAction}>
                  Close
                </button>
                <button type="submit" className="inventory-action inventory-action--primary" disabled={saving || !quickActionItem}>
                  {saving ? "Saving..." : "Save Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {barcodeStudioOpen ? (
        <BarcodeStudioModal
          products={barcodeStudioProducts}
          initialProductId={barcodeStudioProductId}
          initialSelectedIds={selectedBarcodeIds}
          onClose={() => setBarcodeStudioOpen(false)}
          onSaved={async () => {
            await refreshInventory(resolvedBranchId);
          }}
        />
      ) : null}
    </div>
  );
}

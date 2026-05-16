"use client";

import { useEffect, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
import { supabase } from "@/lib/supabase";

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
  updatedAt: string;
};

type InventorySnapshot = {
  items: InventoryItem[];
  topMovingItems: Array<{ productId: string; quantity: number }>;
};

type StatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "inactive";
type DialogMode = "create" | "edit";
type ProductTab = "basic" | "pricing" | "stock" | "compatibility" | "images" | "history";

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
  compatibleModelIds: string[];
  imageUrl: string;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
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
const productTabs: Array<{ id: ProductTab; label: string }> = [
  { id: "basic", label: "Basic Details" },
  { id: "pricing", label: "Pricing" },
  { id: "stock", label: "Stock Settings" },
  { id: "compatibility", label: "Compatibility" },
  { id: "images", label: "Images" },
  { id: "history", label: "History" },
];

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
    compatibleModelIds: [],
    imageUrl: "",
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
    compatibleModelIds: item.compatibleModelIds,
    imageUrl: item.imageUrl,
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

async function fetchInventorySnapshot(selectedBranchId: string): Promise<InventorySnapshot> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [inventoryResult, movementResult] = await Promise.all([
    supabase
      .from("inventory_stocks")
      .select(`
        id,
        product_id,
        branch_id,
        quantity,
        updated_at,
        branch:branches (
          id,
          name
        ),
        product:products (
          id,
          name,
          part_number,
          sku,
          barcode,
          supplier_code,
          unit_type,
          cost_price,
          selling_price,
          wholesale_price,
          minimum_price,
          reorder_level,
          critical_stock_level,
          shelf_location,
          warranty_period_days,
          status,
          has_serial_tracking,
          has_batch_tracking,
          category:categories (
            id,
            name
          ),
          brand:brands (
            id,
            name
          ),
          supplier:suppliers (
            id,
            name
          ),
          product_images (
            url,
            is_primary,
            sort_order
          ),
          product_compatibility (
            notes,
            motorcycle_model:motorcycle_models (
              id,
              brand,
              model_name,
              engine_type,
              year_from,
              year_to
            )
          )
        )
      `)
      .eq("branch_id", selectedBranchId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("product_id, quantity")
      .eq("branch_id", selectedBranchId)
      .gte("created_at", monthStart.toISOString()),
  ]);

  if (inventoryResult.error) {
    throw inventoryResult.error;
  }

  const rows = (inventoryResult.data ?? []) as unknown as InventorySourceRow[];
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
        updatedAt: row.updated_at,
      } satisfies InventoryItem;
    });

  const movementRows = (movementResult.data ?? []) as Array<{ product_id: string; quantity: number }>;
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
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [topMovingItems, setTopMovingItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [selectedBrandId, setSelectedBrandId] = useState("all");
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [activeTab, setActiveTab] = useState<ProductTab>("basic");
  const [editingItemId, setEditingItemId] = useState("");
  const [formState, setFormState] = useState<ProductFormState>(createEmptyFormState());
  const [historyRows, setHistoryRows] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentUserProfileId, setCurrentUserProfileId] = useState<string | null>(null);

  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value);
    setPage(1);
  };

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

  const refreshInventory = async (branchId: string) => {
    const snapshot = await fetchInventorySnapshot(branchId);
    setInventoryItems(snapshot.items);
    setTopMovingItems(snapshot.topMovingItems);
    setSelectedItemId((current) => {
      if (current && snapshot.items.some((item) => item.id === current)) return current;
      return snapshot.items[0]?.id ?? "";
    });
  };

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      const [
        branchResult,
        categoryResult,
        brandResult,
        supplierResult,
        motorcycleModelResult,
        authResult,
      ] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name, is_main")
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name", { ascending: true }),
        supabase.from("categories").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("brands").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase.from("suppliers").select("id, name").eq("is_active", true).order("name", { ascending: true }),
        supabase
          .from("motorcycle_models")
          .select("id, brand, model_name, engine_type, year_from, year_to")
          .eq("is_active", true)
          .order("brand", { ascending: true })
          .order("model_name", { ascending: true }),
        supabase.auth.getUser(),
      ]);

      if (!isMounted) return;

      const branchRows = (branchResult.data ?? []) as BranchOption[];
      const mainBranch = branchRows.find((branch) => branch.is_main) ?? branchRows[0] ?? null;

      setBranches(branchRows);
      setCategories((categoryResult.data ?? []) as FilterOption[]);
      setBrands((brandResult.data ?? []) as FilterOption[]);
      setSuppliers((supplierResult.data ?? []) as FilterOption[]);
      setMotorcycleModels((motorcycleModelResult.data ?? []) as MotorcycleModelOption[]);
      setSelectedBranchId((current) => current || mainBranch?.id || "");

      const authUserId = authResult.data.user?.id;
      if (authUserId) {
        const profileResult = await supabase.from("users").select("id").eq("auth_id", authUserId).maybeSingle();
        if (isMounted) {
          setCurrentUserProfileId((profileResult.data as { id?: string } | null)?.id ?? null);
        }
      }
    };

    void loadLookups();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;

    let isMounted = true;

    const loadInventory = async () => {
      setLoading(true);
      setError("");

      try {
        const snapshot = await fetchInventorySnapshot(selectedBranchId);
        if (!isMounted) return;
        setInventoryItems(snapshot.items);
        setTopMovingItems(snapshot.topMovingItems);
        setSelectedItemId((current) => {
          if (current && snapshot.items.some((item) => item.id === current)) return current;
          return snapshot.items[0]?.id ?? "";
        });
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
  }, [selectedBranchId]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!dialogOpen || !editingItemId || !selectedBranchId) return;

    let isMounted = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      const result = await supabase
        .from("stock_movements")
        .select("id, product_id, movement_type, quantity, quantity_before, quantity_after, reference_type, notes, created_at")
        .eq("product_id", editingItemId)
        .eq("branch_id", selectedBranchId)
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
  }, [dialogOpen, editingItemId, selectedBranchId]);

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

  const activeBranch = branches.find((branch) => branch.id === selectedBranchId);

  const selectedFormModels = motorcycleModels.filter((model) => formState.compatibleModelIds.includes(model.id));

  const setFormField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const openCreateDialog = () => {
    setDialogMode("create");
    setEditingItemId("");
    setFormState(createEmptyFormState());
    setActiveTab("basic");
    setHistoryRows([]);
    setDialogOpen(true);
  };

  const openEditDialog = (item: InventoryItem) => {
    setDialogMode("edit");
    setEditingItemId(item.id);
    setFormState(createFormStateFromItem(item));
    setActiveTab("basic");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving || deleting) return;
    setHistoryRows([]);
    setDialogOpen(false);
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFormField("imageUrl", reader.result);
      }
    };
    reader.readAsDataURL(file);
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

  const validateForm = () => {
    if (!formState.name.trim()) return "Product name is required.";
    if (!formState.sku.trim()) return "SKU is required.";
    if (!selectedBranchId) return "Please select a branch first.";
    return "";
  };

  const handleSaveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setNotice({ tone: "error", message: validationError });
      return;
    }

    const previousItem = inventoryItems.find((item) => item.id === editingItemId) ?? null;
    const nextQuantity = Math.max(0, parseNumber(formState.quantity));
    const previousQuantity = previousItem?.quantity ?? 0;

    setSaving(true);

    try {
      const productPayload = {
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
        reorder_level: Math.max(0, parseNumber(formState.reorderLevel)),
        critical_stock_level: Math.max(0, parseNumber(formState.criticalStockLevel)),
        shelf_location: formState.shelfLocation.trim() || null,
        warranty_period_days: Math.max(0, parseNumber(formState.warrantyDays)),
        has_serial_tracking: formState.hasSerialTracking,
        has_batch_tracking: formState.hasBatchTracking,
        status: formState.status,
      };

      const productResult =
        dialogMode === "edit" && editingItemId
          ? await supabase.from("products").update(productPayload).eq("id", editingItemId).select("id").single()
          : await supabase
              .from("products")
              .insert({
                ...productPayload,
                created_by: currentUserProfileId,
              })
              .select("id")
              .single();

      if (productResult.error || !productResult.data?.id) {
        throw productResult.error ?? new Error("Unable to save product.");
      }

      const productId = productResult.data.id as string;

      const stockResult = await supabase.from("inventory_stocks").upsert(
        {
          product_id: productId,
          branch_id: selectedBranchId,
          quantity: nextQuantity,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "product_id,branch_id",
        }
      );

      if (stockResult.error) {
        throw stockResult.error;
      }

      const movementDelta = nextQuantity - previousQuantity;
      if (dialogMode === "create" || movementDelta !== 0) {
        const movementType = dialogMode === "create" ? "initial" : "adjustment";
        const movementResult = await supabase.from("stock_movements").insert({
          product_id: productId,
          branch_id: selectedBranchId,
          movement_type: movementType,
          quantity: dialogMode === "create" ? nextQuantity : movementDelta,
          quantity_before: previousQuantity,
          quantity_after: nextQuantity,
          reference_type: "inventory_form",
          reference_id: productId,
          notes:
            dialogMode === "create"
              ? "Initial stock set from inventory product form."
              : "Stock updated from inventory product form.",
          created_by: currentUserProfileId,
        });

        if (movementResult.error) {
          throw movementResult.error;
        }
      }

      const deleteImagesResult = await supabase.from("product_images").delete().eq("product_id", productId);
      if (deleteImagesResult.error) {
        throw deleteImagesResult.error;
      }

      if (formState.imageUrl.trim()) {
        const imageResult = await supabase.from("product_images").insert({
          product_id: productId,
          url: formState.imageUrl.trim(),
          is_primary: true,
          sort_order: 0,
        });

        if (imageResult.error) {
          throw imageResult.error;
        }
      }

      const deleteCompatibilityResult = await supabase.from("product_compatibility").delete().eq("product_id", productId);
      if (deleteCompatibilityResult.error) {
        throw deleteCompatibilityResult.error;
      }

      if (formState.compatibleModelIds.length) {
        const compatibilityResult = await supabase.from("product_compatibility").insert(
          formState.compatibleModelIds.map((modelId) => ({
            product_id: productId,
            motorcycle_model_id: modelId,
          }))
        );

        if (compatibilityResult.error) {
          throw compatibilityResult.error;
        }
      }

      await refreshInventory(selectedBranchId);
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
      const result = await supabase.from("products").delete().eq("id", item.id);
      if (result.error) {
        throw result.error;
      }

      await refreshInventory(selectedBranchId);
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
            <select
              className="inventory-control inventory-control--branch"
              value={selectedBranchId}
              onChange={(event) => handleBranchChange(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

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

            <div className="inventory-toolbar__actions">
              <button type="button" className="inventory-action inventory-action--light">
                <Upload size={14} />
                <span>Export</span>
              </button>
              <button type="button" className="inventory-action inventory-action--light">
                <PackagePlus size={14} />
                <span>Import</span>
              </button>
              <button type="button" className="inventory-action inventory-action--primary" onClick={openCreateDialog}>
                <PackagePlus size={14} />
                <span>Add New Item</span>
              </button>
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
            <div className="inventory-content-grid">
              <div className="inventory-table-card">
                <div className="inventory-table-wrap">
                  <table className="inventory-table">
                    <thead>
                      <tr>
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
                            <td>{formatCurrency(item.costPrice)}</td>
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
                                  aria-label={`Edit ${item.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditDialog(item);
                                  }}
                                >
                                  <Pencil size={13} />
                                </button>
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
                      <div><span>Serial Tracking</span><strong>{selectedItem.hasSerialTracking ? "Enabled" : "Optional"}</strong></div>
                      <div><span>Batch Tracking</span><strong>{selectedItem.hasBatchTracking ? "Enabled" : "Optional"}</strong></div>
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

                    <div className="inventory-detail-card__actions">
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
          )}
        </section>

        <div className="inventory-bottom-grid">
          <section className="inventory-mini-card">
            <div className="inventory-mini-card__header">
              <span>Stock Overview by Category</span>
            </div>
            <div className="inventory-overview">
              <div className="inventory-overview__chart">
                {hasMounted && stockOverview.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={stockOverview}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={74}
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
            <div className="inventory-mini-card__list">
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
            <div className="inventory-mini-card__list">
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
        </div>
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

            <div className="inventory-modal__tabs">
              {productTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`inventory-modal__tab ${activeTab === tab.id ? "inventory-modal__tab--active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form className="inventory-form" onSubmit={handleSaveProduct}>
              <div className="inventory-form__body">
                {activeTab === "basic" ? (
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
                    </div>
                  </div>
                ) : null}

                {activeTab === "pricing" ? (
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

                {activeTab === "stock" ? (
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

                {activeTab === "compatibility" ? (
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

                {activeTab === "images" ? (
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

                {activeTab === "history" ? (
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
                {dialogMode === "edit" && editingItemId ? (
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
                  <button type="submit" className="inventory-action inventory-action--primary" disabled={saving || deleting}>
                    <PackagePlus size={14} />
                    <span>{saving ? "Saving..." : dialogMode === "create" ? "Create Product" : "Save Changes"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

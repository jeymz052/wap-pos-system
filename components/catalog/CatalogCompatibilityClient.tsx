"use client";

import { useCallback, useDeferredValue, useEffect, useState, type FormEvent } from "react";
import {
  Bike,
  Boxes,
  Check,
  ChevronDown,
  CircleAlert,
  FolderKanban,
  Link2,
  LoaderCircle,
  Package,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  Trash2,
  Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type CategoryRow = {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  created_at: string;
};

type BrandRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  is_active?: boolean | null;
  created_at: string;
};

type EngineTypeRow = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  displacement_cc?: number | null;
  cooling_type?: string | null;
  is_active?: boolean | null;
  created_at: string;
};

type MotorcycleModelRow = {
  id: string;
  brand: string;
  model_name: string;
  engine_type?: string | null;
  engine_type_id?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  is_active?: boolean | null;
  created_at: string;
  engine_type_ref?: EngineTypeRow | null;
};

type ProductGroupRow = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  part_number?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  product_group_id?: string | null;
  category?: {
    name: string;
  } | null;
  brand?: {
    name: string;
  } | null;
  product_group?: {
    id: string;
    name: string;
  } | null;
};

type CompatibilityRow = {
  id: string;
  product_id: string;
  motorcycle_model_id: string;
  notes?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  motorcycle_model?: MotorcycleModelRow | null;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

type CatalogTab = "categories" | "brands" | "engine-types" | "models" | "compatibility" | "groups";

type CategoryForm = {
  id: string;
  name: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
};

type BrandForm = {
  id: string;
  name: string;
  logoUrl: string;
  isActive: boolean;
};

type EngineTypeForm = {
  id: string;
  name: string;
  code: string;
  description: string;
  displacementCc: string;
  coolingType: string;
  isActive: boolean;
};

type MotorcycleModelForm = {
  id: string;
  brand: string;
  modelName: string;
  engineTypeId: string;
  yearFrom: string;
  yearTo: string;
  isActive: boolean;
};

type ProductGroupForm = {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
};

type CompatibilityForm = {
  productId: string;
  motorcycleModelId: string;
  notes: string;
};

const defaultCategorySeeds = [
  "Engine Parts",
  "Brake System",
  "Tires & Tubes",
  "Electrical Parts",
  "Lights & Signal",
  "Chains & Sprockets",
  "Oils & Lubricants",
  "Body Parts",
  "Accessories",
  "Tools",
  "Batteries",
  "Cables",
  "Bearings",
  "Suspension Parts",
];

const tabs: Array<{ id: CatalogTab; label: string; icon: typeof Tag }> = [
  { id: "categories", label: "Categories", icon: Tag },
  { id: "brands", label: "Brands", icon: ShieldCheck },
  { id: "engine-types", label: "Engine Types", icon: Wrench },
  { id: "models", label: "Motorcycle Models", icon: Bike },
  { id: "compatibility", label: "Compatibility", icon: Link2 },
  { id: "groups", label: "Product Groups", icon: FolderKanban },
];

function emptyCategoryForm(): CategoryForm {
  return { id: "", name: "", parentId: "", sortOrder: "0", isActive: true };
}

function emptyBrandForm(): BrandForm {
  return { id: "", name: "", logoUrl: "", isActive: true };
}

function emptyEngineTypeForm(): EngineTypeForm {
  return { id: "", name: "", code: "", description: "", displacementCc: "", coolingType: "", isActive: true };
}

function emptyMotorcycleModelForm(): MotorcycleModelForm {
  return { id: "", brand: "", modelName: "", engineTypeId: "", yearFrom: "", yearTo: "", isActive: true };
}

function emptyProductGroupForm(): ProductGroupForm {
  return { id: "", name: "", code: "", description: "", isActive: true };
}

function emptyCompatibilityForm(): CompatibilityForm {
  return { productId: "", motorcycleModelId: "", notes: "" };
}

function asNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMotorcycleLabel(model: MotorcycleModelRow) {
  const engineName = model.engine_type_ref?.name || model.engine_type || "Engine n/a";
  const yearLabel =
    model.year_from || model.year_to
      ? `${model.year_from ?? ""}${model.year_to ? `-${model.year_to}` : ""}`
      : "All years";

  return `${model.brand} ${model.model_name} • ${engineName} • ${yearLabel}`;
}

function formatProductLabel(product: ProductRow) {
  return `${product.name} (${product.sku})`;
}

function formatCategoryPath(category: CategoryRow, categories: CategoryRow[]) {
  const parts = [category.name];
  let currentParentId = category.parent_id ?? null;

  while (currentParentId) {
    const parent = categories.find((entry) => entry.id === currentParentId);
    if (!parent) break;
    parts.unshift(parent.name);
    currentParentId = parent.parent_id ?? null;
  }

  return parts.join(" / ");
}

function deriveAssignedProductIds(groupId: string, productRows: ProductRow[]) {
  if (!groupId) return [];
  return productRows.filter((product) => product.product_group_id === groupId).map((product) => product.id);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeMotorcycleModelRows(rows: unknown): MotorcycleModelRow[] {
  return ((rows as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ""),
    brand: String(row.brand ?? ""),
    model_name: String(row.model_name ?? ""),
    engine_type: typeof row.engine_type === "string" ? row.engine_type : null,
    engine_type_id: typeof row.engine_type_id === "string" ? row.engine_type_id : null,
    year_from: typeof row.year_from === "number" ? row.year_from : null,
    year_to: typeof row.year_to === "number" ? row.year_to : null,
    is_active: typeof row.is_active === "boolean" ? row.is_active : null,
    created_at: String(row.created_at ?? ""),
    engine_type_ref: firstRelation(row.engine_type_ref as EngineTypeRow | EngineTypeRow[] | null | undefined),
  }));
}

function normalizeProductRows(rows: unknown): ProductRow[] {
  return ((rows as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    sku: String(row.sku ?? ""),
    part_number: typeof row.part_number === "string" ? row.part_number : null,
    category_id: typeof row.category_id === "string" ? row.category_id : null,
    brand_id: typeof row.brand_id === "string" ? row.brand_id : null,
    product_group_id: typeof row.product_group_id === "string" ? row.product_group_id : null,
    category: firstRelation(row.category as ProductRow["category"] | ProductRow["category"][] | null | undefined),
    brand: firstRelation(row.brand as ProductRow["brand"] | ProductRow["brand"][] | null | undefined),
    product_group: firstRelation(
      row.product_group as ProductRow["product_group"] | ProductRow["product_group"][] | null | undefined
    ),
  }));
}

function normalizeCompatibilityRows(rows: unknown): CompatibilityRow[] {
  return ((rows as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ""),
    product_id: String(row.product_id ?? ""),
    motorcycle_model_id: String(row.motorcycle_model_id ?? ""),
    notes: typeof row.notes === "string" ? row.notes : null,
    product: firstRelation(row.product as CompatibilityRow["product"] | CompatibilityRow["product"][] | null | undefined),
    motorcycle_model: firstRelation(
      row.motorcycle_model as CompatibilityRow["motorcycle_model"] | CompatibilityRow["motorcycle_model"][] | null | undefined
    ),
  }));
}

export default function CatalogCompatibilityClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<CatalogTab>("categories");

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [engineTypes, setEngineTypes] = useState<EngineTypeRow[]>([]);
  const [motorcycleModels, setMotorcycleModels] = useState<MotorcycleModelRow[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroupRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [compatibilityRows, setCompatibilityRows] = useState<CompatibilityRow[]>([]);

  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm());
  const [brandForm, setBrandForm] = useState<BrandForm>(emptyBrandForm());
  const [engineTypeForm, setEngineTypeForm] = useState<EngineTypeForm>(emptyEngineTypeForm());
  const [motorcycleModelForm, setMotorcycleModelForm] = useState<MotorcycleModelForm>(emptyMotorcycleModelForm());
  const [productGroupForm, setProductGroupForm] = useState<ProductGroupForm>(emptyProductGroupForm());
  const [compatibilityForm, setCompatibilityForm] = useState<CompatibilityForm>(emptyCompatibilityForm());

  const [searchValue, setSearchValue] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [assignedProductIds, setAssignedProductIds] = useState<string[]>([]);

  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());

  const loadCatalogModule = useCallback(async () => {
    setLoading(true);
    setError("");

    const [
      categoriesResult,
      brandsResult,
      engineTypesResult,
      motorcycleModelsResult,
      productGroupsResult,
      productsResult,
      compatibilityResult,
    ] = await Promise.all([
      supabase.from("categories").select("id, name, parent_id, sort_order, is_active, created_at").order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("brands").select("id, name, logo_url, is_active, created_at").order("name", { ascending: true }),
      supabase.from("engine_types").select("id, name, code, description, displacement_cc, cooling_type, is_active, created_at").order("name", { ascending: true }),
      supabase
        .from("motorcycle_models")
        .select(`
          id,
          brand,
          model_name,
          engine_type,
          engine_type_id,
          year_from,
          year_to,
          is_active,
          created_at,
          engine_type_ref:engine_types (
            id,
            name,
            code,
            description,
            displacement_cc,
            cooling_type,
            is_active,
            created_at
          )
        `)
        .order("brand", { ascending: true })
        .order("model_name", { ascending: true }),
      supabase.from("product_groups").select("id, name, code, description, is_active, created_at").order("name", { ascending: true }),
      supabase
        .from("products")
        .select(`
          id,
          name,
          sku,
          part_number,
          category_id,
          brand_id,
          product_group_id,
          category:categories (
            name
          ),
          brand:brands (
            name
          ),
          product_group:product_groups (
            id,
            name
          )
        `)
        .order("name", { ascending: true }),
      supabase
        .from("product_compatibility")
        .select(`
          id,
          product_id,
          motorcycle_model_id,
          notes,
          product:products (
            id,
            name,
            sku
          ),
          motorcycle_model:motorcycle_models (
            id,
            brand,
            model_name,
            engine_type,
            engine_type_id,
            year_from,
            year_to,
            is_active,
            created_at,
            engine_type_ref:engine_types (
              id,
              name,
              code,
              description,
              displacement_cc,
              cooling_type,
              is_active,
              created_at
            )
          )
        `)
        .order("product_id", { ascending: true })
        .order("motorcycle_model_id", { ascending: true }),
    ]);

    const failedResult = [
      categoriesResult,
      brandsResult,
      engineTypesResult,
      motorcycleModelsResult,
      productGroupsResult,
      productsResult,
      compatibilityResult,
    ].find((result) => result.error);

    if (failedResult?.error) {
      setError(failedResult.error.message || "Unable to load Module 6 records.");
      setLoading(false);
      return;
    }

    setCategories((categoriesResult.data ?? []) as CategoryRow[]);
    setBrands((brandsResult.data ?? []) as BrandRow[]);
    setEngineTypes((engineTypesResult.data ?? []) as EngineTypeRow[]);
    setMotorcycleModels(normalizeMotorcycleModelRows(motorcycleModelsResult.data));
    setProductGroups((productGroupsResult.data ?? []) as ProductGroupRow[]);
    const nextProducts = normalizeProductRows(productsResult.data);
    setProducts(nextProducts);
    setCompatibilityRows(normalizeCompatibilityRows(compatibilityResult.data));
    setAssignedProductIds(deriveAssignedProductIds(selectedGroupId, nextProducts));
    setLoading(false);
  }, [selectedGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalogModule();
  }, [loadCatalogModule]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredCategories = categories.filter((category) =>
    !deferredSearch || formatCategoryPath(category, categories).toLowerCase().includes(deferredSearch)
  );

  const filteredBrands = brands.filter((brand) =>
    !deferredSearch || [brand.name, brand.logo_url ?? ""].join(" ").toLowerCase().includes(deferredSearch)
  );

  const filteredEngineTypes = engineTypes.filter((engineType) =>
    !deferredSearch ||
    [engineType.name, engineType.code ?? "", engineType.description ?? "", engineType.cooling_type ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch)
  );

  const filteredMotorcycleModels = motorcycleModels.filter((model) =>
    !deferredSearch || formatMotorcycleLabel(model).toLowerCase().includes(deferredSearch)
  );

  const filteredProductGroups = productGroups.filter((group) =>
    !deferredSearch || [group.name, group.code ?? "", group.description ?? ""].join(" ").toLowerCase().includes(deferredSearch)
  );

  const filteredCompatibilityRows = compatibilityRows.filter((row) =>
    !deferredSearch ||
    [row.product?.name ?? "", row.product?.sku ?? "", row.notes ?? "", row.motorcycle_model ? formatMotorcycleLabel(row.motorcycle_model) : ""]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch)
  );

  const filteredProducts = products.filter((product) =>
    !deferredSearch ||
    [product.name, product.sku, product.part_number ?? "", product.category?.name ?? "", product.brand?.name ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch)
  );

  async function refreshAndNotify(message: string) {
    await loadCatalogModule();
    setNotice({ tone: "success", message });
  }

  async function handleSeedCategories() {
    setSaving(true);

    const existingNames = new Set(categories.filter((entry) => !entry.parent_id).map((entry) => entry.name.toLowerCase()));
    const rowsToInsert = defaultCategorySeeds
      .filter((name) => !existingNames.has(name.toLowerCase()))
      .map((name, index) => ({
        name,
        parent_id: null,
        sort_order: (index + 1) * 10,
        is_active: true,
      }));

    if (!rowsToInsert.length) {
      setNotice({ tone: "success", message: "Default categories are already available." });
      setSaving(false);
      return;
    }

    const result = await supabase.from("categories").insert(rowsToInsert);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to seed category defaults." });
      return;
    }

    await refreshAndNotify("Default category set loaded.");
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: categoryForm.name.trim(),
      parent_id: categoryForm.parentId || null,
      sort_order: Number(categoryForm.sortOrder || 0),
      is_active: categoryForm.isActive,
    };

    const result = categoryForm.id
      ? await supabase.from("categories").update(payload).eq("id", categoryForm.id)
      : await supabase.from("categories").insert(payload);

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to save category." });
      return;
    }

    setCategoryForm(emptyCategoryForm());
    await refreshAndNotify(categoryForm.id ? "Category updated." : "Category created.");
  }

  async function handleDeleteCategory() {
    if (!categoryForm.id) return;
    setSaving(true);
    const result = await supabase.from("categories").delete().eq("id", categoryForm.id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete category." });
      return;
    }

    setCategoryForm(emptyCategoryForm());
    await refreshAndNotify("Category deleted.");
  }

  async function handleBrandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: brandForm.name.trim(),
      logo_url: brandForm.logoUrl.trim() || null,
      is_active: brandForm.isActive,
    };

    const result = brandForm.id
      ? await supabase.from("brands").update(payload).eq("id", brandForm.id)
      : await supabase.from("brands").insert(payload);

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to save brand." });
      return;
    }

    setBrandForm(emptyBrandForm());
    await refreshAndNotify(brandForm.id ? "Brand updated." : "Brand created.");
  }

  async function handleDeleteBrand() {
    if (!brandForm.id) return;
    setSaving(true);
    const result = await supabase.from("brands").delete().eq("id", brandForm.id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete brand." });
      return;
    }

    setBrandForm(emptyBrandForm());
    await refreshAndNotify("Brand deleted.");
  }

  async function handleEngineTypeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: engineTypeForm.name.trim(),
      code: engineTypeForm.code.trim() || null,
      description: engineTypeForm.description.trim() || null,
      displacement_cc: asNumber(engineTypeForm.displacementCc),
      cooling_type: engineTypeForm.coolingType.trim() || null,
      is_active: engineTypeForm.isActive,
    };

    const result = engineTypeForm.id
      ? await supabase.from("engine_types").update(payload).eq("id", engineTypeForm.id)
      : await supabase.from("engine_types").insert(payload);

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to save engine type." });
      return;
    }

    setEngineTypeForm(emptyEngineTypeForm());
    await refreshAndNotify(engineTypeForm.id ? "Engine type updated." : "Engine type created.");
  }

  async function handleDeleteEngineType() {
    if (!engineTypeForm.id) return;
    setSaving(true);
    const result = await supabase.from("engine_types").delete().eq("id", engineTypeForm.id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete engine type." });
      return;
    }

    setEngineTypeForm(emptyEngineTypeForm());
    await refreshAndNotify("Engine type deleted.");
  }

  async function handleMotorcycleModelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const selectedEngine = engineTypes.find((entry) => entry.id === motorcycleModelForm.engineTypeId);
    const payload = {
      brand: motorcycleModelForm.brand.trim(),
      model_name: motorcycleModelForm.modelName.trim(),
      engine_type_id: motorcycleModelForm.engineTypeId || null,
      engine_type: selectedEngine?.name ?? null,
      year_from: asNumber(motorcycleModelForm.yearFrom),
      year_to: asNumber(motorcycleModelForm.yearTo),
      is_active: motorcycleModelForm.isActive,
    };

    const result = motorcycleModelForm.id
      ? await supabase.from("motorcycle_models").update(payload).eq("id", motorcycleModelForm.id)
      : await supabase.from("motorcycle_models").insert(payload);

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to save motorcycle model." });
      return;
    }

    setMotorcycleModelForm(emptyMotorcycleModelForm());
    await refreshAndNotify(motorcycleModelForm.id ? "Motorcycle model updated." : "Motorcycle model created.");
  }

  async function handleDeleteMotorcycleModel() {
    if (!motorcycleModelForm.id) return;
    setSaving(true);
    const result = await supabase.from("motorcycle_models").delete().eq("id", motorcycleModelForm.id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete motorcycle model." });
      return;
    }

    setMotorcycleModelForm(emptyMotorcycleModelForm());
    await refreshAndNotify("Motorcycle model deleted.");
  }

  async function handleCompatibilitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const result = await supabase.from("product_compatibility").insert({
      product_id: compatibilityForm.productId,
      motorcycle_model_id: compatibilityForm.motorcycleModelId,
      notes: compatibilityForm.notes.trim() || null,
    });

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to create compatibility mapping." });
      return;
    }

    setCompatibilityForm(emptyCompatibilityForm());
    await refreshAndNotify("Compatibility mapping saved.");
  }

  async function handleDeleteCompatibility(id: string) {
    setSaving(true);
    const result = await supabase.from("product_compatibility").delete().eq("id", id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete compatibility mapping." });
      return;
    }

    await refreshAndNotify("Compatibility mapping removed.");
  }

  async function handleProductGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: productGroupForm.name.trim(),
      code: productGroupForm.code.trim() || null,
      description: productGroupForm.description.trim() || null,
      is_active: productGroupForm.isActive,
    };

    const result = productGroupForm.id
      ? await supabase.from("product_groups").update(payload).eq("id", productGroupForm.id)
      : await supabase.from("product_groups").insert(payload);

    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to save product group." });
      return;
    }

    setProductGroupForm(emptyProductGroupForm());
    await refreshAndNotify(productGroupForm.id ? "Product group updated." : "Product group created.");
  }

  async function handleDeleteProductGroup() {
    if (!productGroupForm.id) return;
    setSaving(true);
    const clearProductsResult = await supabase.from("products").update({ product_group_id: null }).eq("product_group_id", productGroupForm.id);

    if (clearProductsResult.error) {
      setSaving(false);
      setNotice({ tone: "error", message: clearProductsResult.error.message || "Unable to detach products from this group." });
      return;
    }

    const result = await supabase.from("product_groups").delete().eq("id", productGroupForm.id);
    setSaving(false);

    if (result.error) {
      setNotice({ tone: "error", message: result.error.message || "Unable to delete product group." });
      return;
    }

    setProductGroupForm(emptyProductGroupForm());
    setSelectedGroupId("");
    await refreshAndNotify("Product group deleted.");
  }

  async function handleSaveGroupAssignments() {
    if (!selectedGroupId) {
      setNotice({ tone: "error", message: "Select a product group first." });
      return;
    }

    setSaving(true);

    const currentProductIds = products
      .filter((product) => product.product_group_id === selectedGroupId)
      .map((product) => product.id);

    const idsToRemove = currentProductIds.filter((id) => !assignedProductIds.includes(id));
    const idsToAdd = assignedProductIds.filter((id) => !currentProductIds.includes(id));

    if (idsToRemove.length) {
      const clearResult = await supabase.from("products").update({ product_group_id: null }).in("id", idsToRemove);
      if (clearResult.error) {
        setSaving(false);
        setNotice({ tone: "error", message: clearResult.error.message || "Unable to clear existing group assignments." });
        return;
      }
    }

    if (idsToAdd.length) {
      const assignResult = await supabase.from("products").update({ product_group_id: selectedGroupId }).in("id", idsToAdd);
      if (assignResult.error) {
        setSaving(false);
        setNotice({ tone: "error", message: assignResult.error.message || "Unable to assign products to this group." });
        return;
      }
    }

    setSaving(false);
    await refreshAndNotify("Product grouping updated.");
  }

  const selectedCompatibilityProduct = products.find((product) => product.id === compatibilityForm.productId) ?? null;
  const activeGroupName = productGroups.find((group) => group.id === selectedGroupId)?.name ?? "";

  return (
    <div className="catalog-page">
      <section className="catalog-hero">
        <div>
          <span className="catalog-kicker">Module 6</span>
          <h1>Catalog, Brands & Compatibility</h1>
          <p>
            Manage product classification, brand masters, motorcycle fitment records, engine types, and product grouping
            from one workspace.
          </p>
        </div>
        <div className="catalog-hero__actions">
          <button type="button" className="catalog-button catalog-button--secondary" onClick={() => void loadCatalogModule()} disabled={loading || saving}>
            <LoaderCircle size={16} className={loading ? "catalog-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button type="button" className="catalog-button catalog-button--primary" onClick={handleSeedCategories} disabled={loading || saving}>
            <Plus size={16} />
            <span>Load Default Categories</span>
          </button>
        </div>
      </section>

      <section className="catalog-metrics">
        <article className="catalog-metric">
          <Tag size={18} />
          <div>
            <strong>{categories.length}</strong>
            <span>Categories</span>
          </div>
        </article>
        <article className="catalog-metric">
          <ShieldCheck size={18} />
          <div>
            <strong>{brands.length}</strong>
            <span>Brands</span>
          </div>
        </article>
        <article className="catalog-metric">
          <Wrench size={18} />
          <div>
            <strong>{engineTypes.length}</strong>
            <span>Engine Types</span>
          </div>
        </article>
        <article className="catalog-metric">
          <Bike size={18} />
          <div>
            <strong>{motorcycleModels.length}</strong>
            <span>Motorcycle Models</span>
          </div>
        </article>
        <article className="catalog-metric">
          <Link2 size={18} />
          <div>
            <strong>{compatibilityRows.length}</strong>
            <span>Compatibility Maps</span>
          </div>
        </article>
        <article className="catalog-metric">
          <FolderKanban size={18} />
          <div>
            <strong>{productGroups.length}</strong>
            <span>Product Groups</span>
          </div>
        </article>
      </section>

      {error ? (
        <div className="catalog-alert catalog-alert--error">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className={`catalog-alert ${notice.tone === "success" ? "catalog-alert--success" : "catalog-alert--error"}`}>
          {notice.tone === "success" ? <Check size={16} /> : <CircleAlert size={16} />}
          <span>{notice.message}</span>
        </div>
      ) : null}

      <section className="catalog-toolbar">
        <div className="catalog-tabs" role="tablist" aria-label="Module 6 areas">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`catalog-tab ${activeTab === id ? "catalog-tab--active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label className="catalog-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search within the current module view..."
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </label>
      </section>

      {loading ? (
        <div className="catalog-loading">
          <LoaderCircle size={18} className="catalog-spin" />
          <span>Loading Module 6 data...</span>
        </div>
      ) : null}

      {!loading && activeTab === "categories" ? (
        <section className="catalog-grid">
          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Category Management</h2>
              <button type="button" className="catalog-text-button" onClick={() => setCategoryForm(emptyCategoryForm())}>
                New Category
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleCategorySubmit}>
              <label>
                <span>Name</span>
                <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>Parent Category</span>
                <div className="catalog-select">
                  <select value={categoryForm.parentId} onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))}>
                    <option value="">Root Category</option>
                    {categories
                      .filter((entry) => entry.id !== categoryForm.id)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {formatCategoryPath(entry, categories)}
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Sort Order</span>
                <input type="number" min="0" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))} />
              </label>
              <label className="catalog-checkbox">
                <input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Active category</span>
              </label>
              <div className="catalog-form__actions">
                {categoryForm.id ? (
                  <button type="button" className="catalog-button catalog-button--danger" onClick={handleDeleteCategory} disabled={saving}>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                ) : <span />}
                <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? "Saving..." : categoryForm.id ? "Update Category" : "Create Category"}</span>
                </button>
              </div>
            </form>
          </article>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Category Tree</h2>
              <span>{filteredCategories.length} record(s)</span>
            </div>
            <div className="catalog-list">
              {filteredCategories.map((category) => (
                <button key={category.id} type="button" className="catalog-list__item" onClick={() => setCategoryForm({
                  id: category.id,
                  name: category.name,
                  parentId: category.parent_id ?? "",
                  sortOrder: String(category.sort_order ?? 0),
                  isActive: Boolean(category.is_active),
                })}>
                  <strong>{formatCategoryPath(category, categories)}</strong>
                  <span>Sort: {category.sort_order ?? 0} • {category.is_active ? "Active" : "Inactive"}</span>
                </button>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "brands" ? (
        <section className="catalog-grid">
          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Brand Management</h2>
              <button type="button" className="catalog-text-button" onClick={() => setBrandForm(emptyBrandForm())}>
                New Brand
              </button>
            </div>
            <form className="catalog-form" onSubmit={handleBrandSubmit}>
              <label>
                <span>Brand Name</span>
                <input value={brandForm.name} onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>Logo URL</span>
                <input value={brandForm.logoUrl} onChange={(event) => setBrandForm((current) => ({ ...current, logoUrl: event.target.value }))} />
              </label>
              <label className="catalog-checkbox">
                <input type="checkbox" checked={brandForm.isActive} onChange={(event) => setBrandForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Active brand</span>
              </label>
              <div className="catalog-form__actions">
                {brandForm.id ? (
                  <button type="button" className="catalog-button catalog-button--danger" onClick={handleDeleteBrand} disabled={saving}>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                ) : <span />}
                <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? "Saving..." : brandForm.id ? "Update Brand" : "Create Brand"}</span>
                </button>
              </div>
            </form>
          </article>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Brand Registry</h2>
              <span>{filteredBrands.length} record(s)</span>
            </div>
            <div className="catalog-list">
              {filteredBrands.map((brand) => (
                <button key={brand.id} type="button" className="catalog-list__item" onClick={() => setBrandForm({
                  id: brand.id,
                  name: brand.name,
                  logoUrl: brand.logo_url ?? "",
                  isActive: Boolean(brand.is_active),
                })}>
                  <strong>{brand.name}</strong>
                  <span>{brand.logo_url || "No logo URL"} • {brand.is_active ? "Active" : "Inactive"}</span>
                </button>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "engine-types" ? (
        <section className="catalog-grid">
          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Engine Type Database</h2>
              <button type="button" className="catalog-text-button" onClick={() => setEngineTypeForm(emptyEngineTypeForm())}>
                New Engine Type
              </button>
            </div>
            <form className="catalog-form" onSubmit={handleEngineTypeSubmit}>
              <label>
                <span>Name</span>
                <input value={engineTypeForm.name} onChange={(event) => setEngineTypeForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                <span>Code</span>
                <input value={engineTypeForm.code} onChange={(event) => setEngineTypeForm((current) => ({ ...current, code: event.target.value }))} />
              </label>
              <label>
                <span>Description</span>
                <textarea value={engineTypeForm.description} onChange={(event) => setEngineTypeForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
              </label>
              <label>
                <span>Displacement (cc)</span>
                <input type="number" min="0" value={engineTypeForm.displacementCc} onChange={(event) => setEngineTypeForm((current) => ({ ...current, displacementCc: event.target.value }))} />
              </label>
              <label>
                <span>Cooling Type</span>
                <input value={engineTypeForm.coolingType} onChange={(event) => setEngineTypeForm((current) => ({ ...current, coolingType: event.target.value }))} placeholder="air, liquid, oil..." />
              </label>
              <label className="catalog-checkbox">
                <input type="checkbox" checked={engineTypeForm.isActive} onChange={(event) => setEngineTypeForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Active engine type</span>
              </label>
              <div className="catalog-form__actions">
                {engineTypeForm.id ? (
                  <button type="button" className="catalog-button catalog-button--danger" onClick={handleDeleteEngineType} disabled={saving}>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                ) : <span />}
                <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? "Saving..." : engineTypeForm.id ? "Update Engine Type" : "Create Engine Type"}</span>
                </button>
              </div>
            </form>
          </article>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Engine Type Records</h2>
              <span>{filteredEngineTypes.length} record(s)</span>
            </div>
            <div className="catalog-list">
              {filteredEngineTypes.map((engineType) => (
                <button key={engineType.id} type="button" className="catalog-list__item" onClick={() => setEngineTypeForm({
                  id: engineType.id,
                  name: engineType.name,
                  code: engineType.code ?? "",
                  description: engineType.description ?? "",
                  displacementCc: engineType.displacement_cc ? String(engineType.displacement_cc) : "",
                  coolingType: engineType.cooling_type ?? "",
                  isActive: Boolean(engineType.is_active),
                })}>
                  <strong>{engineType.name}</strong>
                  <span>{engineType.code || "No code"} • {engineType.cooling_type || "Cooling n/a"} • {engineType.is_active ? "Active" : "Inactive"}</span>
                </button>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "models" ? (
        <section className="catalog-grid">
          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Motorcycle Model Database</h2>
              <button type="button" className="catalog-text-button" onClick={() => setMotorcycleModelForm(emptyMotorcycleModelForm())}>
                New Model
              </button>
            </div>
            <form className="catalog-form" onSubmit={handleMotorcycleModelSubmit}>
              <label>
                <span>Motorcycle Brand / Make</span>
                <input value={motorcycleModelForm.brand} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, brand: event.target.value }))} required />
              </label>
              <label>
                <span>Model Name</span>
                <input value={motorcycleModelForm.modelName} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, modelName: event.target.value }))} required />
              </label>
              <label>
                <span>Engine Type</span>
                <div className="catalog-select">
                  <select value={motorcycleModelForm.engineTypeId} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, engineTypeId: event.target.value }))}>
                    <option value="">Select engine type</option>
                    {engineTypes.map((engineType) => (
                      <option key={engineType.id} value={engineType.id}>
                        {engineType.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <div className="catalog-form__split">
                <label>
                  <span>Year From</span>
                  <input type="number" min="1950" value={motorcycleModelForm.yearFrom} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, yearFrom: event.target.value }))} />
                </label>
                <label>
                  <span>Year To</span>
                  <input type="number" min="1950" value={motorcycleModelForm.yearTo} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, yearTo: event.target.value }))} />
                </label>
              </div>
              <label className="catalog-checkbox">
                <input type="checkbox" checked={motorcycleModelForm.isActive} onChange={(event) => setMotorcycleModelForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Active model</span>
              </label>
              <div className="catalog-form__actions">
                {motorcycleModelForm.id ? (
                  <button type="button" className="catalog-button catalog-button--danger" onClick={handleDeleteMotorcycleModel} disabled={saving}>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                ) : <span />}
                <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? "Saving..." : motorcycleModelForm.id ? "Update Model" : "Create Model"}</span>
                </button>
              </div>
            </form>
          </article>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Motorcycle Fitment Models</h2>
              <span>{filteredMotorcycleModels.length} record(s)</span>
            </div>
            <div className="catalog-list">
              {filteredMotorcycleModels.map((model) => (
                <button key={model.id} type="button" className="catalog-list__item" onClick={() => setMotorcycleModelForm({
                  id: model.id,
                  brand: model.brand,
                  modelName: model.model_name,
                  engineTypeId: model.engine_type_id ?? "",
                  yearFrom: model.year_from ? String(model.year_from) : "",
                  yearTo: model.year_to ? String(model.year_to) : "",
                  isActive: Boolean(model.is_active),
                })}>
                  <strong>{formatMotorcycleLabel(model)}</strong>
                  <span>{model.is_active ? "Active" : "Inactive"} • Created {new Date(model.created_at).toLocaleDateString("en-US")}</span>
                </button>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "compatibility" ? (
        <section className="catalog-grid">
          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Compatibility Mapping</h2>
              <span>Map a part to the motorcycles it fits.</span>
            </div>
            <form className="catalog-form" onSubmit={handleCompatibilitySubmit}>
              <label>
                <span>Product</span>
                <div className="catalog-select">
                  <select value={compatibilityForm.productId} onChange={(event) => setCompatibilityForm((current) => ({ ...current, productId: event.target.value }))} required>
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {formatProductLabel(product)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Motorcycle Model</span>
                <div className="catalog-select">
                  <select value={compatibilityForm.motorcycleModelId} onChange={(event) => setCompatibilityForm((current) => ({ ...current, motorcycleModelId: event.target.value }))} required>
                    <option value="">Select motorcycle model</option>
                    {motorcycleModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {formatMotorcycleLabel(model)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Fitment Notes</span>
                <textarea value={compatibilityForm.notes} onChange={(event) => setCompatibilityForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional note, trim detail, or installation note." />
              </label>
              {selectedCompatibilityProduct ? (
                <div className="catalog-highlight">
                  <Package size={16} />
                  <span>Selected product: {selectedCompatibilityProduct.name} • {selectedCompatibilityProduct.sku}</span>
                </div>
              ) : null}
              <div className="catalog-form__actions">
                <span />
                <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                  <Save size={15} />
                  <span>{saving ? "Saving..." : "Add Compatibility"}</span>
                </button>
              </div>
            </form>
          </article>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Existing Compatibility Records</h2>
              <span>{filteredCompatibilityRows.length} record(s)</span>
            </div>
            <div className="catalog-list">
              {filteredCompatibilityRows.map((row) => (
                <div key={row.id} className="catalog-list__item catalog-list__item--static">
                  <div>
                    <strong>{row.product?.name || "Unknown Product"} • {row.product?.sku || "n/a"}</strong>
                    <span>{row.motorcycle_model ? formatMotorcycleLabel(row.motorcycle_model) : "Unknown motorcycle model"}</span>
                    {row.notes ? <small>{row.notes}</small> : null}
                  </div>
                  <button type="button" className="catalog-icon-button" onClick={() => void handleDeleteCompatibility(row.id)} disabled={saving} aria-label="Delete compatibility row">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "groups" ? (
        <section className="catalog-stack">
          <div className="catalog-grid">
            <article className="catalog-panel">
              <div className="catalog-panel__header">
                <h2>Product Group Management</h2>
                <button type="button" className="catalog-text-button" onClick={() => setProductGroupForm(emptyProductGroupForm())}>
                  New Group
                </button>
              </div>
              <form className="catalog-form" onSubmit={handleProductGroupSubmit}>
                <label>
                  <span>Group Name</span>
                  <input value={productGroupForm.name} onChange={(event) => setProductGroupForm((current) => ({ ...current, name: event.target.value }))} required />
                </label>
                <label>
                  <span>Code</span>
                  <input value={productGroupForm.code} onChange={(event) => setProductGroupForm((current) => ({ ...current, code: event.target.value }))} />
                </label>
                <label>
                  <span>Description</span>
                  <textarea value={productGroupForm.description} onChange={(event) => setProductGroupForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
                </label>
                <label className="catalog-checkbox">
                  <input type="checkbox" checked={productGroupForm.isActive} onChange={(event) => setProductGroupForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>Active product group</span>
                </label>
                <div className="catalog-form__actions">
                  {productGroupForm.id ? (
                    <button type="button" className="catalog-button catalog-button--danger" onClick={handleDeleteProductGroup} disabled={saving}>
                      <Trash2 size={15} />
                      <span>Delete</span>
                    </button>
                  ) : <span />}
                  <button type="submit" className="catalog-button catalog-button--primary" disabled={saving}>
                    <Save size={15} />
                    <span>{saving ? "Saving..." : productGroupForm.id ? "Update Group" : "Create Group"}</span>
                  </button>
                </div>
              </form>
            </article>

            <article className="catalog-panel">
              <div className="catalog-panel__header">
                <h2>Defined Product Groups</h2>
                <span>{filteredProductGroups.length} record(s)</span>
              </div>
              <div className="catalog-list">
                {filteredProductGroups.map((group) => (
                  <button key={group.id} type="button" className="catalog-list__item" onClick={() => {
                    setProductGroupForm({
                      id: group.id,
                      name: group.name,
                      code: group.code ?? "",
                      description: group.description ?? "",
                      isActive: Boolean(group.is_active),
                    });
                    setSelectedGroupId(group.id);
                    setAssignedProductIds(deriveAssignedProductIds(group.id, products));
                  }}>
                    <strong>{group.name}</strong>
                    <span>{group.code || "No code"} • {group.is_active ? "Active" : "Inactive"}</span>
                  </button>
                ))}
              </div>
            </article>
          </div>

          <article className="catalog-panel">
            <div className="catalog-panel__header">
              <h2>Product Grouping Assignment</h2>
              <span>{activeGroupName ? `Assigning products for ${activeGroupName}` : "Choose a group to assign products."}</span>
            </div>
            <div className="catalog-grouping">
              <label>
                <span>Target Group</span>
                <div className="catalog-select">
                  <select value={selectedGroupId} onChange={(event) => {
                    const nextGroupId = event.target.value;
                    setSelectedGroupId(nextGroupId);
                    setAssignedProductIds(deriveAssignedProductIds(nextGroupId, products));
                  }}>
                    <option value="">Select product group</option>
                    {productGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>

              <div className="catalog-grouping__list">
                {filteredProducts.map((product) => {
                  const checked = assignedProductIds.includes(product.id);

                  return (
                    <label key={product.id} className={`catalog-grouping__item ${checked ? "catalog-grouping__item--active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setAssignedProductIds((current) => [...current, product.id]);
                            return;
                          }

                          setAssignedProductIds((current) => current.filter((id) => id !== product.id));
                        }}
                        disabled={!selectedGroupId}
                      />
                      <div>
                        <strong>{formatProductLabel(product)}</strong>
                        <span>
                          {product.category?.name || "No category"} • {product.brand?.name || "No brand"} • {product.product_group?.name || "Ungrouped"}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="catalog-form__actions">
                <div className="catalog-highlight">
                  <Boxes size={16} />
                  <span>{assignedProductIds.length} product(s) selected for this group.</span>
                </div>
                <button type="button" className="catalog-button catalog-button--primary" onClick={handleSaveGroupAssignments} disabled={saving || !selectedGroupId}>
                  <Settings2 size={15} />
                  <span>{saving ? "Saving..." : "Save Grouping"}</span>
                </button>
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}

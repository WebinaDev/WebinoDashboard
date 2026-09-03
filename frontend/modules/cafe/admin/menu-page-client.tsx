"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import type {
  CafeEngagementSettings,
  CafeMenuListItem,
  CafeMenuSettings,
  MenuBanner as BaseMenuBanner,
} from "@/themes/cafe-starter/types"

type MenuBanner = BaseMenuBanner & { menu_id?: number | null }

type Tab = "settings" | "items" | "menus" | "banners" | "engagement"

type Category = {
  id: number
  name: string
  slug: string
  description?: string | null
  icon_url?: string | null
  image_url?: string | null
  sort_order?: number
}

type Product = {
  id: number
  name: string
  slug?: string | null
  description?: string | null
  image_url?: string | null
  cover_image_url?: string | null
  video_url?: string | null
  sku?: string | null
  category_id?: number | null
  menu_id?: number | null
  price_minor: number
  currency: string
  stock?: number
  is_available?: boolean
  is_hidden?: boolean
  is_new?: boolean
  is_featured?: boolean
  is_sold_out?: boolean
  calories?: number | null
  spice_level?: number
  sort_order?: number
  discount_percent?: number
  category?: Category | null
}

type MenuRecord = CafeMenuListItem & {
  is_active?: boolean
  sort_order?: number
  schedule?: unknown
}

const menuDefaults: CafeMenuSettings = {
  default_view: "grid",
  show_search: true,
  show_category_bar: true,
  show_new_badge: true,
  header_cta_label_fa: "",
  header_cta_label_en: "",
  header_cta_url: "",
  placeholder_logo_text_fa: "",
  placeholder_logo_text_en: "",
}

const engagementDefaults: CafeEngagementSettings = {
  phone_gate_enabled: false,
  likes_enabled: true,
  feedback_enabled: true,
  share_whatsapp_enabled: true,
  share_telegram_enabled: true,
}

const emptyProduct = {
  name: "",
  description: "",
  image_url: "",
  cover_image_url: "",
  video_url: "",
  sku: "",
  category_id: "" as string | number,
  menu_id: "" as string | number,
  price_minor: 0,
  stock: 0,
  is_available: true,
  is_hidden: false,
  is_new: false,
  is_featured: false,
  is_sold_out: false,
  calories: "" as string | number,
  spice_level: 0,
  sort_order: 0,
  discount_percent: 0,
}

export default function MenuPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.menu")
  const tCatalog = useTranslations("catalog")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>("settings")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: menuSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["cafe-menu-settings"],
    queryFn: () => api<CafeMenuSettings>("/api/v1/cafe/menu-settings"),
  })

  const [settingsForm, setSettingsForm] = useState<CafeMenuSettings | null>(null)
  const settingsValues = settingsForm ?? menuSettings ?? menuDefaults

  const saveSettings = useMutation({
    mutationFn: () =>
      api<CafeMenuSettings>("/api/v1/cafe/menu-settings", {
        method: "PATCH",
        json: settingsValues,
      }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-menu-settings"] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/api/v1/categories"),
    enabled: tab === "items",
  })

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/api/v1/products"),
    enabled: tab === "items",
  })

  const { data: menus = [], isLoading: loadingMenus } = useQuery({
    queryKey: ["menus"],
    queryFn: () => api<MenuRecord[]>("/api/v1/menus"),
    enabled: tab === "items" || tab === "menus" || tab === "banners",
  })

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState(emptyProduct)
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    icon_url: "",
    image_url: "",
    sort_order: 0,
  })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkSoldOut, setBulkSoldOut] = useState(false)
  const [bulkAvailable, setBulkAvailable] = useState(true)
  const [bulkMenuId, setBulkMenuId] = useState("")

  const saveCategory = useMutation({
    mutationFn: () =>
      api<Category>("/api/v1/categories", {
        method: "POST",
        json: {
          name: categoryForm.name,
          description: categoryForm.description || null,
          icon_url: categoryForm.icon_url || null,
          image_url: categoryForm.image_url || null,
          sort_order: categoryForm.sort_order,
        },
      }),
    onSuccess: async () => {
      setCategoryForm({ name: "", description: "", icon_url: "", image_url: "", sort_order: 0 })
      await queryClient.invalidateQueries({ queryKey: ["categories"] })
      setMessage(tCatalog("category_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const saveProduct = useMutation({
    mutationFn: () => {
      const payload = {
        name: productForm.name,
        description: productForm.description || null,
        image_url: productForm.image_url || null,
        cover_image_url: productForm.cover_image_url || null,
        video_url: productForm.video_url || null,
        sku: productForm.sku || null,
        category_id: productForm.category_id ? Number(productForm.category_id) : null,
        menu_id: productForm.menu_id ? Number(productForm.menu_id) : null,
        price_minor: Number(productForm.price_minor),
        stock: Number(productForm.stock),
        is_available: productForm.is_available,
        is_hidden: productForm.is_hidden,
        is_new: productForm.is_new,
        is_featured: productForm.is_featured,
        is_sold_out: productForm.is_sold_out,
        calories: productForm.calories !== "" ? Number(productForm.calories) : null,
        spice_level: Number(productForm.spice_level),
        sort_order: Number(productForm.sort_order),
        discount_percent: Number(productForm.discount_percent),
      }
      if (editingProduct) {
        return api<Product>(`/api/v1/products/${editingProduct.id}`, { method: "PATCH", json: payload })
      }
      return api<Product>("/api/v1/products", { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setEditingProduct(null)
      setProductForm(emptyProduct)
      await queryClient.invalidateQueries({ queryKey: ["products"] })
      setMessage(tCatalog("product_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteProduct = useMutation({
    mutationFn: (id: number) => api(`/api/v1/products/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] })
    },
  })

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api(`/api/v1/categories/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })

  const bulkUpdate = useMutation({
    mutationFn: () =>
      api<Product[]>("/api/v1/products/bulk", {
        method: "PATCH",
        json: {
          product_ids: selectedIds,
          is_sold_out: bulkSoldOut,
          is_available: bulkAvailable,
          ...(bulkMenuId ? { menu_id: Number(bulkMenuId) } : {}),
        },
      }),
    onSuccess: async () => {
      setSelectedIds([])
      await queryClient.invalidateQueries({ queryKey: ["products"] })
      setMessage(t("bulk_applied"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const [menuForm, setMenuForm] = useState({
    name: "",
    slug: "",
    menu_type: "cafe",
    locale: "",
    is_active: true,
    sort_order: 0,
  })
  const [editingMenu, setEditingMenu] = useState<MenuRecord | null>(null)

  const saveMenu = useMutation({
    mutationFn: () => {
      const payload = {
        name: menuForm.name,
        slug: menuForm.slug || undefined,
        menu_type: menuForm.menu_type || "cafe",
        locale: menuForm.locale || null,
        is_active: menuForm.is_active,
        sort_order: Number(menuForm.sort_order),
      }
      if (editingMenu) {
        return api<MenuRecord>(`/api/v1/menus/${editingMenu.id}`, { method: "PATCH", json: payload })
      }
      return api<MenuRecord>("/api/v1/menus", { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setEditingMenu(null)
      setMenuForm({ name: "", slug: "", menu_type: "cafe", locale: "", is_active: true, sort_order: 0 })
      await queryClient.invalidateQueries({ queryKey: ["menus"] })
      setMessage(t("menu_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMenu = useMutation({
    mutationFn: (id: number) => api(`/api/v1/menus/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["menus"] })
    },
  })

  const { data: banners = [], isLoading: loadingBanners } = useQuery({
    queryKey: ["menu-banners"],
    queryFn: () => api<MenuBanner[]>("/api/v1/menu-banners"),
    enabled: tab === "banners",
  })

  const [bannerForm, setBannerForm] = useState({
    title_fa: "",
    title_en: "",
    image_url: "",
    link_url: "",
    menu_id: "" as string | number,
    sort_order: 0,
    is_active: true,
  })
  const [editingBanner, setEditingBanner] = useState<MenuBanner | null>(null)

  const saveBanner = useMutation({
    mutationFn: () => {
      const payload = {
        title_fa: bannerForm.title_fa || null,
        title_en: bannerForm.title_en || null,
        image_url: bannerForm.image_url,
        link_url: bannerForm.link_url || null,
        menu_id: bannerForm.menu_id ? Number(bannerForm.menu_id) : null,
        sort_order: Number(bannerForm.sort_order),
        is_active: bannerForm.is_active,
      }
      if (editingBanner) {
        return api<MenuBanner>(`/api/v1/menu-banners/${editingBanner.id}`, { method: "PATCH", json: payload })
      }
      return api<MenuBanner>("/api/v1/menu-banners", { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setEditingBanner(null)
      setBannerForm({
        title_fa: "",
        title_en: "",
        image_url: "",
        link_url: "",
        menu_id: "",
        sort_order: 0,
        is_active: true,
      })
      await queryClient.invalidateQueries({ queryKey: ["menu-banners"] })
      setMessage(t("banner_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteBanner = useMutation({
    mutationFn: (id: number) => api(`/api/v1/menu-banners/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["menu-banners"] })
    },
  })

  const { data: engagementData, isLoading: loadingEngagement } = useQuery({
    queryKey: ["cafe-engagement-settings"],
    queryFn: () => api<CafeEngagementSettings>("/api/v1/cafe/engagement-settings"),
    enabled: tab === "engagement",
  })

  const [engagementForm, setEngagementForm] = useState<CafeEngagementSettings | null>(null)
  const engagementValues = engagementForm ?? engagementData ?? engagementDefaults

  const saveEngagement = useMutation({
    mutationFn: () =>
      api<CafeEngagementSettings>("/api/v1/cafe/engagement-settings", {
        method: "PATCH",
        json: engagementValues,
      }),
    onSuccess: async () => {
      setMessage(t("engagement_saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-engagement-settings"] })
    },
    onError: (e: Error) => setError(e.message),
  })

  function startEditProduct(product: Product) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      image_url: product.image_url ?? "",
      cover_image_url: product.cover_image_url ?? "",
      video_url: product.video_url ?? "",
      sku: product.sku ?? "",
      category_id: product.category_id ?? "",
      menu_id: product.menu_id ?? "",
      price_minor: product.price_minor,
      stock: product.stock ?? 0,
      is_available: product.is_available ?? true,
      is_hidden: product.is_hidden ?? false,
      is_new: product.is_new ?? false,
      is_featured: product.is_featured ?? false,
      is_sold_out: product.is_sold_out ?? false,
      calories: product.calories ?? "",
      spice_level: product.spice_level ?? 0,
      sort_order: product.sort_order ?? 0,
      discount_percent: product.discount_percent ?? 0,
    })
  }

  function startEditMenu(menu: MenuRecord) {
    setEditingMenu(menu)
    setMenuForm({
      name: menu.name,
      slug: menu.slug,
      menu_type: menu.menu_type ?? "cafe",
      locale: menu.locale ?? "",
      is_active: menu.is_active ?? true,
      sort_order: menu.sort_order ?? 0,
    })
  }

  function startEditBanner(banner: MenuBanner) {
    setEditingBanner(banner)
    setBannerForm({
      title_fa: banner.title_fa ?? "",
      title_en: banner.title_en ?? "",
      image_url: banner.image_url,
      link_url: banner.link_url ?? "",
      menu_id: banner.menu_id ?? "",
      sort_order: banner.sort_order ?? 0,
      is_active: banner.is_active ?? true,
    })
  }

  function toggleProduct(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const tabs: Tab[] = ["settings", "items", "menus", "banners", "engagement"]
  const isLoading =
    (tab === "settings" && loadingSettings) ||
    (tab === "items" && (loadingCategories || loadingProducts)) ||
    (tab === "menus" && loadingMenus) ||
    (tab === "banners" && loadingBanners) ||
    (tab === "engagement" && loadingEngagement)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "outline"}
            onClick={() => {
              setTab(key)
              setMessage(null)
              setError(null)
            }}
          >
            {t(`tab_${key}`)}
          </Button>
        ))}
      </div>

      {isLoading ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {tab === "settings" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("display_heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("default_view")}</Label>
                <select
                  className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={settingsValues.default_view}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsValues,
                      default_view: e.target.value as "grid" | "list",
                    })
                  }
                >
                  <option value="grid">{t("view_grid")}</option>
                  <option value="list">{t("view_list")}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settingsValues.show_search}
                  onCheckedChange={(v) => setSettingsForm({ ...settingsValues, show_search: Boolean(v) })}
                />
                {t("show_search")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settingsValues.show_category_bar}
                  onCheckedChange={(v) => setSettingsForm({ ...settingsValues, show_category_bar: Boolean(v) })}
                />
                {t("show_category_bar")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settingsValues.show_new_badge}
                  onCheckedChange={(v) => setSettingsForm({ ...settingsValues, show_new_badge: Boolean(v) })}
                />
                {t("show_new_badge")}
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("cta_heading")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("cta_label_fa")}</Label>
                <Input
                  value={settingsValues.header_cta_label_fa ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsValues, header_cta_label_fa: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("cta_label_en")}</Label>
                <Input
                  value={settingsValues.header_cta_label_en ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsValues, header_cta_label_en: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("cta_url")}</Label>
                <Input
                  value={settingsValues.header_cta_url ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsValues, header_cta_url: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            {tCommon("save")}
          </Button>
        </>
      ) : null}

      {tab === "items" ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tCatalog("categories_heading")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div>
                    <Label>{tCatalog("name")}</Label>
                    <Input
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{tCatalog("description")}</Label>
                    <Textarea
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <Button onClick={() => saveCategory.mutate()} disabled={!categoryForm.name || saveCategory.isPending}>
                    <Plus className="mr-2 size-4" />
                    {tCatalog("add_category")}
                  </Button>
                </div>
                <ul className="space-y-2">
                  {categories.map((cat) => (
                    <li key={cat.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{cat.name}</p>
                        <p className="text-muted-foreground text-xs">{cat.slug}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteCategory.mutate(cat.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{editingProduct ? tCatalog("edit_product") : tCatalog("new_product")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{tCatalog("name")}</Label>
                  <Input
                    value={productForm.name}
                    onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{tCatalog("description")}</Label>
                  <Textarea
                    value={productForm.description}
                    onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tCatalog("price")}</Label>
                    <Input
                      type="number"
                      value={productForm.price_minor}
                      onChange={(e) => setProductForm((f) => ({ ...f, price_minor: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>{t("calories")}</Label>
                    <Input
                      type="number"
                      value={productForm.calories}
                      onChange={(e) => setProductForm((f) => ({ ...f, calories: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("cover_image_url")}</Label>
                    <Input
                      value={productForm.cover_image_url}
                      onChange={(e) => setProductForm((f) => ({ ...f, cover_image_url: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("video_url")}</Label>
                    <Input
                      value={productForm.video_url}
                      onChange={(e) => setProductForm((f) => ({ ...f, video_url: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>{tCatalog("image_url")}</Label>
                  <Input
                    value={productForm.image_url}
                    onChange={(e) => setProductForm((f) => ({ ...f, image_url: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tCatalog("category")}</Label>
                    <select
                      className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      value={productForm.category_id}
                      onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
                    >
                      <option value="">{tCatalog("no_category")}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("menu_id")}</Label>
                    <select
                      className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      value={productForm.menu_id}
                      onChange={(e) => setProductForm((f) => ({ ...f, menu_id: e.target.value }))}
                    >
                      <option value="">{t("no_menu")}</option>
                      {menus.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>{t("spice_level")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={productForm.spice_level}
                    onChange={(e) => setProductForm((f) => ({ ...f, spice_level: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={productForm.is_available}
                      onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_available: Boolean(v) }))}
                    />
                    {tCatalog("available")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={productForm.is_featured}
                      onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_featured: Boolean(v) }))}
                    />
                    {t("is_featured")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={productForm.is_sold_out}
                      onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_sold_out: Boolean(v) }))}
                    />
                    {t("is_sold_out")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={productForm.is_new}
                      onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_new: Boolean(v) }))}
                    />
                    {tCatalog("new_badge")}
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveProduct.mutate()} disabled={!productForm.name || saveProduct.isPending}>
                    {tCatalog("save")}
                  </Button>
                  {editingProduct ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingProduct(null)
                        setProductForm(emptyProduct)
                      }}
                    >
                      {tCatalog("cancel_edit")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {selectedIds.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("bulk_heading")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={bulkSoldOut} onCheckedChange={(v) => setBulkSoldOut(Boolean(v))} />
                  {t("is_sold_out")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={bulkAvailable} onCheckedChange={(v) => setBulkAvailable(Boolean(v))} />
                  {tCatalog("available")}
                </label>
                <div>
                  <Label>{t("menu_id")}</Label>
                  <select
                    className="border-input bg-background mt-1 rounded-md border px-3 py-2 text-sm"
                    value={bulkMenuId}
                    onChange={(e) => setBulkMenuId(e.target.value)}
                  >
                    <option value="">{t("bulk_no_menu")}</option>
                    {menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => bulkUpdate.mutate()} disabled={bulkUpdate.isPending}>
                  {t("bulk_apply")} ({selectedIds.length})
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{tCatalog("products_heading")}</CardTitle>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="text-muted-foreground text-sm">{tCatalog("empty")}</p>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
                    <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.includes(product.id)}
                          onCheckedChange={() => toggleProduct(product.id)}
                        />
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {product.category?.name ?? tCatalog("no_category")} · {product.price_minor}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {product.is_featured ? <Badge>{t("is_featured")}</Badge> : null}
                            {product.is_sold_out ? <Badge variant="outline">{t("is_sold_out")}</Badge> : null}
                            {!product.is_available ? (
                              <Badge variant="secondary">{tCatalog("unavailable")}</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEditProduct(product)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteProduct.mutate(product.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {tab === "menus" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{editingMenu ? t("edit_menu") : t("add_menu")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{tCatalog("name")}</Label>
                <Input value={menuForm.name} onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>{t("menu_slug")}</Label>
                <Input value={menuForm.slug} onChange={(e) => setMenuForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
              <div>
                <Label>{t("menu_type")}</Label>
                <Input
                  value={menuForm.menu_type}
                  onChange={(e) => setMenuForm((f) => ({ ...f, menu_type: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("menu_locale")}</Label>
                <Input value={menuForm.locale} onChange={(e) => setMenuForm((f) => ({ ...f, locale: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={menuForm.is_active}
                  onCheckedChange={(v) => setMenuForm((f) => ({ ...f, is_active: Boolean(v) }))}
                />
                {t("menu_active")}
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={() => saveMenu.mutate()} disabled={!menuForm.name || saveMenu.isPending}>
                  {tCatalog("save")}
                </Button>
                {editingMenu ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingMenu(null)
                      setMenuForm({ name: "", slug: "", menu_type: "cafe", locale: "", is_active: true, sort_order: 0 })
                    }}
                  >
                    {tCatalog("cancel_edit")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("menus_heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {menus.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("menus_empty")}</p>
              ) : (
                menus.map((menu) => (
                  <div key={menu.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{menu.name}</p>
                      <p className="text-muted-foreground text-xs">{menu.slug}</p>
                      {!menu.is_active ? <Badge variant="secondary">{t("menu_inactive")}</Badge> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEditMenu(menu)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMenu.mutate(menu.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {tab === "banners" ? (
        <>
          <p className="text-muted-foreground text-sm">{t("banner_limit_hint")}</p>
          <Card>
            <CardHeader>
              <CardTitle>{editingBanner ? t("edit_banner") : t("add_banner")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("banner_title_fa")}</Label>
                <Input
                  value={bannerForm.title_fa}
                  onChange={(e) => setBannerForm((f) => ({ ...f, title_fa: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("banner_title_en")}</Label>
                <Input
                  value={bannerForm.title_en}
                  onChange={(e) => setBannerForm((f) => ({ ...f, title_en: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{tCatalog("image_url")}</Label>
                <Input
                  value={bannerForm.image_url}
                  onChange={(e) => setBannerForm((f) => ({ ...f, image_url: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("banner_link")}</Label>
                <Input
                  value={bannerForm.link_url}
                  onChange={(e) => setBannerForm((f) => ({ ...f, link_url: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("menu_id")}</Label>
                <select
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  value={bannerForm.menu_id}
                  onChange={(e) => setBannerForm((f) => ({ ...f, menu_id: e.target.value }))}
                >
                  <option value="">{t("no_menu")}</option>
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={bannerForm.is_active}
                  onCheckedChange={(v) => setBannerForm((f) => ({ ...f, is_active: Boolean(v) }))}
                />
                {t("menu_active")}
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  onClick={() => saveBanner.mutate()}
                  disabled={!bannerForm.image_url || saveBanner.isPending || (!editingBanner && banners.length >= 3)}
                >
                  {tCatalog("save")}
                </Button>
                {editingBanner ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingBanner(null)
                      setBannerForm({
                        title_fa: "",
                        title_en: "",
                        image_url: "",
                        link_url: "",
                        menu_id: "",
                        sort_order: 0,
                        is_active: true,
                      })
                    }}
                  >
                    {tCatalog("cancel_edit")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("banners_heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {banners.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("banners_empty")}</p>
              ) : (
                banners.map((banner) => (
                  <div key={banner.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{banner.title_fa || banner.title_en || banner.image_url}</p>
                      {!banner.is_active ? <Badge variant="secondary">{t("menu_inactive")}</Badge> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEditBanner(banner)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteBanner.mutate(banner.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {tab === "engagement" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("engagement_heading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(engagementValues.phone_gate_enabled)}
                  onCheckedChange={(v) =>
                    setEngagementForm({ ...engagementValues, phone_gate_enabled: Boolean(v) })
                  }
                />
                {t("engagement_phone_gate")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(engagementValues.likes_enabled)}
                  onCheckedChange={(v) => setEngagementForm({ ...engagementValues, likes_enabled: Boolean(v) })}
                />
                {t("engagement_likes")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(engagementValues.feedback_enabled)}
                  onCheckedChange={(v) => setEngagementForm({ ...engagementValues, feedback_enabled: Boolean(v) })}
                />
                {t("engagement_feedback")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(engagementValues.share_whatsapp_enabled)}
                  onCheckedChange={(v) =>
                    setEngagementForm({ ...engagementValues, share_whatsapp_enabled: Boolean(v) })
                  }
                />
                {t("engagement_whatsapp")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(engagementValues.share_telegram_enabled)}
                  onCheckedChange={(v) =>
                    setEngagementForm({ ...engagementValues, share_telegram_enabled: Boolean(v) })
                  }
                />
                {t("engagement_telegram")}
              </label>
            </CardContent>
          </Card>
          <Button onClick={() => saveEngagement.mutate()} disabled={saveEngagement.isPending}>
            {tCommon("save")}
          </Button>
        </>
      ) : null}
    </div>
  )
}

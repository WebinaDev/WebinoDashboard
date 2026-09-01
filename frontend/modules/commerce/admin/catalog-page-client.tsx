"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type Category = {
  id: number
  name: string
  slug: string
  description?: string | null
  icon_url?: string | null
  image_url?: string | null
  sort_order?: number
}

type ProductVariant = {
  id: number
  name: string
  price_minor: number
  is_default?: boolean
  sort_order?: number
}

type Product = {
  id: number
  name: string
  slug?: string | null
  description?: string | null
  image_url?: string | null
  sku?: string | null
  category_id?: number | null
  price_minor: number
  currency: string
  stock?: number
  is_available?: boolean
  is_hidden?: boolean
  is_new?: boolean
  sort_order?: number
  discount_percent?: number
  category?: Category | null
  variants?: ProductVariant[]
}

const emptyProduct = {
  name: "",
  description: "",
  image_url: "",
  sku: "",
  category_id: "" as string | number,
  price_minor: 0,
  stock: 0,
  is_available: true,
  is_hidden: false,
  is_new: false,
  sort_order: 0,
  discount_percent: 0,
}

export default function CatalogPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("catalog")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState(emptyProduct)
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    icon_url: "",
    image_url: "",
    sort_order: 0,
  })
  const [variantForm, setVariantForm] = useState({ name: "", price_minor: 0, sort_order: 0 })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/api/v1/categories"),
  })

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/api/v1/products"),
  })

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
      setMessage(t("category_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const saveProduct = useMutation({
    mutationFn: () => {
      const payload = {
        name: productForm.name,
        description: productForm.description || null,
        image_url: productForm.image_url || null,
        sku: productForm.sku || null,
        category_id: productForm.category_id ? Number(productForm.category_id) : null,
        price_minor: Number(productForm.price_minor),
        stock: Number(productForm.stock),
        is_available: productForm.is_available,
        is_hidden: productForm.is_hidden,
        is_new: productForm.is_new,
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
      setMessage(t("product_saved"))
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

  const addVariant = useMutation({
    mutationFn: () => {
      if (!editingProduct) throw new Error("no product")
      return api<ProductVariant>(`/api/v1/products/${editingProduct.id}/variants`, {
        method: "POST",
        json: {
          name: variantForm.name,
          price_minor: Number(variantForm.price_minor),
          sort_order: Number(variantForm.sort_order),
        },
      })
    },
    onSuccess: async () => {
      setVariantForm({ name: "", price_minor: 0, sort_order: 0 })
      await queryClient.invalidateQueries({ queryKey: ["products"] })
      const refreshed = await api<Product[]>("/api/v1/products")
      const updated = refreshed.find((p) => p.id === editingProduct?.id)
      if (updated) setEditingProduct(updated)
    },
  })

  function startEdit(product: Product) {
    setEditingProduct(product)
    setProductForm({
      name: product.name,
      description: product.description ?? "",
      image_url: product.image_url ?? "",
      sku: product.sku ?? "",
      category_id: product.category_id ?? "",
      price_minor: product.price_minor,
      stock: product.stock ?? 0,
      is_available: product.is_available ?? true,
      is_hidden: product.is_hidden ?? false,
      is_new: product.is_new ?? false,
      sort_order: product.sort_order ?? 0,
      discount_percent: product.discount_percent ?? 0,
    })
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("categories_heading")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <Label>{t("name")}</Label>
                <Input value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>{t("description")}</Label>
                <Textarea value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("icon_url")}</Label>
                  <Input value={categoryForm.icon_url} onChange={(e) => setCategoryForm((f) => ({ ...f, icon_url: e.target.value }))} />
                </div>
                <div>
                  <Label>{t("image_url")}</Label>
                  <Input value={categoryForm.image_url} onChange={(e) => setCategoryForm((f) => ({ ...f, image_url: e.target.value }))} />
                </div>
              </div>
              <Button onClick={() => saveCategory.mutate()} disabled={!categoryForm.name || saveCategory.isPending}>
                <Plus className="mr-2 size-4" />
                {t("add_category")}
              </Button>
            </div>

            {loadingCategories ? (
              <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{editingProduct ? t("edit_product") : t("new_product")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("description")}</Label>
              <Textarea value={productForm.description} onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("price")}</Label>
                <Input type="number" value={productForm.price_minor} onChange={(e) => setProductForm((f) => ({ ...f, price_minor: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>{t("discount_percent")}</Label>
                <Input type="number" value={productForm.discount_percent} onChange={(e) => setProductForm((f) => ({ ...f, discount_percent: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>{t("image_url")}</Label>
              <Input value={productForm.image_url} onChange={(e) => setProductForm((f) => ({ ...f, image_url: e.target.value }))} />
            </div>
            <div>
              <Label>{t("category")}</Label>
              <select
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={productForm.category_id}
                onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">{t("no_category")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={productForm.is_available} onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_available: Boolean(v) }))} />
                {t("available")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={productForm.is_hidden} onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_hidden: Boolean(v) }))} />
                {t("hidden")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={productForm.is_new} onCheckedChange={(v) => setProductForm((f) => ({ ...f, is_new: Boolean(v) }))} />
                {t("new_badge")}
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveProduct.mutate()} disabled={!productForm.name || saveProduct.isPending}>
                {t("save")}
              </Button>
              {editingProduct ? (
                <Button variant="outline" onClick={() => { setEditingProduct(null); setProductForm(emptyProduct) }}>
                  {t("cancel_edit")}
                </Button>
              ) : null}
            </div>

            {editingProduct ? (
              <div className="border-t pt-4">
                <p className="mb-2 font-medium">{t("variants_heading")}</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {(editingProduct.variants ?? []).map((v) => (
                    <Badge key={v.id} variant="outline">{v.name}</Badge>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder={t("variant_name")} value={variantForm.name} onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))} />
                  <Input type="number" placeholder={t("price")} value={variantForm.price_minor} onChange={(e) => setVariantForm((f) => ({ ...f, price_minor: Number(e.target.value) }))} />
                  <Button onClick={() => addVariant.mutate()} disabled={!variantForm.name}>{t("add_variant")}</Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("products_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProducts ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {product.category?.name ?? t("no_category")} · {product.price_minor}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {!product.is_available ? <Badge variant="outline">{t("unavailable")}</Badge> : null}
                      {product.is_hidden ? <Badge variant="secondary">{t("hidden")}</Badge> : null}
                      {product.is_new ? <Badge>{t("new_badge")}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(product)}>
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
    </div>
  )
}

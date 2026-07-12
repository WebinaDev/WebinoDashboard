"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"

type Category = {
  id: number
  name: string
  slug: string
}

type Product = {
  id: number
  name: string
  sku: string | null
  price_minor: number
  stock: number
  category_id: number | null
  currency?: string
}

export default function CatalogPage() {
  const { t, i18n } = useTranslation(["catalog"])
  const lng = i18n.language.startsWith("fa") ? "fa" : "en"
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Product[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [formName, setFormName] = useState("")
  const [formSku, setFormSku] = useState("")
  const [formPrice, setFormPrice] = useState("0")
  const [formStock, setFormStock] = useState("0")
  const [formCat, setFormCat] = useState<string>("")

  function reloadAll() {
    api<{ data: Category[] }>("/api/v1/categories")
      .then((r) => setCategories(r.data))
      .catch(() => setCategories([]))
    api<{ data: Product[] }>("/api/v1/products")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
  }

  useEffect(() => {
    reloadAll()
  }, [])

  function openNew() {
    setEditing(null)
    setFormName("")
    setFormSku("")
    setFormPrice("0")
    setFormStock("0")
    setFormCat(categories[0]?.id ? String(categories[0].id) : "")
    setSheetOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setFormName(p.name)
    setFormSku(p.sku ?? "")
    setFormPrice(String(p.price_minor))
    setFormStock(String(p.stock))
    setFormCat(p.category_id ? String(p.category_id) : "")
    setSheetOpen(true)
  }

  async function saveProduct() {
    const payload = {
      name: formName,
      sku: formSku || null,
      price_minor: Number(formPrice) || 0,
      stock: Number(formStock) || 0,
      category_id: formCat ? Number(formCat) : null,
    }
    if (editing) {
      await api(`/api/v1/products/${editing.id}`, {
        method: "PATCH",
        json: payload,
      })
    } else {
      await api("/api/v1/products", {
        method: "POST",
        json: payload,
      })
    }
    setSheetOpen(false)
    reloadAll()
  }

  async function deleteProduct(id: number) {
    if (!window.confirm(t("catalog:confirm_delete"))) {
      return
    }
    await api(`/api/v1/products/${id}`, { method: "DELETE" })
    reloadAll()
  }

  async function addToCart(productId: number) {
    await api("/api/v1/cart/items", {
      method: "POST",
      json: { product_id: productId, quantity: 1 },
    })
  }

  async function addCategory() {
    const name = window.prompt("Category name")
    if (!name) {
      return
    }
    await api("/api/v1/categories", {
      method: "POST",
      json: { name },
    })
    reloadAll()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("catalog:title")}</h1>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">{t("catalog:categories_heading")}</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => void addCategory()}>
            +
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="bg-muted rounded-md px-2 py-1 text-xs">
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">{t("catalog:products_heading")}</h2>
        <Button type="button" size="sm" onClick={() => openNew()}>
          {t("catalog:new_product")}
        </Button>
      </div>

      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 text-start font-medium">{t("catalog:products_heading")}</th>
              <th className="p-3 text-start font-medium">{t("catalog:sku")}</th>
              <th className="p-3 text-start font-medium">{t("catalog:price")}</th>
              <th className="p-3 text-start font-medium">{t("catalog:stock")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="text-muted-foreground p-6" colSpan={5}>
                  {t("catalog:empty")}
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.sku ?? "—"}</td>
                  <td className="p-3">{formatInteger(p.price_minor, lng)}</td>
                  <td className="p-3">{formatInteger(p.stock, lng)}</td>
                  <td className="p-3 flex flex-wrap justify-end gap-1">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void addToCart(p.id)}>
                      +
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(p)}>
                      {t("catalog:edit")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void deleteProduct(p.id)}
                    >
                      {t("catalog:delete")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? t("catalog:edit") : t("catalog:new_product")}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label>{t("catalog:name")}</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("catalog:sku")}</Label>
              <Input value={formSku} onChange={(e) => setFormSku(e.target.value)} dir="ltr" className="font-mono" />
            </div>
            <div className="grid gap-2">
              <Label>{t("catalog:category")}</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={formCat}
                onChange={(e) => setFormCat(e.target.value)}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{t("catalog:price")}</Label>
              <Input
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                dir="ltr"
                className="font-mono"
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("catalog:stock")}</Label>
              <Input
                value={formStock}
                onChange={(e) => setFormStock(e.target.value)}
                dir="ltr"
                className="font-mono"
                inputMode="numeric"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void saveProduct()}>
                {t("catalog:save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                {t("catalog:cancel_edit")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

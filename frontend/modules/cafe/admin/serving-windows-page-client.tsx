"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useConfirm } from "@/components/ConfirmDialog"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

/**
 * ساعت سرو — which items are on, and when.
 *
 * A café has one menu and three days: breakfast until eleven, the plates from twelve, the cake
 * counter all day. Without this the till offers the soup at eight and the guest is told no,
 * which is indistinguishable from the menu being wrong.
 *
 * A window targets either a product or a category, never both, so precedence is unambiguous —
 * a product's own window wins over its category's.
 */

type Window = {
  id: number
  label: string | null
  product_id: number | null
  category_id: number | null
  weekdays: number[] | null
  start_time: string
  end_time: string
  is_active: boolean
  crosses_midnight: boolean
}

type Product = { id: number; name: string }

type Category = { id: number; name: string }

// 0 = Monday, matching the server. A café's week reads Saturday→Friday, and Sunday-first
// numbering would put the weekend in the middle of the list.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

const blank = {
  label: "",
  target: "product" as "product" | "category",
  product_id: "",
  category_id: "",
  weekdays: [] as number[],
  start_time: "08:00",
  end_time: "11:00",
  is_active: true,
}

export default function ServingWindowsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.serving_windows")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()

  const [form, setForm] = useState(blank)

  const windows = useQuery({
    queryKey: ["cafe-serving-windows"],
    queryFn: async () => (await api<{ data: { windows: Window[] } }>("/api/v1/cafe/serving-windows"))?.data?.windows ?? [],
    retry: false,
  })

  const products = useQuery({
    queryKey: ["cafe-serving-products"],
    queryFn: async () => {
      const res = await api<{ data: Product[] }>("/api/v1/products?per_page=200")
      return (res as unknown as { data?: { data?: Product[] } })?.data?.data ?? (res as unknown as { data?: Product[] })?.data ?? []
    },
    retry: false,
  })

  const categories = useQuery({
    queryKey: ["cafe-serving-categories"],
    queryFn: async () => {
      const res = await api<{ data: Category[] }>("/api/v1/categories?per_page=200")
      return (res as unknown as { data?: { data?: Category[] } })?.data?.data ?? (res as unknown as { data?: Category[] })?.data ?? []
    },
    retry: false,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cafe-serving-windows"] })

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/serving-windows", {
        method: "POST",
        json: {
          label: form.label.trim() || null,
          product_id: form.target === "product" && form.product_id ? Number(form.product_id) : null,
          category_id: form.target === "category" && form.category_id ? Number(form.category_id) : null,
          weekdays: form.weekdays.length > 0 ? form.weekdays : null,
          start_time: form.start_time,
          end_time: form.end_time,
          is_active: form.is_active,
        },
      }),
    onSuccess: async () => {
      setForm(blank)
      await invalidate()
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const toggle = useMutation({
    mutationFn: (window: Window) =>
      api(`/api/v1/cafe/serving-windows/${window.id}`, {
        method: "PATCH",
        json: {
          label: window.label,
          product_id: window.product_id,
          category_id: window.category_id,
          weekdays: window.weekdays,
          start_time: window.start_time,
          end_time: window.end_time,
          is_active: !window.is_active,
        },
      }),
    onSuccess: async () => {
      await invalidate()
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/serving-windows/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidate()
      toast.success(t("deleted"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const productName = (id: number | null) =>
    id === null ? null : (products.data ?? []).find((p) => p.id === id)?.name ?? `#${id}`

  const categoryName = (id: number | null) =>
    id === null ? null : (categories.data ?? []).find((c) => c.id === id)?.name ?? `#${id}`

  const rows = windows.data ?? []

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection title={t("new_window")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sw-label">{t("label")}</Label>
            <Input
              id="sw-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={t("label_placeholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sw-target">{t("target")}</Label>
            <select
              id="sw-target"
              className={cafeSelectClass}
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value as "product" | "category", product_id: "", category_id: "" }))}
            >
              <option value="product">{t("target_product")}</option>
              <option value="category">{t("target_category")}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sw-item">{form.target === "product" ? t("product") : t("category")}</Label>
            <select
              id="sw-item"
              className={cafeSelectClass}
              value={form.target === "product" ? form.product_id : form.category_id}
              onChange={(e) =>
                setForm((f) =>
                  f.target === "product" ? { ...f, product_id: e.target.value } : { ...f, category_id: e.target.value },
                )
              }
            >
              <option value="">{t("choose")}</option>
              {form.target === "product"
                ? (products.data ?? []).map((product) => (
                    <option key={product.id} value={String(product.id)}>
                      {product.name}
                    </option>
                  ))
                : (categories.data ?? []).map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sw-from">{t("start_time")}</Label>
            <Input id="sw-from" type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sw-to">{t("end_time")}</Label>
            <Input id="sw-to" type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
            <p className="text-muted-foreground text-xs">{t("midnight_hint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("weekdays")}</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={form.weekdays.includes(day)}
                    onCheckedChange={() =>
                      setForm((f) => ({
                        ...f,
                        weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day],
                      }))
                    }
                  />
                  {t(`day_${day}`)}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{t("weekdays_hint")}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button
            disabled={create.isPending || (form.target === "product" ? form.product_id === "" : form.category_id === "")}
            onClick={() => create.mutate()}
          >
            {create.isPending ? tCommon("saving") : t("save")}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: Boolean(v) }))} />
            {tCommon("active")}
          </label>
        </div>
      </CafeSection>

      <CafeSection title={t("title")}>
        {rows.length === 0 ? (
          <CafeEmptyState message={t("empty")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("label")}</th>
                  <th className="p-2 text-start">{t("target")}</th>
                  <th className="p-2 text-start">{t("window")}</th>
                  <th className="p-2 text-start">{t("weekdays")}</th>
                  <th className="p-2 text-start">{tCommon("status")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{row.label ?? "—"}</td>
                    <td className="p-2">
                      {row.product_id !== null ? productName(row.product_id) : categoryName(row.category_id)}
                    </td>
                    <td className="p-2 tabular-nums" dir="ltr">
                      {row.start_time} – {row.end_time}
                      {row.crosses_midnight ? <span className="text-muted-foreground ms-1 text-xs">({t("next_day")})</span> : null}
                    </td>
                    <td className="p-2">
                      {row.weekdays === null || row.weekdays.length === 0
                        ? t("every_day")
                        : row.weekdays.map((day) => t(`day_${day}`)).join(" · ")}
                    </td>
                    <td className="p-2">
                      <Badge variant={row.is_active ? "outline" : "secondary"}>
                        {row.is_active ? tCommon("active") : tCommon("inactive")}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(row)}>
                          {row.is_active ? t("disable") : t("enable")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() =>
                            confirm({
                              title: t("delete_confirm_title"),
                              description: t("delete_confirm_body"),
                              confirmLabel: tCommon("delete"),
                              destructive: true,
                              onConfirm: () => {
                                remove.mutate(row.id)
                              },
                            })
                          }
                        >
                          {tCommon("delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CafeSection>
      {dialog}
    </CafeAdminShell>
  )
}

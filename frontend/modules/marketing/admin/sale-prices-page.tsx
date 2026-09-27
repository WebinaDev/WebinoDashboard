"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type ProductRow = {
  id: number
  name: string
  sku?: string | null
  image_url?: string | null
  price_minor?: number | null
  sale_price_minor?: number | null
}

type ListPayload = {
  data: ProductRow[]
  meta?: { total?: number; current_page?: number; last_page?: number; per_page?: number }
}

export default function SalePricesPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sale_prices")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [scopeMode, setScopeMode] = useState<"selected" | "filters">("selected")
  const [percent, setPercent] = useState("10")
  const [days, setDays] = useState("7")

  const q = useQuery({
    queryKey: ["sale-prices", "list", page, appliedSearch],
    queryFn: async () => {
      const p = new URLSearchParams({
        page: String(page),
        per_page: "20",
        paginate: "1",
        status: "publish",
      })
      if (appliedSearch.trim()) p.set("search", appliedSearch.trim())
      return api<ListPayload | ProductRow[]>(`/api/v1/products?${p.toString()}`)
    },
  })

  const items: ProductRow[] = useMemo(() => {
    const raw = q.data
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (Array.isArray((raw as ListPayload).data)) return (raw as ListPayload).data
    return []
  }, [q.data])

  const total =
    !Array.isArray(q.data) && q.data && "meta" in q.data
      ? Number(q.data.meta?.total ?? items.length)
      : items.length

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.length) return prev
      const ids = new Set(items.map((r) => r.id))
      const next = prev.filter((id) => ids.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [items])

  const allPageSelected = items.length > 0 && items.every((r) => selectedIds.includes(r.id))

  function toggleAllPage(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((r) => r.id)])))
    } else {
      const drop = new Set(items.map((r) => r.id))
      setSelectedIds((prev) => prev.filter((id) => !drop.has(id)))
    }
  }

  function buildBody(action: "apply" | "remove" | "preview") {
    const body: Record<string, unknown> = { action }
    if (action !== "remove") {
      body.percent = Number(percent)
      body.days = Number(days) || 7
    }
    if (scopeMode === "selected") {
      body.product_ids = selectedIds
    } else {
      body.filters = {
        status: "publish",
        ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
      }
    }
    return body
  }

  const applyMut = useMutation({
    mutationFn: () =>
      api<{ ok: number; skipped: number }>("/api/v1/shop/products/bulk-sale", {
        method: "POST",
        json: buildBody("apply"),
      }),
    onSuccess: (res) => {
      toast.success(t("apply_done", { ok: res.ok }))
      setApplyOpen(false)
      void qc.invalidateQueries({ queryKey: ["sale-prices"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeMut = useMutation({
    mutationFn: () =>
      api<{ ok: number }>("/api/v1/shop/products/bulk-sale", {
        method: "POST",
        json: buildBody("remove"),
      }),
    onSuccess: (res) => {
      toast.success(t("remove_done", { ok: res.ok }))
      setRemoveOpen(false)
      void qc.invalidateQueries({ queryKey: ["sale-prices"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const selectionLabel =
    selectedIds.length === 0
      ? t("select_hint")
      : t("selected_count", { count: selectedIds.length })

  function openApply(mode: "selected" | "filters") {
    if (mode === "selected" && selectedIds.length === 0) {
      toast.error(t("need_selection"))
      return
    }
    setScopeMode(mode)
    setApplyOpen(true)
  }

  function openRemove(mode: "selected" | "filters") {
    if (mode === "selected" && selectedIds.length === 0) {
      toast.error(t("need_selection"))
      return
    }
    setScopeMode(mode)
    setRemoveOpen(true)
  }

  return (
    <PageShell title={t("title")}>
      <div className="bg-sky-500/10 text-sky-950 dark:text-sky-100 mb-4 rounded-xl px-4 py-3 text-sm leading-relaxed">
        {t("banner")}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAppliedSearch(search)
            setPage(1)
          }}
        >
          {tCommon("save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openApply("filters")}>
          {t("apply_filtered")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openRemove("filters")}>
          {t("remove_filtered")}
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allPageSelected}
            onCheckedChange={(v) => toggleAllPage(!!v)}
            aria-label={t("select_all_page")}
          />
          <span className="text-muted-foreground">{selectionLabel}</span>
        </div>
        <p className="text-muted-foreground text-xs">{total}</p>
      </div>

      <Card className="mb-20">
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="text-muted-foreground p-6 text-sm">{tCommon("loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">{t("empty")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((row) => {
                const checked = selectedIds.includes(row.id)
                const regular = Number(row.price_minor) || 0
                const sale = Number(row.sale_price_minor) || 0
                return (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <Checkbox checked={checked} onCheckedChange={(v) => {
                      setSelectedIds((prev) =>
                        v ? [...prev, row.id] : prev.filter((x) => x !== row.id),
                      )
                    }} />
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.image_url} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="bg-muted size-12 shrink-0 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      {row.sku ? <p className="text-muted-foreground text-xs">{row.sku}</p> : null}
                    </div>
                    <div className="shrink-0 text-end text-sm">
                      <p>
                        {t("regular")}: {regular}
                      </p>
                      <p className="text-muted-foreground">
                        {t("sale")}: {sale || "—"}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur md:static md:mt-4 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-end gap-2 md:max-w-none">
          <Button type="button" variant="outline" onClick={() => openRemove("selected")}>
            {t("remove")}
          </Button>
          <Button type="button" onClick={() => openApply("selected")}>
            {t("apply")}
          </Button>
        </div>
      </div>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apply")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="sale-percent">{t("percent")}</Label>
              <Input
                id="sale-percent"
                type="number"
                min={1}
                max={99}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale-days">{t("days")}</Label>
              <Input
                id="sale-days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              disabled={applyMut.isPending || !(Number(percent) > 0 && Number(percent) < 100)}
              onClick={() => void applyMut.mutateAsync()}
            >
              {t("apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("remove_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("remove_confirm_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                removeMut.mutate()
              }}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fmtDate, selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"

const onError = (e: Error) => toast.error(getApiErrorMessage(e))

type BasalamProductRow = {
  id: number
  name: string
  sku: string | null
  status: string
  image_url: string | null
  type: string | null
  basalam_product_id: string | null
  basalam_product_ids: string[]
  basalam_status: number | null
  connected: boolean
  sync_status: string | null
  last_error: string | null
  last_sync_at: string | null
}

type RemoteRow = Record<string, unknown> & { id: number; title?: string; name?: string }

const STATUS_ARCHIVED = 3790

export function BasalamProductsTab() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("marketplace_admin.basalam")
  const tm = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<"all" | "connected" | "unconnected">("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [connectFor, setConnectFor] = useState<number | null>(null)
  const [includeOut, setIncludeOut] = useState(false)

  const key = ["basalam-products", filter, search, page]
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ products: BasalamProductRow[]; total: number; per_page: number }>(
        `/api/v1/marketplace/basalam/products?filter=${filter}&page=${page}&per_page=20&search=${encodeURIComponent(search)}`,
      ),
  })
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["basalam-products"] })
    void qc.invalidateQueries({ queryKey: ["marketplace-jobs", "basalam"] })
  }

  const bulk = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      api<{ creatable_count?: number; queued?: boolean }>(`/api/v1/marketplace/basalam/sync/products/${path}`, { method: "POST", json: body ?? {} }),
    onSuccess: (r) => {
      if (r?.queued === false) toast.info(t("no_creatable"))
      else toast.success(t("queued"))
      invalidate()
    },
    onError,
  })
  const one = useMutation({
    mutationFn: ({ action, productId, extra }: { action: string; productId: number; extra?: Record<string, unknown> }) =>
      api<{ message?: string }>(`/api/v1/marketplace/basalam/sync/products/${action}`, { method: "POST", json: { product_id: productId, ...(extra ?? {}) } }),
    onSuccess: () => {
      toast.success(t("done"))
      invalidate()
    },
    onError,
  })

  const dupQ = useQuery({
    queryKey: ["basalam-duplicates"],
    queryFn: () => api<{ duplicates: { basalam_product_id: string; product_ids: number[] }[] }>("/api/v1/marketplace/basalam/products/duplicates"),
  })
  const repair = useMutation({
    mutationFn: () => api<{ repaired?: number }>("/api/v1/marketplace/basalam/products/duplicates/repair", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("duplicates_repaired"))
      void qc.invalidateQueries({ queryKey: ["basalam-duplicates"] })
      void qc.invalidateQueries({ queryKey: ["basalam-status"] })
      invalidate()
    },
    onError,
  })

  const rows = q.data?.products ?? []
  const last = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.per_page)) : 1
  const dups = dupQ.data?.duplicates ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bulk_title")}</CardTitle>
          <CardDescription>{t("bulk_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={bulk.isPending} onClick={() => bulk.mutate({ path: "create-all", body: { include_out_of_stock: includeOut } })}>
              {t("create_all")}
            </Button>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={includeOut} onCheckedChange={(v) => setIncludeOut(Boolean(v))} />
              {t("include_out_of_stock")}
            </label>
            <Button variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate({ path: "update-all", body: { mode: "full" } })}>
              {t("update_all")}
            </Button>
            <Button variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate({ path: "update-all", body: { mode: "quick" } })}>
              {t("update_all_quick")}
            </Button>
            <Button variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate({ path: "connect-all" })}>
              {t("connect_all")}
            </Button>
            <Button variant="secondary" disabled={bulk.isPending} onClick={() => bulk.mutate({ path: "sync-now" })}>
              {t("sync_now")}
            </Button>
          </div>
          {dups.length ? (
            <div className="space-y-2 rounded-md border border-amber-400/50 p-3 text-sm">
              <p>{t("duplicates_alert", { count: dups.length })}</p>
              <ul className="text-muted-foreground text-xs">
                {dups.slice(0, 10).map((d) => (
                  <li key={d.basalam_product_id} dir="ltr">
                    {d.basalam_product_id} → {d.product_ids.map((id) => `#${id}`).join(", ")}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" disabled={repair.isPending} onClick={() => repair.mutate()}>
                {t("repair_duplicates")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tm("tabs.products")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder={t("search_products")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            <select
              className={`${selectClass} max-w-[12rem]`}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as typeof filter)
                setPage(1)
              }}
            >
              {(["all", "connected", "unconnected"] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`filter.${f}`)}
                </option>
              ))}
            </select>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{q.isLoading ? tm("loading") : t("no_products")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tm("product")}</TableHead>
                    <TableHead>{t("basalam_id")}</TableHead>
                    <TableHead>{tm("status")}</TableHead>
                    <TableHead>{tm("last_sync")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[16rem]">
                        <Link href={`/dashboard/products/${p.id}`} className="block truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {p.sku || `#${p.id}`}
                          {p.status !== "publish" ? ` · ${p.status}` : ""}
                        </div>
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs">
                        {p.basalam_product_ids.length
                          ? p.basalam_product_ids.map((id) => (
                              <a key={id} href={`https://basalam.com/p/${id}`} target="_blank" rel="noreferrer" className="text-primary me-1 block hover:underline">
                                {id}
                              </a>
                            ))
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {p.connected ? (
                          <div className="space-y-1">
                            <Badge variant={p.sync_status === "failed" ? "destructive" : "secondary"}>{t(`sync_status.${p.sync_status ?? "synced"}`)}</Badge>
                            {p.basalam_status === STATUS_ARCHIVED ? <Badge variant="outline">{t("archived")}</Badge> : null}
                          </div>
                        ) : (
                          <Badge variant="outline">{t("not_linked")}</Badge>
                        )}
                        {p.last_error ? (
                          <div className="text-destructive max-w-[16rem] truncate text-xs" title={p.last_error}>
                            {p.last_error}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(p.last_sync_at, locale)}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap rtl:space-x-reverse">
                        {!p.connected ? (
                          <>
                            <Button size="sm" disabled={one.isPending} onClick={() => one.mutate({ action: "create", productId: p.id })}>
                              {t("create")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConnectFor(connectFor === p.id ? null : p.id)}>
                              {t("link")}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" disabled={one.isPending} onClick={() => one.mutate({ action: "update", productId: p.id })}>
                              {t("update")}
                            </Button>
                            {p.basalam_status === STATUS_ARCHIVED ? (
                              <Button size="sm" variant="ghost" disabled={one.isPending} onClick={() => one.mutate({ action: "restore", productId: p.id })}>
                                {t("restore")}
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={one.isPending} onClick={() => one.mutate({ action: "archive", productId: p.id })}>
                                {t("archive")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={one.isPending}
                              onClick={() => {
                                confirm({ intent: "action", description: t("confirm_unlink"), onConfirm: () => one.mutateAsync({ action: "disconnect", productId: p.id }) })
                              }}
                            >
                              {t("unlink")}
                            </Button>
                          </>
                        )}
                        {connectFor === p.id ? (
                          <div className="mt-2">
                            <RemoteBasalamPicker
                              initial={p.name}
                              onPick={(remote) => {
                                one.mutate({ action: "connect", productId: p.id, extra: { basalam_product_id: remote.id } })
                                setConnectFor(null)
                              }}
                            />
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {last > 1 ? (
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {tm("prev")}
              </Button>
              <span className="text-muted-foreground">
                {page} / {last}
              </span>
              <Button size="sm" variant="outline" disabled={page >= last} onClick={() => setPage(page + 1)}>
                {tm("next")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}

export function RemoteBasalamPicker({ initial = "", onPick }: { initial?: string; onPick: (r: RemoteRow) => void }) {
  const t = useTranslations("marketplace_admin.basalam")
  const [kw, setKw] = useState(initial)
  const [cursor, setCursor] = useState<string | null>(null)
  const search = useMutation({
    mutationFn: (c: string | null) =>
      api<{ data: RemoteRow[]; has_more: boolean; next_cursor: string | null }>(
        `/api/v1/marketplace/basalam/products/remote?q=${encodeURIComponent(kw)}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`,
      ),
    onSuccess: (r) => setCursor(r.next_cursor),
    onError,
  })
  const rows = search.data?.data ?? []
  return (
    <div className="space-y-2 rounded-md border p-2 text-start">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search.mutate(null)
        }}
      >
        <Input className="h-8" value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("search_remote")} />
        <Button type="submit" size="sm" variant="outline" disabled={search.isPending}>
          {t("search")}
        </Button>
      </form>
      {rows.length ? (
        <ul className="max-h-60 space-y-1 overflow-auto text-sm">
          {rows.map((r) => (
            <li key={r.id} className="hover:bg-muted flex items-center justify-between gap-2 rounded px-2 py-1">
              <span className="min-w-0 truncate">
                {String(r.title ?? r.name ?? "")}{" "}
                <code dir="ltr" className="text-muted-foreground text-xs">
                  {r.id}
                </code>
              </span>
              <Button size="sm" variant="ghost" onClick={() => onPick(r)}>
                {t("pick")}
              </Button>
            </li>
          ))}
        </ul>
      ) : search.isSuccess ? (
        <p className="text-muted-foreground text-xs">{t("no_results")}</p>
      ) : null}
      {search.data?.has_more ? (
        <Button size="sm" variant="ghost" disabled={search.isPending} onClick={() => search.mutate(cursor)}>
          {t("more")}
        </Button>
      ) : null}
    </div>
  )
}

// ── Categories ──────────────────────────────────────────────────────────

export type BasalamCategoryNode = { id: number; name: string; parent_id: number | null; children: BasalamCategoryNode[] }

type Mapping = {
  id: number
  category_id: number
  category_name: string
  basalam_category_level1: number | null
  basalam_category_level2: number | null
  basalam_category_level3: number | null
  basalam_category_name: string
}

type OptionMap = { id: number; local_name: string; basalam_name: string }

type Prediction = { name: string; category_id: number; level1: number | null; level2: number | null; level3: number | null } | null

export function useBasalamCategoryTree() {
  return useQuery({
    queryKey: ["basalam-categories"],
    queryFn: () => api<{ categories: BasalamCategoryNode[] }>("/api/v1/marketplace/basalam/categories"),
    staleTime: 60 * 60_000,
  })
}

/** Three cascading selects over the Basalam category tree. */
export function BasalamCategoryPicker({ value, onChange }: { value: (number | null)[]; onChange: (ids: (number | null)[], name: string) => void }) {
  const t = useTranslations("marketplace_admin.basalam")
  const q = useBasalamCategoryTree()
  const tree = q.data?.categories ?? []
  const l1 = tree.find((n) => n.id === value[0]) ?? null
  const l2 = l1?.children.find((n) => n.id === value[1]) ?? null
  const levels: BasalamCategoryNode[][] = [tree, l1?.children ?? [], l2?.children ?? []]
  const pick = (level: number, id: number | null) => {
    const next = [...value.slice(0, level), id, ...[null, null, null]].slice(0, 3)
    const n1 = tree.find((n) => n.id === next[0])
    const n2 = n1?.children.find((n) => n.id === next[1])
    const n3 = n2?.children.find((n) => n.id === next[2])
    onChange(next, [n1?.name, n2?.name, n3?.name].filter(Boolean).join(" › "))
  }
  if (q.isLoading) return <p className="text-muted-foreground text-xs">{t("loading_categories")}</p>
  if (q.error) return <p className="text-destructive text-xs">{getApiErrorMessage(q.error)}</p>
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {levels.map((opts, i) => (
        <select key={i} className={selectClass} value={value[i] ?? ""} disabled={i > 0 && !value[i - 1]} onChange={(e) => pick(i, e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t(`level.${i + 1}`)}</option>
          {opts.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      ))}
    </div>
  )
}

export function BasalamCategoriesTab() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const tree = useBasalamCategoryTree()
  const localQ = useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => {
      const res = await api<{ id: number; name: string }[] | { data: { id: number; name: string }[] }>("/api/v1/categories?per_page=500")
      return Array.isArray(res) ? res : res.data
    },
  })
  const mappingsQ = useQuery({ queryKey: ["basalam-mappings"], queryFn: () => api<{ mappings: Mapping[] }>("/api/v1/marketplace/basalam/categories/mappings") })
  const optionsQ = useQuery({ queryKey: ["basalam-option-maps"], queryFn: () => api<{ maps: OptionMap[] }>("/api/v1/marketplace/basalam/categories/option-maps") })

  const [localId, setLocalId] = useState("")
  const [levels, setLevels] = useState<(number | null)[]>([null, null, null])
  const [levelName, setLevelName] = useState("")
  const [title, setTitle] = useState("")
  const [prediction, setPrediction] = useState<Prediction>(null)
  const [opt, setOpt] = useState({ id: 0, local_name: "", basalam_name: "" })
  const [attrCat, setAttrCat] = useState("")

  const refreshTree = useMutation({
    mutationFn: () => api<{ categories: BasalamCategoryNode[] }>("/api/v1/marketplace/basalam/categories?refresh=1"),
    onSuccess: (d) => qc.setQueryData(["basalam-categories"], d),
    onError,
  })
  const detect = useMutation({
    mutationFn: () => api<{ prediction: Prediction }>("/api/v1/marketplace/basalam/categories/detect", { method: "POST", json: { title } }),
    onSuccess: (r) => {
      setPrediction(r.prediction)
      if (!r.prediction) toast.info(t("no_prediction"))
    },
    onError,
  })
  const saveMapping = useMutation({
    mutationFn: () =>
      api("/api/v1/marketplace/basalam/categories/mappings", {
        method: "POST",
        json: {
          category_id: Number(localId),
          basalam_category_level1: levels[0],
          basalam_category_level2: levels[1],
          basalam_category_level3: levels[2],
          basalam_category_name: levelName,
        },
      }),
    onSuccess: () => {
      toast.success(t("mapping_saved"))
      setLocalId("")
      setLevels([null, null, null])
      setLevelName("")
      void qc.invalidateQueries({ queryKey: ["basalam-mappings"] })
    },
    onError,
  })
  const deleteMapping = useMutation({
    mutationFn: (id: number) => api("/api/v1/marketplace/basalam/categories/mappings/delete", { method: "POST", json: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["basalam-mappings"] }),
    onError,
  })
  const saveOpt = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/categories/option-maps", { method: "POST", json: opt.id ? opt : { local_name: opt.local_name, basalam_name: opt.basalam_name } }),
    onSuccess: () => {
      setOpt({ id: 0, local_name: "", basalam_name: "" })
      void qc.invalidateQueries({ queryKey: ["basalam-option-maps"] })
    },
    onError,
  })
  const deleteOpt = useMutation({
    mutationFn: (id: number) => api("/api/v1/marketplace/basalam/categories/option-maps/delete", { method: "POST", json: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["basalam-option-maps"] }),
    onError,
  })
  const attrsQ = useQuery({
    queryKey: ["basalam-attrs", attrCat],
    queryFn: () => api<{ attributes: { id: number; title: string; required?: boolean; unit?: unknown }[]; max_preparation_days: number | null }>(`/api/v1/marketplace/basalam/categories/attributes?category_id=${attrCat}`),
    enabled: Number(attrCat) > 0,
  })

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    const walk = (nodes: BasalamCategoryNode[]) => nodes.forEach((n) => (m.set(n.id, n.name), walk(n.children)))
    walk(tree.data?.categories ?? [])
    return m
  }, [tree.data])
  const mappings = mappingsQ.data?.mappings ?? []
  const options = optionsQ.data?.maps ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("mappings_title")}</CardTitle>
            <CardDescription>{t("mappings_hint")}</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={refreshTree.isPending} onClick={() => refreshTree.mutate()}>
            {t("refresh_categories")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label>{t("store_category")}</Label>
            <select className={`${selectClass} max-w-sm`} value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">{t("select_category")}</option>
              {(localQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>{t("basalam_category")}</Label>
            <BasalamCategoryPicker
              value={levels}
              onChange={(ids, name) => {
                setLevels(ids)
                setLevelName(name)
              }}
            />
          </div>
          <Button disabled={!localId || !levels.some(Boolean) || saveMapping.isPending} onClick={() => saveMapping.mutate()}>
            {t("save_mapping")}
          </Button>
          {mappings.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("store_category")}</TableHead>
                    <TableHead>{t("basalam_category")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.category_name}</TableCell>
                      <TableCell>
                        {m.basalam_category_name ||
                          [m.basalam_category_level1, m.basalam_category_level2, m.basalam_category_level3]
                            .filter(Boolean)
                            .map((id) => nameById.get(id as number) ?? id)
                            .join(" › ")}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={deleteMapping.isPending} onClick={() => deleteMapping.mutate(m.id)}>
                          {t("delete")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("no_mappings")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("detect_title")}</CardTitle>
          <CardDescription>{t("detect_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) detect.mutate()
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("product_title")} />
            <Button type="submit" variant="outline" disabled={detect.isPending || !title.trim()}>
              {t("detect")}
            </Button>
          </form>
          {prediction ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{prediction.name}</Badge>
              <code dir="ltr" className="text-muted-foreground text-xs">
                {[prediction.level1, prediction.level2, prediction.level3].filter(Boolean).join(" / ")}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLevels([prediction.level1, prediction.level2, prediction.level3])
                  setLevelName(prediction.name)
                }}
              >
                {t("use_for_mapping")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("option_maps_title")}</CardTitle>
          <CardDescription>{t("option_maps_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-2xl gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={opt.local_name} onChange={(e) => setOpt((o) => ({ ...o, local_name: e.target.value }))} placeholder={t("local_attribute")} />
            <Input value={opt.basalam_name} onChange={(e) => setOpt((o) => ({ ...o, basalam_name: e.target.value }))} placeholder={t("basalam_attribute")} />
            <Button disabled={!opt.local_name.trim() || !opt.basalam_name.trim() || saveOpt.isPending} onClick={() => saveOpt.mutate()}>
              {opt.id ? t("save") : t("add")}
            </Button>
          </div>
          {options.length ? (
            <ul className="max-w-2xl space-y-1 text-sm">
              {options.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 border-b py-1">
                  <span>
                    {o.local_name} ← {o.basalam_name}
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpt({ id: o.id, local_name: o.local_name, basalam_name: o.basalam_name })}>
                      {t("edit")}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={deleteOpt.isPending} onClick={() => deleteOpt.mutate(o.id)}>
                      {t("delete")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("no_option_maps")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("attributes_title")}</CardTitle>
          <CardDescription>{t("attributes_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input className="max-w-xs" dir="ltr" type="number" value={attrCat} onChange={(e) => setAttrCat(e.target.value)} placeholder={t("category_id")} />
          {attrsQ.data ? (
            <>
              <p className="text-muted-foreground text-xs">
                {t("max_preparation", { days: attrsQ.data.max_preparation_days ?? "—" })}
              </p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {attrsQ.data.attributes.map((a) => (
                  <li key={a.id}>
                    <code dir="ltr" className="text-muted-foreground me-1 text-xs">
                      {a.id}
                    </code>
                    {a.title}
                    {a.required ? <span className="text-destructive"> *</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

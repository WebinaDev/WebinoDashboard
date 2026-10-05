"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  MARKETPLACE_CREDENTIAL_FIELDS,
  MARKETPLACE_SETTINGS_BASE,
  type CredentialField,
  type MarketplaceJobRow,
  type MarketplaceLogRow,
  type MarketplaceMapRow,
  type MarketplaceOrderRow,
  type MarketplaceRemoteProduct,
  type MarketplaceSettingsView,
  type Paginated,
} from "@/lib/marketplace"
import { cn } from "@/lib/utils"
import { formatDisplayDateTime } from "@/lib/format-date"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

export const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export function fmtDate(value: string | null | undefined, locale: string): string {
  return formatDisplayDateTime(value, locale)
}

export function fmtNum(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined) return "—"
  return formatNumber(Number(value), normalizeUiLocale(locale))
}

function formatMetaScalar(value: unknown, locale: string): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "number") return fmtNum(value, locale)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return fmtDate(value, locale)
    return value
  }
  return String(value)
}

/** Human-readable key/value rows for marketplace log meta; raw JSON only in advanced expand. */
export function formatLogMetaEntries(meta: Record<string, unknown>, locale: string): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = []
  for (const [key, raw] of Object.entries(meta)) {
    if (raw === null || raw === undefined || raw === "") continue
    if (typeof raw === "object" && !Array.isArray(raw)) {
      for (const [subKey, subVal] of Object.entries(raw as Record<string, unknown>)) {
        rows.push({ key: `${key}.${subKey}`, value: formatMetaScalar(subVal, locale) })
      }
      continue
    }
    if (Array.isArray(raw)) {
      rows.push({ key, value: raw.map((v) => formatMetaScalar(v, locale)).join(", ") })
      continue
    }
    rows.push({ key, value: formatMetaScalar(raw, locale) })
  }
  return rows
}

export type PlatformTab = { key: string; label: string }

export function PlatformTabsNav({ platform, tabs, active }: { platform: string; tabs: PlatformTab[]; active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="marketplace-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${MARKETPLACE_SETTINGS_BASE}/${platform}${tab.key === tabs[0]?.key ? "" : `/${tab.key}`}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab.key === active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

export function Pager({ meta, page, setPage }: { meta?: Paginated<unknown>["meta"]; page: number; setPage: (p: number) => void }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  if (!meta || meta.last_page <= 1) return null
  const current = toLocaleDigits(String(meta.current_page), locale)
  const last = toLocaleDigits(String(meta.last_page), locale)
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        {t("prev")}
      </Button>
      <span className="text-muted-foreground">
        {current} / {last}
      </span>
      <Button size="sm" variant="outline" disabled={page >= meta.last_page} onClick={() => setPage(page + 1)}>
        {t("next")}
      </Button>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("marketplace_admin")
  const variant: "default" | "secondary" | "outline" | "destructive" =
    status === "failed" ? "destructive" : status === "done" || status === "completed" ? "secondary" : "outline"
  return <Badge variant={variant}>{t.has(`job_status.${status}`) ? t(`job_status.${status}`) : status}</Badge>
}

export function useMarketplaceSettings(platform: string) {
  return useQuery({
    queryKey: ["marketplace-settings", platform],
    queryFn: () => api<MarketplaceSettingsView>(`/api/v1/marketplace/${platform}/settings`),
  })
}

// ── Connection / credentials ────────────────────────────────────────────

export function ConnectionCard({
  platform,
  fields,
  extra,
  hideTest,
}: {
  platform: string
  fields?: CredentialField[]
  extra?: React.ReactNode
  hideTest?: boolean
}) {
  const t = useTranslations("marketplace_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const q = useMarketplaceSettings(platform)
  const [enabled, setEnabled] = useState(false)
  const [autoSync, setAutoSync] = useState(false)
  const [creds, setCreds] = useState<Record<string, unknown>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const defs = fields ?? MARKETPLACE_CREDENTIAL_FIELDS[platform] ?? []

  useEffect(() => {
    if (!q.data) return
    setEnabled(Boolean(q.data.enabled))
    setAutoSync(Boolean(q.data.auto_sync))
    setCreds({ ...q.data.credentials })
    setSecrets({})
  }, [q.data])

  const save = useMutation({
    mutationFn: (extraPayload?: { clear_secrets?: string[] }) => {
      const credentials: Record<string, unknown> = {}
      for (const f of defs) {
        if (f.type === "secret" || f.type === "secret_textarea") {
          if (secrets[f.key]) credentials[f.key] = secrets[f.key]
        } else if (f.key in creds) {
          credentials[f.key] = creds[f.key]
        }
      }
      return api<MarketplaceSettingsView>(`/api/v1/marketplace/${platform}/settings`, {
        method: "POST",
        json: { enabled, auto_sync: autoSync, credentials, ...(extraPayload ?? {}) },
      })
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["marketplace-settings", platform] })
      await qc.invalidateQueries({ queryKey: ["marketplace-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string; details?: Record<string, unknown> }>(`/api/v1/marketplace/${platform}/test-connection`, { method: "POST" }),
    onSuccess: (res) => (res.ok ? toast.success(res.message || t("test_ok")) : toast.error(res.message || t("test_failed"))),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  if (q.error) return <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p>

  const isFeed = q.data?.meta?.kind === "feed"
  const basic = defs.filter((f) => !f.advanced)
  const advanced = defs.filter((f) => f.advanced)
  const label = (key: string) => (t.has(`fields.${key}`) ? t(`fields.${key}`) : key)

  const renderField = (f: CredentialField) => {
    const hasSecret = Boolean(creds[`has_${f.key}`])
    if (f.type === "switch") {
      return (
        <div key={f.key} className="flex max-w-lg items-center justify-between gap-3">
          <Label>{label(f.key)}</Label>
          <Switch checked={Boolean(creds[f.key])} onCheckedChange={(v) => setCreds((c) => ({ ...c, [f.key]: v }))} />
        </div>
      )
    }
    if (f.type === "select") {
      return (
        <div key={f.key} className="grid max-w-lg gap-2">
          <Label>{label(f.key)}</Label>
          <select className={selectClass} value={String(creds[f.key] ?? "")} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )
    }
    if (f.type === "secret" || f.type === "secret_textarea") {
      const Comp = f.type === "secret_textarea" ? Textarea : Input
      return (
        <div key={f.key} className="grid max-w-lg gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label>{label(f.key)}</Label>
            {hasSecret ? (
              <button
                type="button"
                className="text-destructive text-xs hover:underline"
                onClick={() => save.mutate({ clear_secrets: [f.key] })}
              >
                {t("clear_secret")}
              </button>
            ) : null}
          </div>
          <Comp
            {...(f.type === "secret" ? { type: "password" } : { rows: 4 })}
            dir="ltr"
            autoComplete="off"
            placeholder={hasSecret ? t("secret_saved") : ""}
            value={secrets[f.key] ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
          />
        </div>
      )
    }
    if (f.type === "textarea") {
      return (
        <div key={f.key} className="grid max-w-lg gap-2">
          <Label>{label(f.key)}</Label>
          <Textarea rows={4} dir={f.ltr ? "ltr" : undefined} value={String(creds[f.key] ?? "")} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))} />
        </div>
      )
    }
    return (
      <div key={f.key} className="grid max-w-lg gap-2">
        <Label>{label(f.key)}</Label>
        <Input
          type={f.type === "number" ? "number" : "text"}
          dir={f.ltr || f.type === "number" ? "ltr" : undefined}
          value={String(creds[f.key] ?? "")}
          onChange={(e) => setCreds((c) => ({ ...c, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))}
        />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("connection")}</CardTitle>
        <CardDescription>{t(isFeed ? "connection_feed_hint" : "connection_api_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex max-w-lg items-center justify-between gap-3">
          <Label>{t("enabled")}</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        {!isFeed ? (
          <div className="flex max-w-lg items-center justify-between gap-3">
            <div>
              <Label>{t("auto_sync")}</Label>
              <p className="text-muted-foreground text-xs">{t("auto_sync_hint")}</p>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
        ) : null}
        {basic.map(renderField)}
        {advanced.length > 0 ? (
          <div className="space-y-4">
            <button type="button" className="text-primary text-sm hover:underline" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? t("hide_advanced") : t("show_advanced")}
            </button>
            {showAdvanced ? advanced.map(renderField) : null}
          </div>
        ) : null}
        {extra}
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>
            {tCommon("save")}
          </Button>
          {!hideTest ? (
            <Button variant="outline" disabled={test.isPending || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => test.mutate() })}>
              {t("test_connection")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function FeedUrlsCard({ platform }: { platform: string }) {
  const t = useTranslations("marketplace_admin")
  const q = useMarketplaceSettings(platform)
  const urls = q.data?.feed_urls ?? []
  if (!urls.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("feed_urls")}</CardTitle>
        <CardDescription>{t("feed_urls_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {urls.map((u) => (
          <div key={u.key} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
            <Badge variant="outline">{u.method}</Badge>
            <span className="text-muted-foreground text-xs">{t.has(`feed_keys.${u.key}`) ? t(`feed_keys.${u.key}`) : u.key}</span>
            <code dir="ltr" className="min-w-0 flex-1 truncate text-xs">
              {u.url}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(u.url)
                toast.success(t("copied"))
              }}
            >
              {t("copy")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function SyncActionsCard({ platform, supportsOrders }: { platform: string; supportsOrders: boolean }) {
  const t = useTranslations("marketplace_admin")
  const qc = useQueryClient()
  const run = useMutation({
    mutationFn: (action: "sync-now" | "pull-orders") => api(`/api/v1/marketplace/${platform}/${action}`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("job_queued"))
      await qc.invalidateQueries({ queryKey: ["marketplace-jobs", platform] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("sync")}</CardTitle>
        <CardDescription>{t("sync_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate("sync-now")}>
          {t("sync_all")}
        </Button>
        {supportsOrders ? (
          <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate("pull-orders")}>
            {t("pull_orders")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Maps ────────────────────────────────────────────────────────────────

export function MapsTable({ platform }: { platform: string }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const key = ["marketplace-maps", platform, page, search, status]
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api<Paginated<MarketplaceMapRow>>(
        `/api/v1/marketplace/${platform}/maps?page=${page}&q=${encodeURIComponent(search)}&status=${status}`,
      ),
  })
  const push = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketplace/maps/${id}/push`, { method: "POST" }),
    onSuccess: () => toast.success(t("pushed")),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["marketplace-maps", platform] }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketplace/maps/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-maps", platform] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = q.data?.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("maps")}</CardTitle>
        <CardDescription>{t("maps_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder={t("search_maps")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <select
            className={cn(selectClass, "max-w-[12rem]")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t("all")}</option>
            <option value="synced">{t("map_status.synced")}</option>
            <option value="error">{t("map_status.error")}</option>
            <option value="disabled">{t("map_status.disabled")}</option>
          </select>
        </div>
        {q.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_maps")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead>{t("remote_id")}</TableHead>
                  <TableHead>{t("remote_price")}</TableHead>
                  <TableHead>{t("remote_stock")}</TableHead>
                  <TableHead>{t("last_sync")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-[16rem]">
                      <div className="truncate font-medium">{m.product?.name ?? `#${m.product_id}`}</div>
                      {m.variant ? <div className="text-muted-foreground truncate text-xs">{m.variant.name || m.variant.sku}</div> : null}
                      {!m.sync_enabled ? <Badge variant="outline">{t("map_status.disabled")}</Badge> : null}
                    </TableCell>
                    <TableCell dir="ltr" className="text-xs">
                      {m.remote_url ? (
                        <a href={m.remote_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {m.remote_product_id}
                        </a>
                      ) : (
                        m.remote_product_id || "—"
                      )}
                      {m.remote_variant_id && m.remote_variant_id !== m.remote_product_id ? <div className="text-muted-foreground">{m.remote_variant_id}</div> : null}
                    </TableCell>
                    <TableCell>{fmtNum(m.remote_price, locale)}</TableCell>
                    <TableCell>{fmtNum(m.remote_stock, locale)}</TableCell>
                    <TableCell className="text-xs">
                      {fmtDate(m.last_sync_at, locale)}
                      {m.last_error ? <div className="text-destructive max-w-[18rem] truncate" title={m.last_error}>{m.last_error}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button size="sm" variant="outline" disabled={push.isPending} onClick={() => push.mutate(m.id)}>
                        {t("push")}
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => {
                          confirm({ description: t("confirm_delete_map"), onConfirm: () => remove.mutateAsync(m.id) })
                        }}
                      >
                        {t("delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager meta={q.data?.meta} page={page} setPage={setPage} />
      </CardContent>
      {confirmDialog}
    </Card>
  )
}

export function RemoteSearchCard({ platform, onPick }: { platform: string; onPick?: (p: MarketplaceRemoteProduct) => void }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const [kw, setKw] = useState("")
  const [page, setPage] = useState(1)
  const search = useMutation({
    mutationFn: (p: number) => api<MarketplaceRemoteProduct[]>(`/api/v1/marketplace/${platform}/search?q=${encodeURIComponent(kw)}&page=${p}`),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const rows = search.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("remote_search")}</CardTitle>
        <CardDescription>{t("remote_search_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            search.mutate(1)
          }}
        >
          <Input className="max-w-xs" value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("keyword")} />
          <Button type="submit" variant="outline" disabled={search.isPending}>
            {t("search")}
          </Button>
        </form>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("title")}</TableHead>
                  <TableHead>{t("remote_id")}</TableHead>
                  <TableHead>{t("remote_price")}</TableHead>
                  <TableHead>{t("remote_stock")}</TableHead>
                  {onPick ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.id}-${r.variant_id ?? ""}`}>
                    <TableCell className="max-w-[18rem] truncate">{r.title}</TableCell>
                    <TableCell dir="ltr" className="text-xs">
                      {r.id}
                      {r.variant_id && r.variant_id !== r.id ? <div className="text-muted-foreground">{r.variant_id}</div> : null}
                    </TableCell>
                    <TableCell>{fmtNum(r.price, locale)}</TableCell>
                    <TableCell>{fmtNum(r.stock, locale)}</TableCell>
                    {onPick ? (
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => onPick(r)}>
                          {t("pick")}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : search.isSuccess ? (
          <p className="text-muted-foreground text-sm">{t("no_results")}</p>
        ) : null}
        {search.isSuccess ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || search.isPending} onClick={() => { setPage(page - 1); search.mutate(page - 1) }}>
              {t("prev")}
            </Button>
            <Button size="sm" variant="outline" disabled={rows.length === 0 || search.isPending} onClick={() => { setPage(page + 1); search.mutate(page + 1) }}>
              {t("next")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Jobs / logs / orders ────────────────────────────────────────────────

export function JobsTable({ platform }: { platform: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const q = useQuery({
    queryKey: ["marketplace-jobs", platform, page, status],
    queryFn: () => api<Paginated<MarketplaceJobRow>>(`/api/v1/marketplace/${platform}/jobs?page=${page}&status=${status}`),
    refetchInterval: 10_000,
  })
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "retry" | "cancel" }) => api(`/api/v1/marketplace/jobs/${id}/${action}`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["marketplace-jobs", platform] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const rows = q.data?.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("jobs")}</CardTitle>
        <CardDescription>{t("jobs_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select className={cn(selectClass, "max-w-[12rem]")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t("all")}</option>
          {["pending", "running", "retrying", "done", "failed", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {t(`job_status.${s}`)}
            </option>
          ))}
        </select>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{q.isLoading ? t("loading") : t("no_jobs")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("job_type")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("attempts")}</TableHead>
                  <TableHead>{t("created_at")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{j.id}</TableCell>
                    <TableCell>
                      {t.has(`job_types.${j.job_type}`) ? t(`job_types.${j.job_type}`) : j.job_type}
                      {j.last_error ? <div className="text-destructive max-w-[20rem] truncate text-xs" title={j.last_error}>{j.last_error}</div> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell>{j.attempts}</TableCell>
                    <TableCell className="text-xs">{fmtDate(j.created_at, locale)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {["failed", "cancelled"].includes(j.status) ? (
                        <Button size="sm" variant="outline" onClick={() => act.mutate({ id: j.id, action: "retry" })}>
                          {t("retry")}
                        </Button>
                      ) : null}
                      {["pending", "retrying"].includes(j.status) ? (
                        <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: j.id, action: "cancel" })}>
                          {t("cancel")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager meta={q.data?.meta} page={page} setPage={setPage} />
      </CardContent>
    </Card>
  )
}

export function LogsTable({ platform }: { platform: string }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState("")
  const q = useQuery({
    queryKey: ["marketplace-logs", platform, page, level],
    queryFn: () => api<Paginated<MarketplaceLogRow>>(`/api/v1/marketplace/${platform}/logs?page=${page}&level=${level}`),
  })
  const clear = useMutation({
    mutationFn: () => api(`/api/v1/marketplace/${platform}/logs`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-logs", platform] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const rows = q.data?.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("logs")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select className={cn(selectClass, "max-w-[12rem]")} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
            <option value="">{t("all")}</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
          <Button
            variant="outline"
            disabled={clear.isPending || rows.length === 0}
            onClick={() => {
              confirm({ intent: "action", description: t("confirm_clear_logs"), onConfirm: () => clear.mutateAsync() })
            }}
          >
            {t("clear_logs")}
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{q.isLoading ? t("loading") : t("no_logs")}</p>
        ) : (
          <div className="space-y-1">
            {rows.map((l) => (
              <details key={l.id} className="rounded-md border px-3 py-2 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <Badge variant={l.level === "error" ? "destructive" : l.level === "warning" ? "outline" : "secondary"}>{l.level}</Badge>
                  <span className="text-muted-foreground text-xs">{l.channel}</span>
                  <span className="min-w-0 flex-1 truncate">{l.message}</span>
                  <span className="text-muted-foreground text-xs">{fmtDate(l.created_at, locale)}</span>
                </summary>
                {l.meta && typeof l.meta === "object" ? (
                  <div className="mt-2 space-y-2 text-xs">
                    <dl className="grid gap-1 sm:grid-cols-2">
                      {formatLogMetaEntries(l.meta as Record<string, unknown>, locale).map((row) => (
                        <div key={row.key} className="flex gap-2">
                          <dt className="text-muted-foreground shrink-0 font-medium">{row.key}</dt>
                          <dd className="min-w-0 break-all">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <details>
                      <summary className="text-muted-foreground cursor-pointer">{t("raw_json")}</summary>
                      <pre dir="ltr" className="bg-muted mt-1 max-h-48 overflow-auto rounded p-2 text-xs">
                        {JSON.stringify(l.meta, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        )}
        <Pager meta={q.data?.meta} page={page} setPage={setPage} />
      </CardContent>
      {confirmDialog}
    </Card>
  )
}

export function OrdersTable({ platform }: { platform: string }) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ["marketplace-orders", platform, page],
    queryFn: () => api<Paginated<MarketplaceOrderRow>>(`/api/v1/marketplace/${platform}/orders?page=${page}`),
  })
  const rows = q.data?.data ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("orders")}</CardTitle>
        <CardDescription>{t("orders_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{q.isLoading ? t("loading") : t("no_orders")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("remote_order")}</TableHead>
                  <TableHead>{t("local_order")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("total")}</TableHead>
                  <TableHead>{t("last_sync")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell dir="ltr" className="text-xs">{o.remote_order_id}</TableCell>
                    <TableCell>
                      {o.order ? (
                        <Link href={`/dashboard/orders/${o.order.id}`} className="text-primary hover:underline">
                          {o.order.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {o.order?.customer_name ? <div className="text-muted-foreground text-xs">{o.order.customer_name}</div> : null}
                    </TableCell>
                    <TableCell>
                      {o.order ? (t.has(`order_status.${o.order.status}`) ? t(`order_status.${o.order.status}`) : o.order.status) : o.status}
                      {o.status && o.order ? <div className="text-muted-foreground text-xs">{enumLabel("order_status", o.status)}</div> : null}
                    </TableCell>
                    <TableCell>{o.order ? <MoneyDisplay amount={o.order.total_minor} /> : "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(o.last_sync_at, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager meta={q.data?.meta} page={page} setPage={setPage} />
      </CardContent>
    </Card>
  )
}

"use client"

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
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { marketplaceLabel } from "@/lib/marketplace"
import {
  ConnectionCard,
  JobsTable,
  LogsTable,
  MapsTable,
  OrdersTable,
  PlatformTabsNav,
  RemoteSearchCard,
  SyncActionsCard,
  fmtDate,
  selectClass,
  type PlatformTab,
} from "@/views/settings/panels/marketplace/MarketplaceShared"

type AuthStatus = {
  connected: boolean
  access_expires_at: string | null
  refresh_expires_at: string | null
  has_refresh: boolean
}

type MatrixRow = { key: string; job: string; context: string; label_fa: string; label_en: string; official: string | null }

type Overview = {
  auth: AuthStatus
  public_key: string
  has_private_key: boolean
  has_encrypted_code: boolean
  webhook_url: string
  webhook_events: Record<string, boolean>
  webhook_matrix: MatrixRow[]
  webhook_subscribed_at: string | null
  has_webhook_secret: boolean
}

type Health = {
  status: "healthy" | "warning" | "critical"
  auth_ok: boolean
  queue_pending: number
  queue_running: number
  errors_24h: number
  checked_at: string
  last_reconcile: Record<string, unknown> | null
  alerts: { level: string; code: string }[]
}

const OVERVIEW_KEY = ["digikala-overview"]

function useOverview() {
  return useQuery({ queryKey: OVERVIEW_KEY, queryFn: () => api<Overview>("/api/v1/marketplace/digikala/overview") })
}

export function digikalaTabs(t: (k: string) => string): PlatformTab[] {
  return [
    { key: "connection", label: t("tabs.connection") },
    { key: "products", label: t("tabs.products") },
    { key: "orders", label: t("tabs.orders") },
    { key: "jobs", label: t("tabs.jobs") },
    { key: "settings", label: t("tabs.settings") },
    { key: "logs", label: t("tabs.logs") },
  ]
}

export function DigikalaPanel({ tab }: { tab?: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const tabs = digikalaTabs(t)
  const active = tabs.some((x) => x.key === tab) ? (tab as string) : "connection"

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{marketplaceLabel("digikala", locale)}</h2>
        <p className="text-muted-foreground text-sm">{t("descriptions.digikala")}</p>
      </div>
      <PlatformTabsNav platform="digikala" tabs={tabs} active={active} />
      {active === "connection" ? (
        <div className="space-y-4">
          <DigikalaAuthCard />
          <ConnectionCard platform="digikala" />
          <SyncActionsCard platform="digikala" supportsOrders />
        </div>
      ) : null}
      {active === "products" ? (
        <div className="space-y-4">
          <DigikalaProductTools />
          <MapsTable platform="digikala" />
          <RemoteSearchCard platform="digikala" />
        </div>
      ) : null}
      {active === "orders" ? <OrdersTable platform="digikala" /> : null}
      {active === "jobs" ? <JobsTable platform="digikala" /> : null}
      {active === "settings" ? (
        <div className="space-y-4">
          <DigikalaHealthCard />
          <DigikalaWebhookCard />
          <DigikalaReconcileCard />
        </div>
      ) : null}
      {active === "logs" ? <LogsTable platform="digikala" /> : null}
    </div>
  )
}

function DigikalaAuthCard() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("marketplace_admin.digikala")
  const locale = useLocale()
  const qc = useQueryClient()
  const q = useOverview()
  const [code, setCode] = useState("")

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: OVERVIEW_KEY })
    void qc.invalidateQueries({ queryKey: ["marketplace-settings", "digikala"] })
    void qc.invalidateQueries({ queryKey: ["marketplace-hub"] })
  }
  const onError = (e: Error) => toast.error(getApiErrorMessage(e))

  const generate = useMutation({
    mutationFn: () => api<{ public_key: string }>("/api/v1/marketplace/digikala/keys/generate", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("keys_generated"))
      refresh()
    },
    onError,
  })
  const issue = useMutation({
    mutationFn: () => api("/api/v1/marketplace/digikala/token/issue", { method: "POST", json: { encrypted_code: code || null } }),
    onSuccess: () => {
      toast.success(t("token_issued"))
      setCode("")
      refresh()
    },
    onError,
  })
  const refreshToken = useMutation({
    mutationFn: () => api("/api/v1/marketplace/digikala/token/refresh", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("token_refreshed"))
      refresh()
    },
    onError,
  })
  const disconnect = useMutation({
    mutationFn: () => api("/api/v1/marketplace/digikala/disconnect", { method: "POST" }),
    onSuccess: refresh,
    onError,
  })

  if (q.isLoading) return null
  if (q.error) return <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p>
  const o = q.data
  if (!o) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("auth_title")}</CardTitle>
        <CardDescription>{t("auth_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={o.auth.connected ? "secondary" : "outline"}>{o.auth.connected ? t("connected") : t("not_connected")}</Badge>
          {o.auth.access_expires_at ? (
            <Badge variant="outline">
              {t("access_expires")}: {fmtDate(o.auth.access_expires_at, locale)}
            </Badge>
          ) : null}
          {o.auth.refresh_expires_at ? (
            <Badge variant="outline">
              {t("refresh_expires")}: {fmtDate(o.auth.refresh_expires_at, locale)}
            </Badge>
          ) : null}
          <Badge variant={o.has_private_key ? "secondary" : "outline"}>{o.has_private_key ? t("private_key_stored") : t("no_private_key")}</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={generate.isPending}
              onClick={() => {
                if (!o.has_private_key) generate.mutate()
                else confirm({ intent: "action", description: t("confirm_regenerate"), onConfirm: () => generate.mutateAsync() })
              }}
            >
              {generate.isPending ? t("generating") : t("generate_keys")}
            </Button>
            {o.public_key ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(o.public_key)
                  toast.success(t("copied"))
                }}
              >
                {t("copy_public_key")}
              </Button>
            ) : null}
          </div>
          {o.public_key ? (
            <div className="grid gap-1">
              <Label className="text-xs">{t("public_key")}</Label>
              <Textarea readOnly rows={6} dir="ltr" className="font-mono text-xs" value={o.public_key} />
            </div>
          ) : null}
        </div>

        <div className="grid max-w-2xl gap-2">
          <Label>{t("encrypted_code")}</Label>
          <Textarea rows={4} dir="ltr" className="font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} placeholder={o.has_encrypted_code ? t("encrypted_code_saved") : ""} />
          <p className="text-muted-foreground text-xs">{t("encrypted_code_hint")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={issue.isPending || !o.has_private_key || (!code && !o.has_encrypted_code)} onClick={() => issue.mutate()}>
            {t("issue_token")}
          </Button>
          <Button variant="outline" disabled={refreshToken.isPending || !o.auth.has_refresh} onClick={() => refreshToken.mutate()}>
            {t("refresh_token")}
          </Button>
          <Button
            variant="ghost"
            disabled={disconnect.isPending || !o.auth.connected}
            onClick={() => {
              confirm({ intent: "action", description: t("confirm_disconnect"), onConfirm: () => disconnect.mutateAsync() })
            }}
          >
            {t("disconnect")}
          </Button>
        </div>
      </CardContent>
      {confirmDialog}
    </Card>
  )
}

function DigikalaProductTools() {
  const t = useTranslations("marketplace_admin.digikala")
  const tRoot = useTranslations("marketplace_admin")
  const qc = useQueryClient()
  const [keyword, setKeyword] = useState("")
  const run = useMutation({
    mutationFn: (v: { action: "import" | "auto-link"; keyword?: string }) =>
      api(`/api/v1/marketplace/digikala/jobs/${v.action}`, { method: "POST", json: { keyword: v.keyword ?? null } }),
    onSuccess: () => {
      toast.success(tRoot("job_queued"))
      void qc.invalidateQueries({ queryKey: ["marketplace-jobs", "digikala"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("product_tools")}</CardTitle>
        <CardDescription>{t("product_tools_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-56 flex-1 gap-1">
            <Label className="text-xs">{t("import_keyword")}</Label>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate({ action: "import", keyword })}>
            {t("import_products")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("import_hint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate({ action: "auto-link" })}>
            {t("auto_link")}
          </Button>
          <span className="text-muted-foreground text-xs">{t("auto_link_hint")}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function DigikalaHealthCard() {
  const t = useTranslations("marketplace_admin.digikala")
  const locale = useLocale()
  const q = useQuery({
    queryKey: ["digikala-health"],
    queryFn: () => api<Health>("/api/v1/marketplace/digikala/health"),
    refetchInterval: 60_000,
  })
  const h = q.data
  const variant = h?.status === "critical" ? "destructive" : h?.status === "warning" ? "outline" : "secondary"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("health")}</CardTitle>
        <CardDescription>{h ? `${t("checked_at")}: ${fmtDate(h.checked_at, locale)}` : null}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.error ? <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p> : null}
        {h ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={variant}>{t(`health_status.${h.status}`)}</Badge>
              <Badge variant="outline">
                {t("queue_pending")}: {h.queue_pending}
              </Badge>
              <Badge variant="outline">
                {t("queue_running")}: {h.queue_running}
              </Badge>
              <Badge variant="outline">
                {t("errors_24h")}: {h.errors_24h}
              </Badge>
            </div>
            {h.alerts.length ? (
              <ul className="space-y-1 text-sm">
                {h.alerts.map((a) => (
                  <li key={a.code} className={a.level === "critical" ? "text-destructive" : "text-amber-600"}>
                    {t(`alerts.${a.code}`)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">{t("no_alerts")}</p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DigikalaWebhookCard() {
  const t = useTranslations("marketplace_admin.digikala")
  const locale = useLocale()
  const qc = useQueryClient()
  const q = useOverview()
  const [events, setEvents] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (q.data) setEvents({ ...q.data.webhook_events })
  }, [q.data])

  const save = useMutation({
    mutationFn: (subscribe: boolean) => api("/api/v1/marketplace/digikala/webhook-events", { method: "PUT", json: { events, subscribe } }),
    onSuccess: (_, subscribe) => {
      toast.success(subscribe ? t("webhook_subscribed") : t("events_saved"))
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const o = q.data
  if (!o) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("webhooks")}</CardTitle>
        <CardDescription>{t("webhooks_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">{t("webhook_url")}</span>
          <code dir="ltr" className="min-w-0 flex-1 truncate text-xs">
            {o.webhook_url}
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(o.webhook_url)
              toast.success(t("copied"))
            }}
          >
            {t("copy")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={o.has_webhook_secret ? "secondary" : "outline"}>{o.has_webhook_secret ? t("secret_set") : t("secret_missing")}</Badge>
          {o.webhook_subscribed_at ? (
            <Badge variant="outline">
              {t("subscribed_at")}: {fmtDate(o.webhook_subscribed_at, locale)}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {o.webhook_matrix.map((row) => (
            <label key={row.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span>
                {locale === "en" ? row.label_en : row.label_fa}
                <span className="text-muted-foreground block text-xs">{t(`event_jobs.${row.job}`)}</span>
              </span>
              <Switch checked={Boolean(events[row.key])} onCheckedChange={(v) => setEvents((e) => ({ ...e, [row.key]: v }))} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate(false)}>
            {t("save_events")}
          </Button>
          <Button variant="outline" disabled={save.isPending || !o.auth.connected} onClick={() => save.mutate(true)}>
            {t("save_and_subscribe")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DigikalaReconcileCard() {
  const t = useTranslations("marketplace_admin.digikala")
  const tRoot = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const health = useQuery({ queryKey: ["digikala-health"], queryFn: () => api<Health>("/api/v1/marketplace/digikala/health") })
  const [type, setType] = useState("all")
  const run = useMutation({
    mutationFn: () => api("/api/v1/marketplace/digikala/jobs/reconcile", { method: "POST", json: { type } }),
    onSuccess: () => {
      toast.success(tRoot("job_queued"))
      void qc.invalidateQueries({ queryKey: ["digikala-health"] })
      void qc.invalidateQueries({ queryKey: ["marketplace-jobs", "digikala"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const last = health.data?.last_reconcile as
    | { at?: string; products?: { maps: number; drift: number; missing_variant: number }; orders?: { maps: number; drift: number }; inventory?: { checked: number; drift: number } }
    | null
    | undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("reconcile")}</CardTitle>
        <CardDescription>{t("reconcile_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <select className={`${selectClass} max-w-48`} value={type} onChange={(e) => setType(e.target.value)}>
            {["all", "products", "orders", "inventory"].map((k) => (
              <option key={k} value={k}>
                {t(`reconcile_types.${k}`)}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
            {t("run_reconcile")}
          </Button>
        </div>
        {last ? (
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              {t("last_reconcile")}: {fmtDate(last.at ?? null, locale)}
            </p>
            {last.products ? <p>{t("reconcile_products", { maps: last.products.maps, drift: last.products.drift, missing: last.products.missing_variant })}</p> : null}
            {last.orders ? <p>{t("reconcile_orders", { maps: last.orders.maps, drift: last.orders.drift })}</p> : null}
            {last.inventory ? <p>{t("reconcile_inventory", { checked: last.inventory.checked, drift: last.inventory.drift })}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

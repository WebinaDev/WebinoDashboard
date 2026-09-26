"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { marketplaceLabel } from "@/lib/marketplace"
import { BasalamCategoriesTab, BasalamProductsTab } from "@/views/settings/panels/marketplace/BasalamProductsTab"
import { ConnectionCard, JobsTable, LogsTable, PlatformTabsNav, fmtDate, fmtNum, selectClass, type PlatformTab } from "@/views/settings/panels/marketplace/MarketplaceShared"

export type BasalamAuthStatus = {
  connected: boolean
  has_token: boolean
  has_refresh: boolean
  vendor_id: number | null
  is_vendor: boolean
  expires_at: string | null
  connected_at: string | null
  auth_error: string | null
  auth_error_at: string | null
  oauth_available: boolean
}

type BasalamStatus = {
  connected: boolean
  auth: BasalamAuthStatus
  vendor_id: number | null
  vendor_title: string | null
  jobs_pending: number
  webhook_url: string
  webhook_id: number | null
  webhook_registered_at: string | null
  chat_alert: { title: string; body: string; at: string } | null
  duplicate_report: { product_id: number; conflicts: unknown }[]
}

type Health = {
  status: "healthy" | "warning" | "critical"
  circuit: { state: string; failures?: number; opened_at?: number | null }
  requests: { total?: number; success?: number; failed?: number; by_category?: Record<string, number> }
  queue_pending: number
  queue_running: number
  jobs_failed_24h: number
  errors_24h: number
  duplicates: number
  discounts: { pending?: number; processing?: number; failed?: number }
  orders_pulled_at: string | null
  alerts: { level: string; code: string }[]
}

export const BASALAM_STATUS_KEY = ["basalam-status"]

export function useBasalamStatus() {
  return useQuery({ queryKey: BASALAM_STATUS_KEY, queryFn: () => api<BasalamStatus>("/api/v1/marketplace/basalam/status") })
}

export function asList(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    for (const k of ["data", "items", "result", "profiles", "discounts"]) {
      if (Array.isArray(o[k])) return asList(o[k])
    }
  }
  return []
}

export function itemTitle(o: Record<string, unknown>): string {
  return String(o.title ?? o.name ?? o.carrier_title ?? (o.carrier as Record<string, unknown> | undefined)?.title ?? o.id ?? "—")
}

function basalamTabs(t: (k: string) => string): PlatformTab[] {
  return [
    { key: "connection", label: t("tabs.connection") },
    { key: "booth", label: t("basalam.tabs.booth") },
    { key: "products", label: t("tabs.products") },
    { key: "categories", label: t("basalam.tabs.categories") },
    { key: "orders", label: t("tabs.orders") },
    { key: "settings", label: t("tabs.settings") },
    { key: "finance", label: t("basalam.tabs.finance") },
    { key: "jobs", label: t("tabs.jobs") },
    { key: "logs", label: t("tabs.logs") },
  ]
}

const onError = (e: Error) => toast.error(getApiErrorMessage(e))

export function BasalamPanel({ tab }: { tab?: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const tabs = basalamTabs(t)
  const active = tabs.some((x) => x.key === tab) ? (tab as string) : "connection"

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get("oauth")
    if (!oauth) return
    if (oauth === "success") toast.success(t("basalam.oauth_success"))
    else toast.error(params.get("reason") || t("basalam.oauth_error"))
    params.delete("oauth")
    params.delete("reason")
    const qs = params.toString()
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""))
  }, [t])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{marketplaceLabel("basalam", locale)}</h2>
        <p className="text-muted-foreground text-sm">{t("descriptions.basalam")}</p>
      </div>
      <PlatformTabsNav platform="basalam" tabs={tabs} active={active} />
      <BasalamAlerts />
      {active === "connection" ? (
        <div className="space-y-4">
          <BasalamAuthCard />
          <ConnectionCard platform="basalam" fields={[]} />
          <BasalamQuickActions />
          <BasalamHealthCard />
        </div>
      ) : null}
      {active === "booth" ? <BasalamBoothTab /> : null}
      {active === "products" ? <BasalamProductsTab /> : null}
      {active === "categories" ? <BasalamCategoriesTab /> : null}
      {active === "orders" ? <BasalamOrdersTab /> : null}
      {active === "settings" ? (
        <div className="space-y-4">
          <BasalamCommissionCard />
          <BasalamSettingsCard />
          <BasalamGatewayCard />
        </div>
      ) : null}
      {active === "finance" ? <BasalamFinanceTab /> : null}
      {active === "jobs" ? (
        <div className="space-y-4">
          <BasalamJobsTools />
          <JobsTable platform="basalam" />
        </div>
      ) : null}
      {active === "logs" ? <LogsTable platform="basalam" /> : null}
    </div>
  )
}

function BasalamAlerts() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useBasalamStatus()
  const dismiss = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/chat/alert/dismiss", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BASALAM_STATUS_KEY }),
  })
  const s = q.data
  if (!s) return null
  return (
    <>
      {s.auth.auth_error ? (
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
          {t("auth_error", { error: s.auth.auth_error })}
        </div>
      ) : null}
      {s.duplicate_report?.length ? (
        <div className="rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("duplicates_alert", { count: s.duplicate_report.length })}
        </div>
      ) : null}
      {s.chat_alert ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            <strong>{s.chat_alert.title}</strong> — {s.chat_alert.body}
          </span>
          <Button size="sm" variant="ghost" onClick={() => dismiss.mutate()}>
            {t("dismiss")}
          </Button>
        </div>
      ) : null}
    </>
  )
}

// ── Connection ──────────────────────────────────────────────────────────

function BasalamAuthCard() {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const q = useBasalamStatus()
  const [callbackUrl, setCallbackUrl] = useState("")
  const [manual, setManual] = useState({ access_token: "", refresh_token: "", vendor_id: "" })
  const [showManual, setShowManual] = useState(false)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: BASALAM_STATUS_KEY })
    void qc.invalidateQueries({ queryKey: ["marketplace-hub"] })
    void qc.invalidateQueries({ queryKey: ["basalam-vendor"] })
  }

  const start = useMutation({
    mutationFn: () =>
      api<{ url: string }>("/api/v1/marketplace/basalam/oauth/start", {
        method: "POST",
        json: { return_url: typeof window !== "undefined" ? window.location.href : "" },
      }),
    onSuccess: (res) => {
      if (res.url) window.location.assign(res.url)
    },
    onError,
  })
  const complete = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/oauth/complete", { method: "POST", json: { callback_url: callbackUrl } }),
    onSuccess: () => {
      toast.success(t("connected"))
      setCallbackUrl("")
      refresh()
    },
    onError,
  })
  const saveManual = useMutation({
    mutationFn: () =>
      api("/api/v1/marketplace/basalam/oauth/manual", {
        method: "POST",
        json: {
          access_token: manual.access_token,
          refresh_token: manual.refresh_token || null,
          vendor_id: manual.vendor_id ? Number(manual.vendor_id) : null,
        },
      }),
    onSuccess: () => {
      toast.success(t("connected"))
      setManual({ access_token: "", refresh_token: "", vendor_id: "" })
      refresh()
    },
    onError,
  })
  const refreshToken = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/oauth/refresh", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("token_refreshed"))
      refresh()
    },
    onError,
  })
  const disconnect = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/oauth/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("disconnected"))
      refresh()
    },
    onError,
  })

  if (q.isLoading) return <p className="text-muted-foreground text-sm">…</p>
  if (q.error) return <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p>
  const s = q.data
  const auth = s?.auth

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("auth_title")}</CardTitle>
        <CardDescription>{t("auth_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={auth?.connected ? "secondary" : "outline"}>{auth?.connected ? t("connected") : t("not_connected")}</Badge>
          {s?.vendor_title ? <span className="font-medium">{s.vendor_title}</span> : null}
          {auth?.vendor_id ? <span className="text-muted-foreground">{t("booth_id", { id: String(auth.vendor_id) })}</span> : null}
          {auth?.expires_at ? <span className="text-muted-foreground text-xs">{t("expires_at", { at: fmtDate(auth.expires_at, locale) })}</span> : null}
          {auth && !auth.is_vendor ? <Badge variant="destructive">{t("not_vendor")}</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={start.isPending || !auth?.oauth_available} onClick={() => start.mutate()}>
            {auth?.connected ? t("reconnect") : t("connect")}
          </Button>
          {auth?.has_refresh ? (
            <Button variant="outline" disabled={refreshToken.isPending} onClick={() => refreshToken.mutate()}>
              {t("refresh_token")}
            </Button>
          ) : null}
          {auth?.has_token ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={disconnect.isPending}
              onClick={() => {
                if (window.confirm(t("confirm_disconnect"))) disconnect.mutate()
              }}
            >
              {t("disconnect")}
            </Button>
          ) : null}
        </div>
        {!auth?.oauth_available ? <p className="text-muted-foreground text-xs">{t("oauth_unavailable")}</p> : null}
        <div className="grid max-w-2xl gap-2">
          <Label>{t("callback_url")}</Label>
          <div className="flex gap-2">
            <Input dir="ltr" value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://…?access_token=…" />
            <Button variant="outline" disabled={!callbackUrl.trim() || complete.isPending} onClick={() => complete.mutate()}>
              {t("complete")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("callback_hint")}</p>
        </div>
        <button type="button" className="text-primary text-sm hover:underline" onClick={() => setShowManual((v) => !v)}>
          {showManual ? t("hide_manual") : t("show_manual")}
        </button>
        {showManual ? (
          <div className="grid max-w-2xl gap-3 rounded-md border p-3">
            <div className="grid gap-1">
              <Label>{t("access_token")}</Label>
              <Textarea rows={3} dir="ltr" value={manual.access_token} onChange={(e) => setManual((m) => ({ ...m, access_token: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label>{t("refresh_token_field")}</Label>
              <Input dir="ltr" value={manual.refresh_token} onChange={(e) => setManual((m) => ({ ...m, refresh_token: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label>{t("vendor_id")}</Label>
              <Input dir="ltr" type="number" value={manual.vendor_id} onChange={(e) => setManual((m) => ({ ...m, vendor_id: e.target.value }))} />
            </div>
            <Button className="w-fit" disabled={!manual.access_token.trim() || saveManual.isPending} onClick={() => saveManual.mutate()}>
              {t("save_manual")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BasalamQuickActions() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useBasalamStatus()
  const [days, setDays] = useState("7")
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["marketplace-jobs", "basalam"] })
    void qc.invalidateQueries({ queryKey: BASALAM_STATUS_KEY })
  }
  const syncNow = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/sync/products/sync-now", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("queued"))
      invalidate()
    },
    onError,
  })
  const pull = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/sync/orders/pull", { method: "POST", json: { days: Number(days) || 7 } }),
    onSuccess: () => {
      toast.success(t("queued"))
      invalidate()
    },
    onError,
  })
  const webhook = useMutation({
    mutationFn: () => api<{ ok: boolean; action: string }>("/api/v1/marketplace/basalam/webhook/setup", { method: "POST" }),
    onSuccess: (r) => {
      if (r.ok) toast.success(t("webhook_ok"))
      else toast.error(t("webhook_local"))
      invalidate()
    },
    onError,
  })
  const connected = Boolean(q.data?.connected)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("quick_title")}</CardTitle>
        <CardDescription>{t("quick_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" disabled={!connected || syncNow.isPending} onClick={() => syncNow.mutate()}>
            {t("sync_now")}
          </Button>
          <div className="flex items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">{t("pull_days")}</Label>
              <Input className="w-24" type="number" min={1} max={365} dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button variant="outline" disabled={!connected || pull.isPending} onClick={() => pull.mutate()}>
              {t("pull_orders")}
            </Button>
          </div>
          <Button variant="outline" disabled={!connected || webhook.isPending} onClick={() => webhook.mutate()}>
            {q.data?.webhook_id ? t("webhook_reset") : t("webhook_enable")}
          </Button>
        </div>
        <div className="text-muted-foreground space-y-1 text-xs">
          <div>
            {t("webhook_url")}: <code dir="ltr">{q.data?.webhook_url}</code>
          </div>
          <div>{q.data?.webhook_id ? t("webhook_on", { id: String(q.data.webhook_id) }) : t("webhook_off")}</div>
          <div>{t("jobs_pending", { count: q.data?.jobs_pending ?? 0 })}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function BasalamHealthCard() {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["basalam-health"], queryFn: () => api<Health>("/api/v1/marketplace/basalam/health"), refetchInterval: 60_000 })
  const reset = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/circuit/reset", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["basalam-health"] }),
    onError,
  })
  const h = q.data
  if (!h) return null
  const variant = h.status === "critical" ? "destructive" : h.status === "warning" ? "outline" : "secondary"
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">{t("health_title")}</CardTitle>
          <CardDescription>{t("health_hint")}</CardDescription>
        </div>
        <Badge variant={variant}>{t(`health.${h.status}`)}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label={t("circuit")} value={t(`circuit_state.${h.circuit.state}`)} />
          <Stat label={t("requests_24h")} value={`${fmtNum(h.requests.success ?? 0, locale)} / ${fmtNum(h.requests.total ?? 0, locale)}`} />
          <Stat label={t("errors_24h")} value={fmtNum(h.errors_24h, locale)} />
          <Stat label={t("queue")} value={`${fmtNum(h.queue_pending, locale)} + ${fmtNum(h.queue_running, locale)}`} />
          <Stat label={t("jobs_failed_24h")} value={fmtNum(h.jobs_failed_24h, locale)} />
          <Stat label={t("duplicates")} value={fmtNum(h.duplicates, locale)} />
          <Stat label={t("discount_tasks")} value={`${fmtNum(h.discounts.pending ?? 0, locale)} / ${fmtNum(h.discounts.failed ?? 0, locale)}`} />
          <Stat label={t("orders_pulled_at")} value={fmtDate(h.orders_pulled_at, locale)} />
        </div>
        {h.alerts.length ? (
          <ul className="space-y-1">
            {h.alerts.map((a) => (
              <li key={a.code} className={a.level === "critical" ? "text-destructive" : "text-amber-700 dark:text-amber-300"}>
                {t(`alerts.${a.code}`)}
              </li>
            ))}
          </ul>
        ) : null}
        {h.circuit.state !== "closed" ? (
          <Button size="sm" variant="outline" disabled={reset.isPending} onClick={() => reset.mutate()}>
            {t("reset_circuit")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

// ── Booth ───────────────────────────────────────────────────────────────

type ChatToken = { enabled: boolean; token: string | null; script_url: string }

function BasalamBoothTab() {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const status = useBasalamStatus()
  const connected = Boolean(status.data?.connected)
  const vendorQ = useQuery({
    queryKey: ["basalam-vendor"],
    queryFn: () => api<{ vendor: Record<string, unknown> | null }>("/api/v1/marketplace/basalam/vendor"),
    enabled: connected,
  })
  const settingsQ = useQuery({
    queryKey: ["basalam-settings"],
    queryFn: () => api<{ settings: Record<string, unknown> }>("/api/v1/marketplace/basalam/settings"),
  })
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  useEffect(() => {
    const v = vendorQ.data?.vendor
    if (v) {
      setTitle(String(v.title ?? ""))
      setSummary(String(v.summary ?? ""))
    }
  }, [vendorQ.data])

  const saveVendor = useMutation({
    mutationFn: () => api("/api/v1/marketplace/basalam/vendor", { method: "POST", json: { title, summary } }),
    onSuccess: () => {
      toast.success(t("booth_saved"))
      void qc.invalidateQueries({ queryKey: ["basalam-vendor"] })
      void qc.invalidateQueries({ queryKey: BASALAM_STATUS_KEY })
    },
    onError,
  })
  const notify = Boolean(settingsQ.data?.settings?.chat_notify_admins ?? true)
  const saveNotify = useMutation({
    mutationFn: (v: boolean) => api("/api/v1/marketplace/basalam/settings", { method: "POST", json: { settings: { chat_notify_admins: v } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["basalam-settings"] }),
    onError,
  })

  const chatQ = useQuery({
    queryKey: ["basalam-chat"],
    queryFn: () => api<ChatToken>("/api/v1/marketplace/basalam/chat/token"),
    enabled: chatOpen && connected,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    const token = chatQ.data?.token
    const src = chatQ.data?.script_url
    if (!chatOpen || !token || !src) return
    const id = "basalam-chat-widget-script"
    document.getElementById(id)?.remove()
    const el = document.createElement("script")
    el.id = id
    el.src = src
    el.async = true
    el.setAttribute("token", token)
    document.body.appendChild(el)
    void api("/api/v1/marketplace/basalam/chat/notify", { method: "POST", json: { event: "widget_opened" } }).catch(() => undefined)
    return () => {
      el.remove()
      document.querySelectorAll("[id^='dalan-widget'],[class*='dalan-widget']").forEach((n) => n.remove())
    }
  }, [chatOpen, chatQ.data])

  const vendor = vendorQ.data?.vendor
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">{t("booth_identity")}</p>
            <h3 className="text-xl font-semibold">{String(vendor?.title ?? status.data?.vendor_title ?? "—")}</h3>
            <p className="text-sm">
              {connected ? <span className="text-emerald-700 dark:text-emerald-400">{t("connected")}</span> : t("not_connected")}
              {status.data?.vendor_id ? <span className="text-muted-foreground"> · {t("booth_id", { id: String(status.data.vendor_id) })}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={chatOpen ? "default" : "secondary"} disabled={!connected} onClick={() => setChatOpen((v) => !v)}>
              {chatOpen ? t("chat_hide") : t("chat_open")}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={notify} disabled={!connected || saveNotify.isPending} onCheckedChange={(v) => saveNotify.mutate(v)} />
              {t("chat_notify")}
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("booth_profile")}</CardTitle>
            <CardDescription>{t("booth_profile_hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1">
              <Label>{t("booth_title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>{t("booth_summary")}</Label>
              <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <Button disabled={!connected || saveVendor.isPending} onClick={() => saveVendor.mutate()}>
              {t("save_booth")}
            </Button>
          </CardContent>
        </Card>
        <BasalamWebhooksCard connected={connected} />
      </div>

      <BasalamShippingCard connected={connected} />
      <BasalamDiscountsCard connected={connected} locale={locale} />
    </div>
  )
}

function BasalamWebhooksCard({ connected }: { connected: boolean }) {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["basalam-webhooks"],
    queryFn: () => api<{ webhooks: Record<string, unknown>[]; webhook_id: number | null; webhook_url: string; can_register: boolean }>("/api/v1/marketplace/basalam/webhooks"),
  })
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["basalam-webhooks"] })
    void qc.invalidateQueries({ queryKey: BASALAM_STATUS_KEY })
  }
  const setup = useMutation({ mutationFn: () => api("/api/v1/marketplace/basalam/webhook/setup", { method: "POST" }), onSuccess: () => { toast.success(t("webhook_ok")); invalidate() }, onError })
  const rotate = useMutation({ mutationFn: () => api("/api/v1/marketplace/basalam/webhooks/rotate", { method: "POST" }), onSuccess: () => { toast.success(t("webhook_rotated")); invalidate() }, onError })
  const remove = useMutation({
    mutationFn: (id: number) => api("/api/v1/marketplace/basalam/webhooks/delete", { method: "POST", json: { webhook_id: id } }),
    onSuccess: invalidate,
    onError,
  })
  const hooks = q.data?.webhooks ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("orders_auto_title")}</CardTitle>
        <CardDescription>{q.data?.webhook_id ? t("orders_auto_on") : t("orders_auto_off")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <code dir="ltr" className="bg-muted block overflow-x-auto rounded p-2 text-xs">
          {q.data?.webhook_url}
        </code>
        {q.data && !q.data.can_register ? <p className="text-muted-foreground text-xs">{t("webhook_local")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!connected || setup.isPending} onClick={() => setup.mutate()}>
            {q.data?.webhook_id ? t("webhook_reset") : t("webhook_enable")}
          </Button>
          <Button variant="outline" disabled={!connected || rotate.isPending} onClick={() => rotate.mutate()}>
            {t("webhook_rotate")}
          </Button>
        </div>
        {hooks.length ? (
          <ul className="space-y-1 text-xs">
            {hooks.map((h) => (
              <li key={String(h.id)} className="flex items-center justify-between gap-2 border-b py-1">
                <span dir="ltr" className="truncate">
                  #{String(h.id)} {String(h.url ?? "")}
                </span>
                <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(Number(h.id))}>
                  {t("delete")}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BasalamShippingCard({ connected }: { connected: boolean }) {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["basalam-shipping"],
    queryFn: () => api<{ ok: boolean; error?: string | null; profiles: unknown; carriers: unknown; vendor_carriers: unknown; strategy: unknown }>("/api/v1/marketplace/basalam/shipping"),
    enabled: connected,
  })
  const [profileTitle, setProfileTitle] = useState("")
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null)
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/v1/marketplace/basalam/shipping", { method: "POST", json: body }),
    onSuccess: () => {
      toast.success(t("shipping_saved"))
      setProfileTitle("")
      setEditing(null)
      void qc.invalidateQueries({ queryKey: ["basalam-shipping"] })
    },
    onError,
  })
  const profiles = useMemo(() => asList(q.data?.profiles), [q.data])
  const carriers = useMemo(() => {
    const vc = asList(q.data?.vendor_carriers)
    return vc.length ? vc : asList(q.data?.carriers)
  }, [q.data])
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("shipping_title")}</CardTitle>
        <CardDescription>{t("shipping_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("shipping_profiles")}</p>
          <div className="flex gap-2">
            <Input value={profileTitle} onChange={(e) => setProfileTitle(e.target.value)} placeholder={t("shipping_profile_title")} />
            <Button disabled={!connected || !profileTitle.trim() || act.isPending} onClick={() => act.mutate({ title: profileTitle.trim() })}>
              {t("create")}
            </Button>
          </div>
          {q.data?.error ? <p className="text-destructive text-xs">{q.data.error}</p> : null}
          <ul className="space-y-1 text-sm">
            {profiles.map((p) => (
              <li key={String(p.id)} className="flex items-center justify-between gap-2 border-b py-1.5">
                {editing?.id === Number(p.id) ? (
                  <Input className="h-8" value={editing.title} onChange={(e) => setEditing({ id: editing.id, title: e.target.value })} />
                ) : (
                  <span>{itemTitle(p)}</span>
                )}
                <span className="flex shrink-0 gap-1">
                  {editing?.id === Number(p.id) ? (
                    <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "update_profile", profile_id: editing.id, title: editing.title })}>
                      {t("save")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: Number(p.id), title: itemTitle(p) })}>
                      {t("edit")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={act.isPending}
                    onClick={() => {
                      if (window.confirm(t("confirm_delete"))) act.mutate({ action: "delete_profile", profile_id: Number(p.id) })
                    }}
                  >
                    {t("delete")}
                  </Button>
                </span>
              </li>
            ))}
            {!profiles.length ? <li className="text-muted-foreground">{t("no_profiles")}</li> : null}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("carriers")}</p>
          <ul className="text-muted-foreground space-y-1 text-sm">
            {carriers.slice(0, 20).map((c, i) => (
              <li key={String(c.id ?? i)}>{itemTitle(c)}</li>
            ))}
            {!carriers.length ? <li>{t("no_carriers")}</li> : null}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function BasalamDiscountsCard({ connected, locale }: { connected: boolean; locale: string }) {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["basalam-discounts"],
    queryFn: () => api<{ discounts: unknown; tasks: { pending?: number; processing?: number; failed?: number } }>("/api/v1/marketplace/basalam/discounts"),
    enabled: connected,
  })
  const productsQ = useQuery({
    queryKey: ["basalam-products-connected-min"],
    queryFn: () => api<{ products: { id: number; name: string; basalam_product_id: string | null }[] }>("/api/v1/marketplace/basalam/products?filter=connected&per_page=100"),
    enabled: connected,
  })
  const [productId, setProductId] = useState("")
  const [percent, setPercent] = useState("10")
  const [days, setDays] = useState("20")
  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/marketplace/basalam/discounts", {
        method: "POST",
        json: {
          product_filter: { product_ids: [Number(productId)], variation_ids: [], status: [3568, 2976] },
          discount_percent: Number(percent) || 0,
          active_days: Number(days) || 20,
        },
      }),
    onSuccess: () => {
      toast.success(t("discount_created"))
      setProductId("")
      void qc.invalidateQueries({ queryKey: ["basalam-discounts"] })
    },
    onError,
  })
  const tasks = useMutation({
    mutationFn: (action: "process" | "clear_failed") => api("/api/v1/marketplace/basalam/discounts/tasks", { method: "POST", json: { action } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["basalam-discounts"] }),
    onError,
  })
  const items = useMemo(() => asList(q.data?.discounts), [q.data])
  const connectedProducts = (productsQ.data?.products ?? []).filter((p) => p.basalam_product_id)
  const st = q.data?.tasks
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("discounts_title")}</CardTitle>
        <CardDescription>{t("discounts_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr_7rem_7rem_auto]">
          <select className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">{t("select_product")}</option>
            {connectedProducts.map((p) => (
              <option key={p.id} value={String(p.basalam_product_id)}>
                {p.name || `#${p.id}`}
              </option>
            ))}
          </select>
          <Input type="number" min={1} max={99} dir="ltr" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="%" />
          <Input type="number" min={1} max={365} dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} placeholder={t("days")} />
          <Button disabled={!connected || !productId || create.isPending} onClick={() => create.mutate()}>
            {t("create_discount")}
          </Button>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
          <span>{t("discount_tasks_status", { pending: fmtNum(st?.pending ?? 0, locale), processing: fmtNum(st?.processing ?? 0, locale), failed: fmtNum(st?.failed ?? 0, locale) })}</span>
          <Button size="sm" variant="outline" disabled={tasks.isPending} onClick={() => tasks.mutate("process")}>
            {t("process_now")}
          </Button>
          {st?.failed ? (
            <Button size="sm" variant="ghost" disabled={tasks.isPending} onClick={() => tasks.mutate("clear_failed")}>
              {t("clear_failed")}
            </Button>
          ) : null}
        </div>
        {items.length ? (
          <ul className="text-muted-foreground space-y-1 text-sm">
            {items.slice(0, 20).map((d, i) => (
              <li key={String(d.id ?? i)}>
                {String(d.title ?? d.product_id ?? d.id ?? "—")}
                {d.discount_percent != null || d.discount != null ? ` — ${String(d.discount_percent ?? d.discount)}%` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Orders ──────────────────────────────────────────────────────────────

type BasalamOrderRow = {
  id: number
  number: string | null
  invoice_id: number
  remote_status: string | null
  status: string | null
  total_minor: number | null
  currency: string | null
  date: string | null
  customer: string | null
  tracking: string
  last_sync_at: string | null
}

function BasalamOrdersTab() {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ["basalam-orders", page],
    queryFn: () => api<{ orders: BasalamOrderRow[]; total: number; per_page: number }>(`/api/v1/marketplace/basalam/orders?page=${page}&per_page=20`),
  })
  const rows = q.data?.orders ?? []
  const last = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.per_page)) : 1
  return (
    <div className="space-y-4">
      <BasalamQuickActions />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders")}</CardTitle>
          <CardDescription>{t("basalam.orders_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{q.isLoading ? t("loading") : t("no_orders")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("basalam.invoice")}</TableHead>
                    <TableHead>{t("local_order")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("total")}</TableHead>
                    <TableHead>{t("basalam.tracking")}</TableHead>
                    <TableHead>{t("last_sync")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell dir="ltr" className="text-xs">{o.invoice_id}</TableCell>
                      <TableCell>
                        <Link href={`/dashboard/orders/${o.id}`} className="text-primary hover:underline">
                          {o.number || `#${o.id}`}
                        </Link>
                        {o.customer ? <div className="text-muted-foreground text-xs">{o.customer}</div> : null}
                      </TableCell>
                      <TableCell>
                        {o.status ? (t.has(`order_status.${o.status}`) ? t(`order_status.${o.status}`) : o.status) : "—"}
                        {o.remote_status ? <div className="text-muted-foreground text-xs">{t.has(`basalam.status_keys.${o.remote_status}`) ? t(`basalam.status_keys.${o.remote_status}`) : o.remote_status}</div> : null}
                      </TableCell>
                      <TableCell>{fmtNum(o.total_minor, locale)}</TableCell>
                      <TableCell dir="ltr" className="text-xs">{o.tracking || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtDate(o.last_sync_at ?? o.date, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {last > 1 ? (
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t("prev")}
              </Button>
              <span className="text-muted-foreground">
                {page} / {last}
              </span>
              <Button size="sm" variant="outline" disabled={page >= last} onClick={() => setPage(page + 1)}>
                {t("next")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────

type SettingsView = { settings: Record<string, unknown>; defaults: Record<string, unknown>; custom_update_fields: string[] }

const ENGINE_TOGGLES = [
  "sync_status_product",
  "sync_status_order",
  "auto_confirm_order",
  "add_full_desc_to_desc_product",
  "add_short_desc_to_desc_product",
  "add_attr_to_desc_product",
  "cap_preparation_to_category_max",
  "product_attribute_suffix_enabled",
  "chat_notify_admins",
]

const ENGINE_NUMBERS = ["default_weight", "default_package_weight", "default_preparation", "default_stock_quantity", "safe_stock", "discount_duration", "discount_reduction_percent"]

const ENGINE_TEXTS = ["product_prefix_title", "product_suffix_title", "product_attribute_suffix_priority", "customer_prefix_name", "customer_suffix_name", "order_shipping_method"]

const ENGINE_SELECTS: Record<string, string[]> = {
  product_price_field: ["original_price", "sale_price", "sale_strikethrough_price"],
  round_price: ["none", "up", "down"],
  all_products_wholesale: ["none", "all"],
  variable_product_stock_source: ["variation", "product"],
  order_statues_type: ["basalam_statuses", "woocommerce_statuses"],
  video_source: ["plugin_box", "inherit"],
  video_inherit_mode: ["auto", "manual"],
}

function BasalamSettingsCard() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["basalam-settings"], queryFn: () => api<SettingsView>("/api/v1/marketplace/basalam/settings") })
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => {
    if (q.data?.settings) setDraft({ ...q.data.settings })
  }, [q.data])
  const save = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      api<{ settings: Record<string, unknown>; warnings: string[] }>("/api/v1/marketplace/basalam/settings", { method: "POST", json: { settings } }),
    onSuccess: (res) => {
      toast.success(t("settings_saved"))
      res.warnings?.forEach((w) => toast.warning(w))
      void qc.invalidateQueries({ queryKey: ["basalam-settings"] })
      void qc.invalidateQueries({ queryKey: ["basalam-commission"] })
    },
    onError,
  })
  const applyAll = useMutation({
    mutationFn: (mode: "full" | "quick") => api("/api/v1/marketplace/basalam/sync/products/update-all", { method: "POST", json: { mode } }),
    onSuccess: () => toast.success(t("queued")),
    onError,
  })
  if (!q.data) return <p className="text-muted-foreground text-sm">…</p>
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }))
  const label = (k: string) => (t.has(`settings.${k}`) ? t(`settings.${k}`) : k)
  const custom = draft.sync_product_fields === "custom"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings_title")}</CardTitle>
        <CardDescription>{t("settings_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h4 className="text-sm font-medium">{t("settings_toggles")}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {ENGINE_TOGGLES.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>{label(k)}</span>
                <Switch checked={Boolean(draft[k])} onCheckedChange={(v) => set(k, v)} />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-medium">{t("selective_sync")}</h4>
          <select className={`${selectClass} max-w-xs`} value={String(draft.sync_product_fields ?? "all")} onChange={(e) => set("sync_product_fields", e.target.value)}>
            {["all", "price_stock", "custom"].map((v) => (
              <option key={v} value={v}>
                {t(`sync_fields_mode.${v}`)}
              </option>
            ))}
          </select>
          {custom ? (
            <div className="flex flex-wrap gap-2">
              {q.data.custom_update_fields.map((k) => (
                <Button key={k} size="sm" type="button" variant={draft[k] ? "default" : "outline"} onClick={() => set(k, !draft[k])}>
                  {t(`sync_field.${k.replace("sync_product_field_", "")}`)}
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-medium">{t("default_values")}</h4>
          <p className="text-muted-foreground text-xs">{t("default_values_hint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ENGINE_NUMBERS.map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{label(k)}</Label>
                <Input type="number" dir="ltr" value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            ))}
            {ENGINE_TEXTS.slice(0, 2).map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{label(k)}</Label>
                <Input value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
            {(["product_price_field", "round_price", "all_products_wholesale"] as const).map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{label(k)}</Label>
                <select className={selectClass} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)}>
                  {ENGINE_SELECTS[k].map((v) => (
                    <option key={v} value={v}>
                      {t.has(`options.${k}.${v}`) ? t(`options.${k}.${v}`) : v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <button type="button" className="text-primary text-sm hover:underline" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? t("hide_advanced") : t("show_advanced")}
        </button>
        {advanced ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {(["variable_product_stock_source", "order_statues_type", "video_source", "video_inherit_mode"] as const).map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{label(k)}</Label>
                <select className={selectClass} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)}>
                  {ENGINE_SELECTS[k].map((v) => (
                    <option key={v} value={v}>
                      {t.has(`options.${k}.${v}`) ? t(`options.${k}.${v}`) : v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {[...ENGINE_TEXTS.slice(2), "video_meta_key"].map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{label(k)}</Label>
                <Input value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
            <div className="grid gap-1">
              <Label className="text-xs">{label("tasks_per_minute")}</Label>
              <Input type="number" dir="ltr" value={String(draft.tasks_per_minute ?? "")} onChange={(e) => set("tasks_per_minute", Number(e.target.value))} />
            </div>
            {(["tasks_per_minute_auto", "developer_mode"] as const).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>{label(k)}</span>
                <Switch checked={Boolean(draft[k])} onCheckedChange={(v) => set(k, v)} />
              </label>
            ))}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
            {t("save_settings")}
          </Button>
          <Button variant="outline" disabled={applyAll.isPending} onClick={() => applyAll.mutate("full")}>
            {t("update_all")}
          </Button>
          <Button variant="outline" disabled={applyAll.isPending} onClick={() => applyAll.mutate("quick")}>
            {t("update_all_quick")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type Commission = { row_count: number; unmatched: number; imported_at: string | null; price_change_value: string; commission_enabled: boolean }

function BasalamCommissionCard() {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["basalam-commission"], queryFn: () => api<Commission>("/api/v1/marketplace/basalam/commission") })
  const [manual, setManual] = useState("")
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => {
    const v = q.data?.price_change_value
    if (v !== undefined) setManual(v === "commission" || v === "0" ? "" : v)
  }, [q.data])
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["basalam-commission"] })
    void qc.invalidateQueries({ queryKey: ["basalam-settings"] })
  }
  const importTariff = useMutation({
    mutationFn: async (mode: "seed" | "csv") => {
      if (mode === "csv" && file) {
        const csv = await file.text()
        return api<Commission & { matched: number }>("/api/v1/marketplace/basalam/commission", { method: "POST", json: { action: "csv", csv, enable_commission: true } })
      }
      return api<Commission & { matched: number }>("/api/v1/marketplace/basalam/commission", { method: "POST", json: { action: "seed", enable_commission: true } })
    },
    onSuccess: (r) => {
      toast.success(t("commission_imported", { matched: r.matched, unmatched: r.unmatched }))
      setFile(null)
      invalidate()
    },
    onError,
  })
  const savePrice = useMutation({
    mutationFn: (value: string) => api("/api/v1/marketplace/basalam/settings", { method: "POST", json: { settings: { price_change_value: value } } }),
    onSuccess: () => {
      toast.success(t("settings_saved"))
      invalidate()
    },
    onError,
  })
  const c = q.data
  const on = Boolean(c?.commission_enabled)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("commission_title")}</CardTitle>
        <CardDescription>{t("commission_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {t("commission_status", {
            count: fmtNum(c?.row_count ?? 0, locale),
            unmatched: fmtNum(c?.unmatched ?? 0, locale),
            at: c?.imported_at ? fmtDate(c.imported_at, locale) : t("never"),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant={on ? "default" : "outline"} disabled={savePrice.isPending} onClick={() => savePrice.mutate(on ? "0" : "commission")}>
            {on ? t("commission_on") : t("commission_enable")}
          </Button>
          <Button variant="secondary" disabled={importTariff.isPending} onClick={() => importTariff.mutate("seed")}>
            {t("seed_tariff")}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Input type="file" accept=".csv,text/csv" className="max-w-[14rem]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="outline" disabled={!file || importTariff.isPending} onClick={() => importTariff.mutate("csv")}>
              {t("import_csv")}
            </Button>
          </label>
        </div>
        <div className="grid max-w-md gap-1">
          <Label>{t("manual_change")}</Label>
          <div className="flex gap-2">
            <Input dir="ltr" type="number" value={manual} disabled={on} placeholder="0" onChange={(e) => setManual(e.target.value)} />
            <Button variant="outline" disabled={on || savePrice.isPending} onClick={() => savePrice.mutate(manual.trim() === "" ? "0" : manual.trim())}>
              {t("save")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("manual_change_hint")}</p>
        </div>
      </CardContent>
    </Card>
  )
}

type Gateway = { gateway_sandbox: boolean; pay_api_base: string; has_gateway_secret: boolean; has_gateway_sandbox_token: boolean }

function BasalamGatewayCard() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["basalam-gateway"], queryFn: () => api<Gateway>("/api/v1/marketplace/basalam/gateway/settings") })
  const [sandbox, setSandbox] = useState(false)
  const [base, setBase] = useState("")
  const [secret, setSecret] = useState("")
  const [sandboxToken, setSandboxToken] = useState("")
  useEffect(() => {
    if (!q.data) return
    setSandbox(q.data.gateway_sandbox)
    setBase(q.data.pay_api_base)
  }, [q.data])
  const save = useMutation({
    mutationFn: (extra?: { clear_secrets: string[] }) =>
      api<Gateway>("/api/v1/marketplace/basalam/gateway/settings", {
        method: "POST",
        json: { gateway_sandbox: sandbox, pay_api_base: base, ...(secret ? { gateway_secret: secret } : {}), ...(sandboxToken ? { gateway_sandbox_token: sandboxToken } : {}), ...(extra ?? {}) },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["basalam-gateway"], data)
      setSecret("")
      setSandboxToken("")
      toast.success(t("settings_saved"))
    },
    onError,
  })
  const g = q.data
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("gateway_title")}</CardTitle>
        <CardDescription>{t("gateway_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex max-w-lg items-center justify-between gap-3 text-sm">
          <span>{t("gateway_sandbox")}</span>
          <Switch checked={sandbox} onCheckedChange={setSandbox} />
        </label>
        <div className="grid max-w-lg gap-1">
          <div className="flex items-center justify-between">
            <Label>{t("gateway_secret")}</Label>
            {g?.has_gateway_secret ? (
              <button type="button" className="text-destructive text-xs hover:underline" onClick={() => save.mutate({ clear_secrets: ["gateway_secret"] })}>
                {t("clear")}
              </button>
            ) : null}
          </div>
          <Input type="password" dir="ltr" autoComplete="off" placeholder={g?.has_gateway_secret ? t("secret_saved") : ""} value={secret} onChange={(e) => setSecret(e.target.value)} />
        </div>
        {sandbox ? (
          <div className="grid max-w-lg gap-1">
            <Label>{t("gateway_sandbox_token")}</Label>
            <Input dir="ltr" autoComplete="off" placeholder={g?.has_gateway_sandbox_token ? t("secret_saved") : "demo-team-1"} value={sandboxToken} onChange={(e) => setSandboxToken(e.target.value)} />
          </div>
        ) : null}
        <div className="grid max-w-lg gap-1">
          <Label>{t("pay_api_base")}</Label>
          <Input dir="ltr" value={base} onChange={(e) => setBase(e.target.value)} />
        </div>
        <p className="text-muted-foreground text-xs">
          {t("gateway_enable_hint")}{" "}
          <Link href="/dashboard/settings/shop/payments" className="text-primary hover:underline">
            {t("payments_hub")}
          </Link>
        </p>
        <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Finance ─────────────────────────────────────────────────────────────

type Wrapped = { success: boolean; status_code: number; message: string; data: unknown }

function BasalamFinanceTab() {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const status = useBasalamStatus()
  const connected = Boolean(status.data?.connected)
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ["basalam-finance", page],
    queryFn: () => api<{ balance: Wrapped; settlements: Wrapped; history: Wrapped }>(`/api/v1/marketplace/basalam/finance/balance?page=${page}`),
    enabled: connected,
  })
  const banksQ = useQuery({ queryKey: ["basalam-banks"], queryFn: () => api<{ ok: boolean; banks: Wrapped }>("/api/v1/marketplace/basalam/finance/banks"), enabled: connected })
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("1")
  const [bank, setBank] = useState("")
  const settle = useMutation({
    mutationFn: () =>
      api("/api/v1/marketplace/basalam/finance/settlement", {
        method: "POST",
        json: { amount: Number(amount), method: Number(method), bank_account_id: bank ? Number(bank) : null },
      }),
    onSuccess: () => {
      toast.success(t("settlement_requested"))
      setAmount("")
      void qc.invalidateQueries({ queryKey: ["basalam-finance"] })
    },
    onError,
  })
  if (!connected) return <p className="text-muted-foreground text-sm">{t("connect_first")}</p>
  const bal = (q.data?.balance?.data ?? {}) as Record<string, unknown>
  const balData = (bal.data ?? bal) as Record<string, unknown>
  const balanceValue = Number(balData.balance ?? balData.amount ?? balData.total ?? 0)
  const withdrawable = balData.withdrawable ?? balData.withdrawable_balance ?? balData.available
  const banks = asList(banksQ.data?.banks?.data)
  const active = asList(q.data?.settlements?.data)
  const history = asList(q.data?.history?.data)

  const renderRows = (rows: Record<string, unknown>[]) =>
    rows.length ? (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={String(r.id ?? i)}>
                <TableCell dir="ltr">{String(r.id ?? "—")}</TableCell>
                <TableCell>{fmtNum(Number(r.amount ?? 0), locale)}</TableCell>
                <TableCell>{String((r.status as Record<string, unknown> | undefined)?.title ?? r.status_title ?? r.status ?? "—")}</TableCell>
                <TableCell className="text-xs">{fmtDate(String(r.created_at ?? r.date ?? ""), locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">{t("no_items")}</p>
    )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("finance_title")}</CardTitle>
          <CardDescription>{t("finance_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {q.data?.balance && !q.data.balance.success ? <p className="text-destructive text-sm">{q.data.balance.message}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Stat label={t("balance")} value={`${fmtNum(balanceValue, locale)} ${t("rial")}`} />
            {withdrawable !== undefined ? <Stat label={t("withdrawable")} value={`${fmtNum(Number(withdrawable), locale)} ${t("rial")}`} /> : null}
          </div>
          <div className="grid gap-2 md:grid-cols-[10rem_10rem_1fr_auto]">
            <Input type="number" dir="ltr" min={1} placeholder={t("amount_rial")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="1">{t("settle_method.1")}</option>
              <option value="2">{t("settle_method.2")}</option>
            </select>
            <select className={selectClass} value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">{t("default_bank")}</option>
              {banks.map((b) => (
                <option key={String(b.id)} value={String(b.id)}>
                  {String(b.bank_name ?? (b.bank as Record<string, unknown> | undefined)?.title ?? b.title ?? "")} {String(b.iban ?? b.sheba ?? b.card_number ?? "")}
                </option>
              ))}
            </select>
            <Button disabled={!amount || settle.isPending} onClick={() => settle.mutate()}>
              {t("request_settlement")}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("active_settlements")}</CardTitle>
        </CardHeader>
        <CardContent>{renderRows(active)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settlement_history")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderRows(history)}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("prev")}
            </Button>
            <Button size="sm" variant="outline" disabled={history.length < 10} onClick={() => setPage(page + 1)}>
              {t("next")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Jobs ────────────────────────────────────────────────────────────────

function BasalamJobsTools() {
  const t = useTranslations("marketplace_admin.basalam")
  const qc = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => api<{ cancelled: number }>("/api/v1/marketplace/basalam/jobs/cancel", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(t("jobs_cancelled", { count: r.cancelled }))
      void qc.invalidateQueries({ queryKey: ["marketplace-jobs", "basalam"] })
    },
    onError,
  })
  return (
    <div className="flex justify-end">
      <Button
        variant="outline"
        className="text-destructive"
        disabled={cancel.isPending}
        onClick={() => {
          if (window.confirm(t("confirm_cancel_jobs"))) cancel.mutate()
        }}
      >
        {t("cancel_all_jobs")}
      </Button>
    </div>
  )
}

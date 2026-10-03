"use client"

import { useLocale, useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

type Probe = {
  status: string
  source_url: string
  resources: string[]
  note: string
  fetch: boolean
}

type Progress = {
  percent?: number
  totals?: { pending?: number; done?: number; failed?: number; skipped?: number }
  by_resource?: Record<string, { pending?: number; done?: number; failed?: number; created?: number; updated?: number }>
  errors?: { id: number; resource: string; external_id: string; message: string | null }[]
}

type Stats = {
  orders: number
  sales_orders: number
  revenue_minor: number
  by_period: { period: string; orders: number; revenue_minor: number }[]
  snapshots: { period?: string; orders?: number; revenue_minor?: number }[]
}

type Job = {
  id: number
  status: string
  source_url: string | null
  dry_run: boolean
  summary: { note?: string; needs_mapping?: Record<string, { resource: string; external_id: string; label?: string; status?: string }> | { resource: string; external_id: string; label?: string }[] } | null
  options?: { resources?: string[] | null; publish_content?: boolean } | null
  progress: Progress | null
  stats?: Stats
  last_error?: string | null
}

type TokenRow = {
  id: number
  name: string
  last_used_at: string | null
  created_at: string | null
  token?: string
}

type ReviewItem = {
  id: number
  job_id: number | null
  resource: string
  external_id: string
  label: string | null
  status: string
  status_label: string
  type: string
  payload_preview: string
  can_apply: boolean
}

const CATALOG = [
  "media",
  "categories",
  "tags",
  "blog_categories",
  "blog_tags",
  "brands",
  "attribute_groups",
  "customers",
  "staff",
  "products",
  "coupons",
  "pages",
  "posts",
  "elementor_templates",
  "orders",
  "reviews",
  "menus",
  "redirects",
  "settings",
  "tickets",
  "returns",
  "wallet",
  "waiting_list",
  "permalinks",
  "review_queue",
  "stats",
] as const

const RESOURCE_LABELS: Record<string, string> = {
  woo_products: "محصولات ووکامرس",
  products: "محصولات",
  categories: "دسته‌های محصول",
  tags: "برچسب‌های محصول",
  blog_categories: "دسته‌های بلاگ",
  blog_tags: "برچسب‌های بلاگ",
  brands: "برندها",
  attribute_groups: "ویژگی‌ها و نمونه رنگ",
  customers: "مشتری‌ها",
  staff: "کارکنان",
  coupons: "کدهای تخفیف",
  orders: "سفارش‌ها",
  reviews: "دیدگاه‌ها",
  pages: "برگه‌ها",
  posts: "نوشته‌ها",
  elementor_templates: "قالب‌های المنتور",
  media: "رسانه",
  menus: "فهرست‌ها",
  redirects: "تغییر مسیر",
  settings: "تنظیمات",
  tickets: "تیکت‌ها",
  returns: "مرجوعی‌ها",
  wallet: "کیف پول",
  waiting_list: "لیست انتظار",
  permalinks: "نقشه پیوندها",
  review_queue: "صف بررسی",
  stats: "آمار",
}

function resourceLabel(key: string): string {
  return RESOURCE_LABELS[key] ?? key
}

export default function WpImportPage(_props: { route: ResolvedAdminRoute }) {
  const locale = normalizeUiLocale(useLocale())
  const t = useTranslations("builder")
  const reviewTypeLabel = (type: string) => {
    switch (type) {
      case "wallet":
        return t("import_type_wallet")
      case "ticket":
        return t("import_type_ticket")
      case "return":
        return t("import_type_return")
      case "settings_slice":
        return t("import_type_settings")
      case "waiting_list":
        return t("import_type_waiting")
      default:
        return type
    }
  }
  const reviewStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
      case "needs_mapping":
        return t("import_review_pending")
      case "applied":
        return t("import_review_applied")
      case "dismissed":
        return t("import_review_dismissed")
      case "reviewed":
        return t("import_review_status_reviewed")
      default:
        return status
    }
  }
  const [url, setUrl] = useState("https://parisma.ir")
  const [currency, setCurrency] = useState("IRT")
  const [multiplier, setMultiplier] = useState("1")
  const [hosts, setHosts] = useState("")
  const [dryRun, setDryRun] = useState(false)
  const [publish, setPublish] = useState(false)
  const [download, setDownload] = useState(true)
  const [mode, setMode] = useState<"full" | "selective">("full")
  const [selected, setSelected] = useState<string[]>([...CATALOG])
  const [probe, setProbe] = useState<Probe | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [active, setActive] = useState<Job | null>(null)
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [tokenName, setTokenName] = useState("parisma")
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])

  const statusLabel = useCallback((status: string) => {
    switch (status) {
      case "ready":
        return t("import_status_ready")
      case "running":
        return t("import_status_running")
      case "paused":
        return t("import_status_paused")
      case "completed":
        return t("import_status_completed")
      case "completed_with_errors":
        return t("import_status_completed_with_errors")
      case "failed":
        return t("import_status_failed")
      default:
        return status
    }
  }, [t])

  const load = useCallback(async () => {
    const [listed, issued, queued] = await Promise.all([
      api<Job[]>("/api/v1/import/wordpress/jobs"),
      api<TokenRow[]>("/api/v1/import/wordpress/tokens"),
      api<ReviewItem[]>("/api/v1/import/wordpress/review-queue"),
    ])
    setJobs(listed)
    setTokens(issued)
    setReviewItems(queued)
  }, [])

  useEffect(() => {
    void load().catch(() => toast.error(t("load_failed")))
  }, [load, t])

  async function openJob(id: number) {
    const job = await api<Job>(`/api/v1/import/wordpress/jobs/${id}`)
    setActive(job)
    setJobs((rows) => rows.map((row) => (row.id === job.id ? { ...row, ...job } : row)))
  }

  async function runProbe() {
    setBusy(true)
    try {
      const data = await api<Probe>("/api/v1/import/wordpress/probe", { method: "POST", json: { source_url: url } })
      setProbe(data)
      toast.success(t("import_probe_ok"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    if (mode === "selective" && selected.length === 0) {
      toast.error(t("import_select_one"))
      return
    }
    setBusy(true)
    try {
      const job = await api<Job>("/api/v1/import/wordpress/start", {
        method: "POST",
        json: {
          source_url: url,
          dry_run: dryRun,
          publish_content: publish,
          download_media: download,
          currency,
          price_multiplier: Number(multiplier) || 1,
          media_hosts: hosts.split(",").map((host) => host.trim()).filter(Boolean),
          mode,
          ...(mode === "selective" ? { resources: selected } : {}),
        },
      })
      setJobs((rows) => [job, ...rows])
      setActive(job)
      toast.success(t("import_started"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    if (!active) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const result = await api<{ job: Job; accepted: number; updated: number }>(
        `/api/v1/import/wordpress/jobs/${active.id}/upload`,
        { method: "POST", body },
      )
      setActive(result.job)
      toast.success(`${result.accepted} + ${result.updated}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function tick(id: number, untilDone: boolean) {
    setBusy(true)
    try {
      let job = active
      let guard = 0
      do {
        job = await api<Job>(`/api/v1/import/wordpress/jobs/${id}/run`, { method: "POST", json: { limit: 25 } })
        setActive(job)
        guard += 1
      } while (untilDone && guard < 500 && (job.status === "ready" || job.status === "running"))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function act(path: string) {
    if (!active) return
    setBusy(true)
    try {
      const payload = await api<Job | { job: Job }>(path, { method: "POST" })
      const job = "job" in payload ? payload.job : payload
      setActive(job)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function issueToken() {
    setBusy(true)
    try {
      const issued = await api<TokenRow>("/api/v1/import/wordpress/tokens", {
        method: "POST",
        json: { name: tokenName },
      })
      setFreshToken(issued.token ?? null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function reviewAct(id: number, action: "apply" | "dismiss" | "reviewed") {
    setBusy(true)
    try {
      if (action === "apply") {
        await api(`/api/v1/import/wordpress/review-queue/${id}/apply`, { method: "POST" })
      } else {
        await api(`/api/v1/import/wordpress/review-queue/${id}`, {
          method: "PATCH",
          json: { status: action === "dismiss" ? "dismissed" : "reviewed" },
        })
      }
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  const totals = active?.progress?.totals
  const queued = active?.summary?.needs_mapping
    ? Object.values(active.summary.needs_mapping)
    : []

  return (
    <PageShell title={t("import_title")} description={t("import_subtitle")}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("import_start")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <label className="grid gap-1 text-sm">
                {t("import_url")}
                <Input value={url} onChange={(event) => setUrl(event.target.value)} dir="ltr" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm">
                  {t("import_currency")}
                  <Input value={currency} onChange={(event) => setCurrency(event.target.value)} dir="ltr" />
                </label>
                <label className="grid gap-1 text-sm">
                  {t("import_multiplier")}
                  <Input value={multiplier} onChange={(event) => setMultiplier(event.target.value)} dir="ltr" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t("import_multiplier_hint")}</p>
              <label className="grid gap-1 text-sm">
                {t("import_hosts")}
                <Input value={hosts} onChange={(event) => setHosts(event.target.value)} placeholder="cdn.parisma.ir" dir="ltr" />
              </label>
              <p className="text-xs text-muted-foreground">{t("import_hosts_hint")}</p>
              <Toggle label={t("import_dry_run")} checked={dryRun} onChange={setDryRun} />
              <Toggle label={t("import_publish")} checked={publish} onChange={setPublish} />
              <Toggle label={t("import_download")} checked={download} onChange={setDownload} />
              <fieldset className="grid gap-2">
                <legend className="text-sm">{t("import_scope")}</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="import-mode" checked={mode === "full"} onChange={() => setMode("full")} />
                  {t("import_mode_full")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="import-mode" checked={mode === "selective"} onChange={() => setMode("selective")} />
                  {t("import_mode_selective")}
                </label>
                <div className="grid max-h-56 gap-1 overflow-auto rounded-md border p-2">
                  {CATALOG.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={mode === "full" || selected.includes(key)}
                        disabled={mode === "full"}
                        onChange={(event) => {
                          setSelected((current) => event.target.checked
                            ? [...current, key]
                            : current.filter((item) => item !== key))
                        }}
                      />
                      {resourceLabel(key)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => void runProbe()}>{t("import_probe")}</Button>
                <Button type="button" disabled={busy} onClick={() => void start()}>{t("import_start")}</Button>
              </div>
              <p className="text-sm text-muted-foreground">{t("import_hint")}</p>
              {probe ? (
                <div className="grid gap-1 text-sm">
                  <p dir="ltr">{probe.source_url}</p>
                  <ul className="list-disc ps-5">
                    {probe.resources.map((item) => (
                      <li key={item}>{resourceLabel(item)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("import_tokens")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <label className="grid gap-1 text-sm">
                {t("import_token_name")}
                <Input value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
              </label>
              <Button type="button" variant="outline" disabled={busy || tokenName.trim() === ""} onClick={() => void issueToken()}>
                {t("import_token_create")}
              </Button>
              {freshToken ? (
                <div className="grid gap-2 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{t("import_token_once")}</p>
                  <code className="break-all text-xs" dir="ltr">{freshToken}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(freshToken)
                      toast.success(t("import_copied"))
                    }}
                  >
                    {t("import_copy")}
                  </Button>
                </div>
              ) : null}
              {tokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{token.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void api(`/api/v1/import/wordpress/tokens/${token.id}`, { method: "DELETE" }).then(load)}
                  >
                    {t("import_token_revoke")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("import_jobs")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {jobs.length === 0 ? <p className="text-sm text-muted-foreground">{t("import_no_jobs")}</p> : null}
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-start text-sm"
                  onClick={() => void openJob(job.id)}
                >
                  <span dir="ltr">#{toLocaleDigits(job.id, locale)} {job.source_url}</span>
                  <Badge variant={job.status === "failed" || job.status === "completed_with_errors" ? "destructive" : "secondary"}>
                    {statusLabel(job.status)}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          {active ? (
            <Card>
              <CardHeader>
                <CardTitle>#{toLocaleDigits(active.id, locale)} — {statusLabel(active.status)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${active.progress?.percent ?? 0}%` }} />
                </div>
                <p className="text-sm">
                  {t("import_progress")}: {formatNumber(active.progress?.percent ?? 0, locale)}%
                  {totals ? ` — ${formatNumber(totals.done ?? 0, locale)} / ${formatNumber((totals.done ?? 0) + (totals.pending ?? 0) + (totals.failed ?? 0), locale)}` : ""}
                  {totals?.failed ? ` — ${t("import_errors")}: ${formatNumber(totals.failed, locale)}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                    {t("import_upload")}
                    <input
                      className="sr-only"
                      type="file"
                      accept="application/json,.json,application/zip,.zip"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void upload(file)
                        event.target.value = ""
                      }}
                    />
                  </label>
                  <Button type="button" disabled={busy} onClick={() => void tick(active.id, false)}>{t("import_run")}</Button>
                  <Button type="button" disabled={busy} onClick={() => void tick(active.id, true)}>{t("import_run_all")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void act(`/api/v1/import/wordpress/jobs/${active.id}/pause`)}>{t("import_pause")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void act(`/api/v1/import/wordpress/jobs/${active.id}/resume`)}>{t("import_resume")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void act(`/api/v1/import/wordpress/jobs/${active.id}/retry`)}>{t("import_retry")}</Button>
                </div>
                {active.progress?.by_resource ? (
                  <ul className="grid gap-1 text-sm">
                    {Object.entries(active.progress.by_resource).map(([resource, row]) => (
                      <li key={resource}>
                        {resourceLabel(resource)}: {formatNumber(row.done ?? 0, locale)} {t("import_status_completed")}
                        {row.failed ? ` / ${formatNumber(row.failed, locale)} ${t("import_errors")}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {active.stats ? (
                  <div className="grid gap-2">
                    <h2 className="text-sm font-medium">{t("import_stats")}</h2>
                    <p className="text-sm">
                      {t("import_orders")}: {formatNumber(active.stats.sales_orders, locale)} — {t("import_revenue")}:{" "}
                      {formatNumber(active.stats.revenue_minor, locale)}
                    </p>
                    <ul className="text-sm">
                      {active.stats.by_period.map((row) => (
                        <li key={row.period}>
                          {toLocaleDigits(row.period, locale)}: {formatNumber(row.orders, locale)} / {formatNumber(row.revenue_minor, locale)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {active.progress?.errors && active.progress.errors.length > 0 ? (
                  <ul className="grid gap-1 text-sm text-destructive">
                    {active.progress.errors.map((error) => (
                      <li key={error.id}>
                        {resourceLabel(error.resource)} {toLocaleDigits(error.external_id, locale)}: {error.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {queued.length > 0 ? (
                  <div className="grid gap-1">
                    <h2 className="text-sm font-medium">{t("import_queue")}</h2>
                    <ul className="grid gap-1 text-sm">
                      {queued.map((row) => (
                        <li key={`${row.resource}:${row.external_id}`}>
                          {resourceLabel(row.resource)} {toLocaleDigits(row.external_id, locale)}
                          {row.label ? ` — ${row.label}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {active.last_error ? <p className="text-sm text-destructive">{active.last_error}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("import_review_title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {reviewItems.length === 0 ? <p className="text-sm text-muted-foreground">{t("import_review_empty")}</p> : null}
              {reviewItems.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {reviewTypeLabel(item.type)}
                      {item.label ? ` — ${item.label}` : ""}
                      <span className="text-muted-foreground" dir="ltr"> #{toLocaleDigits(item.external_id, locale)}</span>
                    </span>
                    <Badge variant={item.status === "dismissed" ? "outline" : item.status === "applied" || item.status_label === "applied" ? "secondary" : "default"}>
                      {reviewStatusLabel(item.status_label || item.status)}
                    </Badge>
                  </div>
                  {item.payload_preview ? (
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs" dir="ltr">{item.payload_preview}</pre>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {item.can_apply ? (
                      <Button type="button" size="sm" disabled={busy} onClick={() => void reviewAct(item.id, "apply")}>{t("import_review_apply")}</Button>
                    ) : null}
                    {item.status !== "applied" && item.status !== "dismissed" ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void reviewAct(item.id, "reviewed")}>{t("import_review_reviewed")}</Button>
                    ) : null}
                    {item.status !== "applied" && item.status !== "dismissed" ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void reviewAct(item.id, "dismiss")}>{t("import_review_dismiss")}</Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

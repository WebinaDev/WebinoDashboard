"use client"

import { useTranslations } from "next-intl"
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
  summary: { note?: string } | null
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

const RESOURCE_LABELS: Record<string, string> = {
  woo_products: "محصولات ووکامرس",
  products: "محصولات",
  categories: "دسته‌ها",
  tags: "برچسب‌ها",
  customers: "مشتری‌ها",
  orders: "سفارش‌ها",
  pages: "برگه‌ها",
  posts: "نوشته‌ها",
  media: "رسانه",
  menus: "فهرست‌ها",
  stats: "آمار",
}

function resourceLabel(key: string): string {
  return RESOURCE_LABELS[key] ?? key
}

export default function WpImportPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder")
  const [url, setUrl] = useState("https://parisma.ir")
  const [currency, setCurrency] = useState("IRT")
  const [multiplier, setMultiplier] = useState("1")
  const [hosts, setHosts] = useState("")
  const [dryRun, setDryRun] = useState(false)
  const [publish, setPublish] = useState(false)
  const [download, setDownload] = useState(true)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [active, setActive] = useState<Job | null>(null)
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [tokenName, setTokenName] = useState("parisma")
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    const [listed, issued] = await Promise.all([
      api<Job[]>("/api/v1/import/wordpress/jobs"),
      api<TokenRow[]>("/api/v1/import/wordpress/tokens"),
    ])
    setJobs(listed)
    setTokens(issued)
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

  const totals = active?.progress?.totals

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
                  <span dir="ltr">#{job.id} {job.source_url}</span>
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
                <CardTitle>#{active.id} — {statusLabel(active.status)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${active.progress?.percent ?? 0}%` }} />
                </div>
                <p className="text-sm">
                  {t("import_progress")}: {active.progress?.percent ?? 0}%
                  {totals ? ` — ${totals.done ?? 0} / ${(totals.done ?? 0) + (totals.pending ?? 0) + (totals.failed ?? 0)}` : ""}
                  {totals?.failed ? ` — ${t("import_errors")}: ${totals.failed}` : ""}
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
                        {resourceLabel(resource)}: {row.done ?? 0} {t("import_status_completed")}
                        {row.failed ? ` / ${row.failed} ${t("import_errors")}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {active.stats ? (
                  <div className="grid gap-2">
                    <h2 className="text-sm font-medium">{t("import_stats")}</h2>
                    <p className="text-sm">
                      {t("import_orders")}: {active.stats.sales_orders} — {t("import_revenue")}: {active.stats.revenue_minor.toLocaleString("fa-IR")}
                    </p>
                    <ul className="text-sm">
                      {active.stats.by_period.map((row) => (
                        <li key={row.period} dir="ltr">
                          {row.period}: {row.orders} / {row.revenue_minor}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {active.progress?.errors && active.progress.errors.length > 0 ? (
                  <ul className="grid gap-1 text-sm text-destructive">
                    {active.progress.errors.map((error) => (
                      <li key={error.id}>
                        {resourceLabel(error.resource)} {error.external_id}: {error.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {active.last_error ? <p className="text-sm text-destructive">{active.last_error}</p> : null}
              </CardContent>
            </Card>
          ) : null}
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

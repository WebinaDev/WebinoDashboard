"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type Probe = {
  status: string
  resources: string[]
  note: string
}

const RESOURCE_LABELS: Record<string, string> = {
  woo_products: "محصولات ووکامرس",
  pages: "برگه‌ها",
  posts: "نوشته‌ها",
  media: "رسانه",
  menus: "فهرست‌ها",
}

function resourceLabel(key: string): string {
  return RESOURCE_LABELS[key] ?? key
}

type Job = {
  id: number
  status: string
  source_url: string | null
  summary: { resources?: string[]; note?: string } | null
}

export default function WpImportPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder")
  const [url, setUrl] = useState("https://example.com")
  const [probe, setProbe] = useState<Probe | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)

  async function runProbe() {
    setBusy(true)
    try {
      const data = await api<Probe>("/api/v1/import/wordpress/probe", { method: "POST", json: { source_url: url } })
      setProbe(data)
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setBusy(true)
    try {
      const job = await api<Job>("/api/v1/import/wordpress/start", { method: "POST", json: { source_url: url } })
      setJobs((items) => [job, ...items])
      toast.success(t("import_started"))
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell title={t("import_title")} description={t("import_subtitle")}>
      <div className="grid max-w-xl gap-3">
        <label className="grid gap-1 text-sm">
          {t("import_url")}
          <Input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void runProbe()}>{t("import_probe")}</Button>
          <Button type="button" disabled={busy} onClick={() => void start()}>{t("import_start")}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("import_hint")}</p>
        {probe ? (
          <ul className="list-disc ps-5 text-sm">
            {probe.resources.map((item) => (
              <li key={item}>{resourceLabel(item)}</li>
            ))}
          </ul>
        ) : null}
        {jobs.map((job) => (
          <p key={job.id} className="text-sm">#{job.id} — {job.status === "scaffold" ? "نمونه" : job.status}</p>
        ))}
      </div>
    </PageShell>
  )
}
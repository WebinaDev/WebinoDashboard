"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

export function AiOverviewPanel() {
  const t = useTranslations("aiContent")
  const q = useQuery({
    queryKey: ["ai-content", "overview"],
    queryFn: () => api<Record<string, unknown>>("/api/v1/ai-content/overview"),
  })
  const d = q.data
  const jobs = (d?.jobs as Record<string, number>) || {}

  return (
    <div className="space-y-4">
      {q.isLoading ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("kpi.enabled")} value={d?.enabled ? t("yes") : t("no")} />
        <Kpi label={t("kpi.hasKey")} value={d?.has_key ? t("yes") : t("no")} />
        <Kpi label={t("kpi.pending")} value={jobs.pending ?? 0} />
        <Kpi label={t("kpi.failed")} value={jobs.failed ?? 0} />
        <Kpi label={t("kpi.completed")} value={jobs.completed ?? 0} />
        <Kpi label={t("kpi.calendar")} value={Number(d?.calendar_planned ?? 0)} />
        <Kpi label={t("kpi.proposals")} value={Number(d?.proposals_pending ?? 0)} />
        <Kpi label={t("kpi.incomplete")} value={Number(d?.incomplete_products ?? 0)} />
      </div>
    </div>
  )
}

export function AiJobsPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const [status, setStatus] = useState("all")
  const q = useQuery({
    queryKey: ["ai-content", "jobs", status],
    queryFn: () =>
      api<{ items: Array<Record<string, unknown>>; total: number }>(
        `/api/v1/ai-content/jobs?per_page=30${status !== "all" ? `&status=${status}` : ""}`,
      ),
  })
  const runDue = useMutation({
    mutationFn: () => api("/api/v1/ai-content/jobs/run-due", { method: "POST", json: { limit: 5 } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "jobs"] }),
  })
  const runOne = useMutation({
    mutationFn: (id: number) => api(`/api/v1/ai-content/jobs/${id}/run`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "jobs"] }),
  })
  const cancel = useMutation({
    mutationFn: (id: number) => api(`/api/v1/ai-content/jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "jobs"] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="running">running</SelectItem>
            <SelectItem value="completed">completed</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => runDue.mutate()} disabled={runDue.isPending}>
          {t("runDue")}
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t("col.type")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
              <TableHead>{t("col.summary")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.items ?? []).map((j) => (
              <TableRow key={String(j.id)}>
                <TableCell>{String(j.id)}</TableCell>
                <TableCell>{String(j.job_type)}</TableCell>
                <TableCell>{String(j.status)}</TableCell>
                <TableCell className="max-w-xs truncate">{String(j.result_summary ?? j.error_message ?? "")}</TableCell>
                <TableCell className="space-x-2 rtl:space-x-reverse">
                  <Button size="sm" variant="outline" onClick={() => runOne.mutate(Number(j.id))}>
                    {t("run")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(Number(j.id))}>
                    {t("cancel")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function AiCalendarPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const [topic, setTopic] = useState("")
  const [keyword, setKeyword] = useState("")
  const q = useQuery({
    queryKey: ["ai-content", "calendar"],
    queryFn: () => api<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-content/calendar"),
  })
  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/calendar", {
        method: "POST",
        json: { topic, focus_keyword: keyword, slot_date: new Date().toISOString().slice(0, 10), content_type: "blog" },
      }),
    onSuccess: () => {
      setTopic("")
      setKeyword("")
      void qc.invalidateQueries({ queryKey: ["ai-content", "calendar"] })
    },
  })
  const runDue = useMutation({
    mutationFn: () => api("/api/v1/ai-content/calendar/run-due", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "calendar"] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label>{t("topic")}</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="w-56" />
        </div>
        <div className="grid gap-1">
          <Label>{t("focusKeyword")}</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-40" />
        </div>
        <Button size="sm" onClick={() => create.mutate()} disabled={!topic.trim() || create.isPending}>
          {t("addSlot")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => runDue.mutate()}>
          {t("runDue")}
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.date")}</TableHead>
              <TableHead>{t("topic")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.items ?? []).map((r) => (
              <TableRow key={String(r.id)}>
                <TableCell>{String(r.slot_date)}</TableCell>
                <TableCell>{String(r.topic)}</TableCell>
                <TableCell>{String(r.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function AiBlogPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["ai-content", "blog-topics"],
    queryFn: () => api<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-content/blog-topics"),
  })
  const suggest = useMutation({
    mutationFn: () => api("/api/v1/ai-content/blog-topics/suggest", { method: "POST", json: { count: 5, sync: true } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "blog-topics"] }),
  })
  const approve = useMutation({
    mutationFn: (id: string) => api("/api/v1/ai-content/blog-topics/approve", { method: "POST", json: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "blog-topics"] }),
  })
  const skip = useMutation({
    mutationFn: (id: string) => api("/api/v1/ai-content/blog-topics/skip", { method: "POST", json: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "blog-topics"] }),
  })

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
        {t("suggestTopics")}
      </Button>
      <div className="space-y-2">
        {(q.data?.items ?? []).map((item) => (
          <Card key={String(item.id)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{String(item.topic)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{String(item.focus_keyword ?? "")}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{String(item.status ?? "pending")}</span>
              {item.status === "pending" || !item.status ? (
                <>
                  <Button size="sm" onClick={() => approve.mutate(String(item.id))}>{t("approve")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => skip.mutate(String(item.id))}>{t("skip")}</Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function AiProductsPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["ai-content", "incomplete"],
    queryFn: () => api<{ items: Array<Record<string, unknown>>; total: number }>("/api/v1/ai-content/products/incomplete?limit=30"),
  })
  const fill = useMutation({
    mutationFn: (ids: number[]) =>
      api("/api/v1/ai-content/products/fill-batch", { method: "POST", json: { product_ids: ids } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content"] }),
  })
  const generateOne = useMutation({
    mutationFn: (id: number) =>
      api("/api/v1/ai-content/generate", { method: "POST", json: { type: "product", id, sync: false } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content"] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => fill.mutate((q.data?.items ?? []).map((i) => Number(i.id)))}
          disabled={!q.data?.items?.length || fill.isPending}
        >
          {t("fillBatch")} ({q.data?.total ?? 0})
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.items ?? []).map((p) => (
              <TableRow key={String(p.id)}>
                <TableCell>{String(p.id)}</TableCell>
                <TableCell>{String(p.name)}</TableCell>
                <TableCell>{String(p.sku ?? "")}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => generateOne.mutate(Number(p.id))}>
                    {t("generate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function AiTitlesPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const [ids, setIds] = useState("")
  const q = useQuery({
    queryKey: ["ai-content", "proposals", "title"],
    queryFn: () => api<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-content/proposals?kind=title"),
  })
  const enqueue = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/proposals/enqueue", {
        method: "POST",
        json: { kind: "title", product_ids: ids.split(/[\s,]+/).map(Number).filter(Boolean) },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "proposals"] }),
  })
  const apply = useMutation({
    mutationFn: (id: number) => api(`/api/v1/ai-content/proposals/${id}/apply`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "proposals"] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder="1,2,3"
          value={ids}
          onChange={(e) => setIds(e.target.value)}
          dir="ltr"
        />
        <Button size="sm" onClick={() => enqueue.mutate()} disabled={enqueue.isPending}>
          {t("enqueueTitles")}
        </Button>
      </div>
      {(q.data?.items ?? []).map((p) => {
        const proposed = (p.proposed_json as { title?: string }) || {}
        const current = (p.current_json as { title?: string }) || {}
        return (
          <Card key={String(p.id)}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6 text-sm">
              <div>
                <p className="text-muted-foreground">{current.title}</p>
                <p className="font-medium">{proposed.title}</p>
              </div>
              <Button size="sm" onClick={() => apply.mutate(Number(p.id))}>{t("apply")}</Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function AiPagesPanel() {
  const t = useTranslations("aiContent")
  const [pageId, setPageId] = useState("")
  const [prompt, setPrompt] = useState("")
  const gen = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/generate", {
        method: "POST",
        json: { type: "page", id: Number(pageId), page_prompt: prompt, sync: false },
      }),
  })

  return (
    <div className="space-y-4 max-w-lg">
      <div className="grid gap-1">
        <Label>{t("pageId")}</Label>
        <Input value={pageId} onChange={(e) => setPageId(e.target.value)} dir="ltr" />
      </div>
      <div className="grid gap-1">
        <Label>{t("pagePrompt")}</Label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
      </div>
      <Button onClick={() => gen.mutate()} disabled={!pageId || gen.isPending}>
        {t("generate")}
      </Button>
      {gen.isSuccess ? <p className="text-sm text-muted-foreground">{t("queued")}</p> : null}
      {gen.isError ? <p className="text-sm text-destructive">{t("error")}</p> : null}
    </div>
  )
}

export function AiTaxonomiesPanel() {
  const t = useTranslations("aiContent")
  const [type, setType] = useState("product_cat")
  const [ids, setIds] = useState("")
  const fill = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/terms/fill-batch", {
        method: "POST",
        json: { target_type: type, ids: ids.split(/[\s,]+/).map(Number).filter(Boolean) },
      }),
  })

  return (
    <div className="space-y-4 max-w-lg">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="product_cat">{t("productCat")}</SelectItem>
          <SelectItem value="product_brand">{t("productBrand")}</SelectItem>
        </SelectContent>
      </Select>
      <Input placeholder="1,2,3" value={ids} onChange={(e) => setIds(e.target.value)} dir="ltr" />
      <Button onClick={() => fill.mutate()} disabled={fill.isPending}>{t("fillBatch")}</Button>
    </div>
  )
}

export function AiAttributesPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const [catId, setCatId] = useState("")
  const [attrIds, setAttrIds] = useState("")
  const q = useQuery({
    queryKey: ["ai-content", "attrs"],
    queryFn: () => api<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-content/attribute-templates"),
  })
  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/attribute-templates", {
        method: "POST",
        json: {
          product_cat_id: Number(catId),
          attribute_ids: attrIds.split(/[\s,]+/).map(Number).filter(Boolean),
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-content", "attrs"] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder={t("categoryId")} value={catId} onChange={(e) => setCatId(e.target.value)} className="w-32" dir="ltr" />
        <Input placeholder="attr ids" value={attrIds} onChange={(e) => setAttrIds(e.target.value)} className="w-48" dir="ltr" />
        <Button size="sm" onClick={() => save.mutate()}>{t("save")}</Button>
      </div>
      <pre className="overflow-auto rounded border p-3 text-xs">{JSON.stringify(q.data?.items ?? [], null, 2)}</pre>
    </div>
  )
}

export function AiSettingsStudioPanel() {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["ai-content", "settings"],
    queryFn: () => api<Record<string, unknown>>("/api/v1/ai-content/settings"),
  })
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const effective = draft ?? q.data ?? null
  const save = useMutation({
    mutationFn: () => api("/api/v1/ai-content/settings", { method: "POST", json: { payload: effective } }),
    onSuccess: () => {
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ["ai-content", "settings"] })
    },
  })

  if (!effective) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const set = (k: string, v: unknown) => setDraft({ ...effective, [k]: v })

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <Label>{t("enabled")}</Label>
        <Switch checked={Boolean(effective.enabled)} onCheckedChange={(v) => set("enabled", v)} />
      </div>
      <div className="grid gap-1">
        <Label>{t("defaultProvider")}</Label>
        <Select value={String(effective.default_provider ?? "grok")} onValueChange={(v) => set("default_provider", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["grok", "gemini", "openai", "gapgpt"].map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(["grok_api_key", "gemini_api_key", "openai_api_key", "gapgpt_api_key"] as const).map((k) => (
        <div key={k} className="grid gap-1">
          <Label>{k}</Label>
          <Input
            type="password"
            dir="ltr"
            value={String(effective[k] ?? "")}
            onChange={(e) => set(k, e.target.value)}
            placeholder={effective[`${k}_set`] ? "•••• (set)" : ""}
          />
        </div>
      ))}
      <div className="grid gap-1">
        <Label>{t("siteName")}</Label>
        <Input value={String(effective.site_name ?? "")} onChange={(e) => set("site_name", e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label>{t("siteTopic")}</Label>
        <Input value={String(effective.site_topic ?? "")} onChange={(e) => set("site_topic", e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <Label>{t("doProduct")}</Label>
        <Switch checked={Boolean(effective.do_product)} onCheckedChange={(v) => set("do_product", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label>{t("doBlog")}</Label>
        <Switch checked={Boolean(effective.do_blog)} onCheckedChange={(v) => set("do_blog", v)} />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("save")}</Button>
    </div>
  )
}

export function AiSectionPanel({ section }: { section: string }) {
  switch (section) {
    case "overview":
      return <AiOverviewPanel />
    case "jobs":
      return <AiJobsPanel />
    case "calendar":
      return <AiCalendarPanel />
    case "blog":
      return <AiBlogPanel />
    case "products":
      return <AiProductsPanel />
    case "titles":
      return <AiTitlesPanel />
    case "pages":
      return <AiPagesPanel />
    case "taxonomies":
      return <AiTaxonomiesPanel />
    case "attributes":
      return <AiAttributesPanel />
    case "settings":
      return <AiSettingsStudioPanel />
    default:
      return <AiOverviewPanel />
  }
}

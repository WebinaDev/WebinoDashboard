"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Rule = {
  id: number
  name_fa: string
  name_en?: string | null
  trigger: string
  conditions: unknown[]
  actions: Array<{ type: string; payload?: Record<string, unknown> }>
  is_active: boolean
  priority: number
  run_count: number
}

type SlaPolicy = {
  id: number
  name_fa: string
  name_en?: string | null
  department_id?: number | null
  priority?: string | null
  first_response_minutes: number
  resolve_minutes: number
  business_hours_only: boolean
  alert_before_minutes: number
  escalate_to_user_id?: number | null
  is_active: boolean
}

type Campaign = {
  id: number
  name_fa: string
  name_en?: string | null
  question_fa: string
  question_en?: string | null
  thank_you_fa?: string | null
  thank_you_en?: string | null
  delay_minutes: number
  is_active: boolean
  is_default: boolean
}

type KbArticle = {
  id: number
  title_fa: string
  title_en?: string | null
  slug: string
  body_fa: string
  body_en?: string | null
  excerpt_fa?: string | null
  is_published: boolean
  is_public: boolean
  show_in_widget: boolean
  category_id?: number | null
}

type KbCategory = { id: number; name_fa: string; name_en?: string | null; slug: string }

export function AutomationPanel() {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name_fa: "",
    trigger: "ticket.created",
    action_type: "set_priority",
    action_value: "high",
    is_active: true,
    priority: 100,
  })

  const q = useQuery({
    queryKey: ["support", "automation"],
    queryFn: () =>
      api<{ items: Rule[]; triggers: string[]; action_types: string[] }>("/api/v1/support/automation/rules"),
  })

  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/support/automation/rules", {
        method: "POST",
        json: {
          name_fa: draft.name_fa,
          trigger: draft.trigger,
          conditions: [],
          actions: [{ type: draft.action_type, payload: payloadFor(draft.action_type, draft.action_value) }],
          is_active: draft.is_active,
          priority: draft.priority,
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraft((d) => ({ ...d, name_fa: "" }))
      void qc.invalidateQueries({ queryKey: ["support", "automation"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/automation/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "automation"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tab_automation")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>{t("name_fa")}</Label>
            <Input value={draft.name_fa} onChange={(e) => setDraft((d) => ({ ...d, name_fa: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("automation_trigger")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={draft.trigger}
              onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))}
            >
              {(q.data?.triggers ?? ["ticket.created"]).map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("automation_action")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={draft.action_type}
              onChange={(e) => setDraft((d) => ({ ...d, action_type: e.target.value }))}
            >
              {(q.data?.action_types ?? ["set_priority"]).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("automation_action_value")}</Label>
            <Input value={draft.action_value} onChange={(e) => setDraft((d) => ({ ...d, action_value: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} />
            <Label>{t("active")}</Label>
          </div>
          <Button type="button" disabled={!draft.name_fa || save.isPending} onClick={() => void save.mutateAsync()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(q.data?.items ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{r.name_fa}</p>
                <p className="text-muted-foreground text-xs">
                  {r.trigger} · {(r.actions ?? []).map((a) => a.type).join(", ")} · {r.run_count} runs
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => void del.mutateAsync(r.id)}>
                {t("delete")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function SlaPanel() {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name_fa: "",
    first_response_minutes: 60,
    resolve_minutes: 1440,
    alert_before_minutes: 15,
    business_hours_only: false,
    is_active: true,
    priority: "",
  })

  const policies = useQuery({
    queryKey: ["support", "sla", "policies"],
    queryFn: () => api<{ items: SlaPolicy[] }>("/api/v1/support/sla/policies"),
  })
  const dash = useQuery({
    queryKey: ["support", "sla", "dashboard"],
    queryFn: () =>
      api<{ open: number; breached: number; due_soon: number; rows: Array<Record<string, unknown>> }>(
        "/api/v1/support/sla/dashboard",
      ),
  })

  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/support/sla/policies", {
        method: "POST",
        json: {
          ...draft,
          priority: draft.priority || null,
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraft((d) => ({ ...d, name_fa: "" }))
      void qc.invalidateQueries({ queryKey: ["support", "sla"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const refresh = useMutation({
    mutationFn: () => api("/api/v1/support/sla/refresh", { method: "POST", json: {} }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "sla"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/sla/policies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "sla"] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("sla_open")}</p>
            <p className="text-2xl font-semibold">{dash.data?.open ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("sla_breached")}</p>
            <p className="text-2xl font-semibold text-red-600">{dash.data?.breached ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("sla_due_soon")}</p>
            <p className="text-2xl font-semibold">{dash.data?.due_soon ?? "—"}</p>
          </CardContent>
        </Card>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh.mutateAsync()}>
          {t("sla_refresh")}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sla_add_policy")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>{t("name_fa")}</Label>
            <Input value={draft.name_fa} onChange={(e) => setDraft((d) => ({ ...d, name_fa: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("sla_first_minutes")}</Label>
            <Input
              type="number"
              value={draft.first_response_minutes}
              onChange={(e) => setDraft((d) => ({ ...d, first_response_minutes: Number(e.target.value) || 60 }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("sla_resolve_minutes")}</Label>
            <Input
              type="number"
              value={draft.resolve_minutes}
              onChange={(e) => setDraft((d) => ({ ...d, resolve_minutes: Number(e.target.value) || 1440 }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("sla_alert_before")}</Label>
            <Input
              type="number"
              value={draft.alert_before_minutes}
              onChange={(e) => setDraft((d) => ({ ...d, alert_before_minutes: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.business_hours_only}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, business_hours_only: v }))}
            />
            <Label>{t("sla_business_hours")}</Label>
          </div>
          <Button type="button" disabled={!draft.name_fa || save.isPending} onClick={() => void save.mutateAsync()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(policies.data?.items ?? []).map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{p.name_fa}</p>
                <p className="text-muted-foreground text-xs">
                  {p.first_response_minutes}m / {p.resolve_minutes}m
                  {p.priority ? ` · ${p.priority}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => void del.mutateAsync(p.id)}>
                {t("delete")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {(dash.data?.rows ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("sla_queue")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.data!.rows.slice(0, 15).map((row) => (
              <div key={String(row.id)} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm last:border-0">
                <span>
                  {String(row.ticket_number || row.id)} — {String(row.subject || "")}
                </span>
                <span className={row.sla_breached_at ? "text-red-600" : "text-muted-foreground"}>
                  {row.sla_breached_at ? t("sla_breached") : String(row.resolve_due_at || row.first_response_due_at || "")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function CsatPanel() {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name_fa: "",
    question_fa: locale.startsWith("fa") ? "از این پشتیبانی چقدر راضی بودید؟" : "How satisfied were you?",
    question_en: "How satisfied were you with this support?",
    delay_minutes: 0,
    is_active: true,
    is_default: true,
  })

  const campaigns = useQuery({
    queryKey: ["support", "csat", "campaigns"],
    queryFn: () => api<{ items: Campaign[] }>("/api/v1/support/csat/campaigns"),
  })
  const report = useQuery({
    queryKey: ["support", "csat", "report"],
    queryFn: () =>
      api<{ count: number; average: number | null; response_rate: number | null; distribution: Record<string, number> }>(
        "/api/v1/support/csat/report?days=30",
      ),
  })

  const save = useMutation({
    mutationFn: () => api("/api/v1/support/csat/campaigns", { method: "POST", json: draft }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraft((d) => ({ ...d, name_fa: "" }))
      void qc.invalidateQueries({ queryKey: ["support", "csat"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/csat/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["support", "csat"] }),
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("csat_avg")}</p>
            <p className="text-2xl font-semibold">{report.data?.average ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("csat_count")}</p>
            <p className="text-2xl font-semibold">{report.data?.count ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">{t("csat_rate")}</p>
            <p className="text-2xl font-semibold">
              {report.data?.response_rate != null ? `${report.data.response_rate}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("csat_add_campaign")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("name_fa")}</Label>
            <Input value={draft.name_fa} onChange={(e) => setDraft((d) => ({ ...d, name_fa: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("csat_delay")}</Label>
            <Input
              type="number"
              value={draft.delay_minutes}
              onChange={(e) => setDraft((d) => ({ ...d, delay_minutes: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("csat_question")}</Label>
            <Input value={draft.question_fa} onChange={(e) => setDraft((d) => ({ ...d, question_fa: e.target.value }))} />
          </div>
          <Button type="button" disabled={!draft.name_fa || save.isPending} onClick={() => void save.mutateAsync()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(campaigns.data?.items ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {c.name_fa}
                  {c.is_default ? ` · ${t("csat_default")}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">{c.question_fa}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => void del.mutateAsync(c.id)}>
                {t("delete")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function KnowledgePanel() {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [catName, setCatName] = useState("")
  const [article, setArticle] = useState({
    title_fa: "",
    body_fa: "",
    excerpt_fa: "",
    category_id: "",
    is_published: true,
    is_public: true,
    show_in_widget: true,
  })

  const cats = useQuery({
    queryKey: ["support", "kb", "categories"],
    queryFn: () => api<{ items: KbCategory[] }>("/api/v1/support/kb/categories"),
  })
  const articles = useQuery({
    queryKey: ["support", "kb", "articles"],
    queryFn: () => api<{ items: KbArticle[] }>("/api/v1/support/kb/articles"),
  })

  const saveCat = useMutation({
    mutationFn: () => api("/api/v1/support/kb/categories", { method: "POST", json: { name_fa: catName } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setCatName("")
      void qc.invalidateQueries({ queryKey: ["support", "kb"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveArticle = useMutation({
    mutationFn: () =>
      api("/api/v1/support/kb/articles", {
        method: "POST",
        json: {
          ...article,
          category_id: article.category_id ? Number(article.category_id) : null,
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setArticle((a) => ({ ...a, title_fa: "", body_fa: "", excerpt_fa: "" }))
      void qc.invalidateQueries({ queryKey: ["support", "kb"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const delArticle = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/kb/articles/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["support", "kb"] }),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("kb_category")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder={t("name_fa")} />
          <Button type="button" disabled={!catName || saveCat.isPending} onClick={() => void saveCat.mutateAsync()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("kb_article")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            value={article.title_fa}
            onChange={(e) => setArticle((a) => ({ ...a, title_fa: e.target.value }))}
            placeholder={t("kb_title")}
          />
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={article.category_id}
            onChange={(e) => setArticle((a) => ({ ...a, category_id: e.target.value }))}
          >
            <option value="">{t("no_department")}</option>
            {(cats.data?.items ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name_fa}
              </option>
            ))}
          </select>
          <Input
            value={article.excerpt_fa}
            onChange={(e) => setArticle((a) => ({ ...a, excerpt_fa: e.target.value }))}
            placeholder={t("kb_excerpt")}
          />
          <Textarea
            rows={6}
            value={article.body_fa}
            onChange={(e) => setArticle((a) => ({ ...a, body_fa: e.target.value }))}
            placeholder={t("kb_body")}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={article.is_published}
                onCheckedChange={(v) => setArticle((a) => ({ ...a, is_published: v }))}
              />
              {t("kb_published")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={article.is_public} onCheckedChange={(v) => setArticle((a) => ({ ...a, is_public: v }))} />
              {t("kb_public")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={article.show_in_widget}
                onCheckedChange={(v) => setArticle((a) => ({ ...a, show_in_widget: v }))}
              />
              {t("kb_widget")}
            </label>
          </div>
          <Button
            type="button"
            disabled={!article.title_fa || !article.body_fa || saveArticle.isPending}
            onClick={() => void saveArticle.mutateAsync()}
          >
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(articles.data?.items ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{a.title_fa}</p>
                <p className="text-muted-foreground text-xs">
                  /{a.slug}
                  {a.is_published ? ` · ${t("kb_published")}` : ""}
                  {a.show_in_widget ? ` · ${t("kb_widget")}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => void delArticle.mutateAsync(a.id)}>
                {t("delete")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function payloadFor(type: string, value: string): Record<string, unknown> {
  switch (type) {
    case "set_status":
      return { status: value }
    case "set_priority":
      return { priority: value }
    case "assign":
      return { assignee_id: Number(value) || null }
    case "add_tag":
    case "remove_tag":
      return { tag: value }
    case "refer":
      return { department_id: Number(value) || 0 }
    case "notify":
      return { user_id: Number(value) || 0, title: "Automation", body: value }
    case "webhook":
      return { url: value }
    case "add_internal_note":
      return { body: value }
    default:
      return { value }
  }
}

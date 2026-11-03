"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Pencil, Plus, Star, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { MarketingSection } from "../lib/marketing-admin-ui"

type Rule = { type: string; value?: string }
type Conditions = { include?: Rule[]; exclude?: Rule[] }

type TemplateRow = {
  id: number
  kind: string
  title: string | null
  is_default: boolean
  priority: number
  conditions: Conditions | null
  has_draft: boolean
  has_published: boolean
}

type KindGroup = { kind: string; label: string; templates: TemplateRow[] }

const RULE_TYPES = [
  "entire_site",
  "url",
  "url_prefix",
  "url_contains",
  "singular",
  "archive",
  "search",
  "not_found",
  "product",
  "product_category",
] as const

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function PopupPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_popup")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [editing, setEditing] = useState<TemplateRow | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editPriority, setEditPriority] = useState(0)
  const [ruleType, setRuleType] = useState<string>("entire_site")
  const [ruleValue, setRuleValue] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["theme-builder-popups"],
    queryFn: async () => {
      const res = await api<{ kinds: KindGroup[] }>("/api/v1/theme-builder")
      return (res.kinds ?? []).find((k) => k.kind === "popup")?.templates ?? []
    },
  })

  const create = useMutation({
    mutationFn: () =>
      api<TemplateRow>("/api/v1/theme-builder/templates", {
        method: "POST",
        json: {
          kind: "popup",
          title: title.trim() || t("default_title"),
          conditions: { include: [{ type: "entire_site" }] },
        },
      }),
    onSuccess: async (row) => {
      setTitle("")
      toast.success(t("created"))
      await qc.invalidateQueries({ queryKey: ["theme-builder-popups"] })
      window.location.assign(`/dashboard/theme-builder/popup/${row.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveMeta = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("missing")
      const include: Rule[] =
        ruleType === "entire_site"
          ? [{ type: "entire_site" }]
          : [{ type: ruleType, value: ruleValue.trim() || undefined }]
      return api<TemplateRow>(`/api/v1/theme-builder/templates/${editing.id}`, {
        method: "PATCH",
        json: {
          title: editTitle.trim() || t("default_title"),
          priority: editPriority,
          conditions: { include },
        },
      })
    },
    onSuccess: async () => {
      toast.success(t("saved"))
      setEditing(null)
      await qc.invalidateQueries({ queryKey: ["theme-builder-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const publish = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/theme-builder/templates/${id}/publish`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("published"))
      await qc.invalidateQueries({ queryKey: ["theme-builder-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const makeDefault = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/theme-builder/templates/${id}/default`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("set_default"))
      await qc.invalidateQueries({ queryKey: ["theme-builder-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/theme-builder/templates/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(t("deleted"))
      setEditing(null)
      await qc.invalidateQueries({ queryKey: ["theme-builder-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  function openEdit(row: TemplateRow) {
    setEditing(row)
    setEditTitle(row.title ?? "")
    setEditPriority(row.priority ?? 0)
    const first = row.conditions?.include?.[0]
    setRuleType(first?.type ?? "entire_site")
    setRuleValue(first?.value ?? "")
  }

  const rows = data ?? []

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <Button variant="outline" asChild>
          <Link href={dashboardPath("marketing/customer-return")}>{t("back_hub")}</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <MarketingSection title={t("create_heading")} description={t("create_hint")}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-[220px] flex-1 gap-2">
              <Label>{t("title_field")}</Label>
              <Input
                value={title}
                placeholder={t("default_title")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              <Plus className="size-4" />
              {t("create")}
            </Button>
          </div>
        </MarketingSection>

        <MarketingSection title={t("list_heading")} description={t("list_hint")}>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.title || t("default_title")}</p>
                      {row.is_default ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("default")}
                        </Badge>
                      ) : null}
                      <Badge variant={row.has_published ? "default" : "outline"} className="text-[10px]">
                        {row.has_published ? t("status_published") : t("status_draft")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t("priority")}: {row.priority}
                      {row.conditions?.include?.[0]
                        ? ` · ${row.conditions.include[0].type}${
                            row.conditions.include[0].value ? `=${row.conditions.include[0].value}` : ""
                          }`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/theme-builder/popup/${row.id}`}>
                        <ExternalLink className="size-3.5" />
                        {t("design")}
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                      <Pencil className="size-3.5" />
                      {t("edit_meta")}
                    </Button>
                    {!row.has_published || row.has_draft ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={publish.isPending}
                        onClick={() => publish.mutate(row.id)}
                      >
                        {t("publish")}
                      </Button>
                    ) : null}
                    {!row.is_default ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={makeDefault.isPending}
                        onClick={() => makeDefault.mutate(row.id)}
                      >
                        <Star className="size-3.5" />
                        {t("make_default")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(t("confirm_delete"))) remove.mutate(row.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </MarketingSection>

        {editing ? (
          <MarketingSection title={t("edit_heading")} description={t("edit_hint")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("title_field")}</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("priority")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={editPriority}
                  onChange={(e) => setEditPriority(Number(e.target.value) || 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("rule_type")}</Label>
                <select
                  className={selectClass}
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                >
                  {RULE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {t(`rules.${rt}`)}
                    </option>
                  ))}
                </select>
              </div>
              {ruleType !== "entire_site" ? (
                <div className="grid gap-2">
                  <Label>{t("rule_value")}</Label>
                  <Input
                    value={ruleValue}
                    placeholder={t("rule_value_ph")}
                    onChange={(e) => setRuleValue(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button disabled={saveMeta.isPending} onClick={() => saveMeta.mutate()}>
                {tCommon("save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tCommon("cancel")}
              </Button>
            </div>
          </MarketingSection>
        ) : null}
      </div>
    </PageShell>
  )
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type FormField = {
  key: string
  type: string
  label_fa?: string
  label_en?: string
  required?: boolean
  options?: string[]
}

type Dept = {
  id: number
  name_fa: string
  name_en?: string | null
  slug: string
  description_fa?: string | null
  default_priority: string
  default_assignee_id?: number | null
  sla_first_response_hours?: number | null
  sla_resolve_hours?: number | null
  is_active: boolean
  sort_order: number
  form_fields: FormField[]
  color?: string | null
}

type Canned = {
  id: number
  department_id?: number | null
  title_fa: string
  title_en?: string | null
  body_fa: string
  body_en?: string | null
  category?: string | null
  is_active: boolean
}

type SettingsPayload = {
  online: Record<string, unknown>
  tickets: {
    number_prefix?: string
    guest_allowed?: boolean
    max_open_per_user?: number
    auto_close_days?: number
    default_priority?: string
    assignment?: { mode?: string; notify_assignee?: boolean; allow_cross_department_refer?: boolean }
  }
}

const FIELD_TYPES = ["text", "textarea", "number", "select", "radio", "checkbox", "date", "email", "phone"] as const
const emptyDept = (): Partial<Dept> => ({
  name_fa: "",
  name_en: "",
  slug: "",
  default_priority: "normal",
  is_active: true,
  sort_order: 0,
  form_fields: [],
})

export default function TicketsSettingsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [tab, setTab] = useState("departments")
  const [draftDept, setDraftDept] = useState<Partial<Dept>>(emptyDept())
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null)
  const [draftCanned, setDraftCanned] = useState<Partial<Canned>>({
    title_fa: "",
    body_fa: "",
    is_active: true,
  })
  const [ticketSettings, setTicketSettings] = useState<SettingsPayload["tickets"]>({})

  const deps = useQuery({
    queryKey: ["support", "departments"],
    queryFn: () => api<{ items: Dept[] }>("/api/v1/support/departments"),
  })
  const canned = useQuery({
    queryKey: ["support", "canned"],
    queryFn: () => api<{ items: Canned[] }>("/api/v1/support/canned-responses"),
  })
  const settings = useQuery({
    queryKey: ["support", "settings"],
    queryFn: () => api<SettingsPayload>("/api/v1/support/settings"),
  })

  useEffect(() => {
    if (settings.data?.tickets) setTicketSettings(settings.data.tickets)
  }, [settings.data])

  const saveDept = useMutation({
    mutationFn: async () => {
      const payload = {
        name_fa: draftDept.name_fa,
        name_en: draftDept.name_en || null,
        slug: draftDept.slug || undefined,
        description_fa: draftDept.description_fa || null,
        default_priority: draftDept.default_priority || "normal",
        default_assignee_id: draftDept.default_assignee_id || null,
        sla_first_response_hours: draftDept.sla_first_response_hours || null,
        sla_resolve_hours: draftDept.sla_resolve_hours || null,
        is_active: draftDept.is_active ?? true,
        sort_order: draftDept.sort_order ?? 0,
        color: draftDept.color || null,
        form_fields: draftDept.form_fields ?? [],
      }
      if (editingDeptId) {
        return api(`/api/v1/support/departments/${editingDeptId}`, { method: "PATCH", json: payload })
      }
      return api("/api/v1/support/departments", { method: "POST", json: payload })
    },
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraftDept(emptyDept())
      setEditingDeptId(null)
      void qc.invalidateQueries({ queryKey: ["support", "departments"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteDept = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "departments"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveCanned = useMutation({
    mutationFn: () =>
      api("/api/v1/support/canned-responses", {
        method: "POST",
        json: {
          title_fa: draftCanned.title_fa,
          title_en: draftCanned.title_en || null,
          body_fa: draftCanned.body_fa,
          body_en: draftCanned.body_en || null,
          department_id: draftCanned.department_id || null,
          category: draftCanned.category || null,
          is_active: draftCanned.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraftCanned({ title_fa: "", body_fa: "", is_active: true })
      void qc.invalidateQueries({ queryKey: ["support", "canned"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteCanned = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/canned-responses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "canned"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveSettings = useMutation({
    mutationFn: () => api("/api/v1/support/settings", { method: "PUT", json: { tickets: ticketSettings } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deptLabel = (d: Dept) => (locale.startsWith("fa") ? d.name_fa : d.name_en || d.name_fa)

  return (
    <PageShell title={t("settings_title")} description={t("settings_subtitle")}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="departments">{t("tab_departments")}</TabsTrigger>
          <TabsTrigger value="forms">{t("tab_forms")}</TabsTrigger>
          <TabsTrigger value="assignment">{t("tab_assignment")}</TabsTrigger>
          <TabsTrigger value="canned">{t("tab_canned")}</TabsTrigger>
          <TabsTrigger value="general">{t("tab_general")}</TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingDeptId ? t("edit_department") : t("add_department")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("name_fa")}</Label>
                <Input value={draftDept.name_fa ?? ""} onChange={(e) => setDraftDept((d) => ({ ...d, name_fa: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("name_en")}</Label>
                <Input value={draftDept.name_en ?? ""} onChange={(e) => setDraftDept((d) => ({ ...d, name_en: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("slug")}</Label>
                <Input value={draftDept.slug ?? ""} onChange={(e) => setDraftDept((d) => ({ ...d, slug: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("default_priority")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={draftDept.default_priority ?? "normal"}
                  onChange={(e) => setDraftDept((d) => ({ ...d, default_priority: e.target.value }))}
                >
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <option key={p} value={p}>
                      {t(`priority_${p}` as "priority_normal")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("sla_first_response")}</Label>
                <Input
                  type="number"
                  value={draftDept.sla_first_response_hours ?? ""}
                  onChange={(e) =>
                    setDraftDept((d) => ({
                      ...d,
                      sla_first_response_hours: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{t("sla_resolve")}</Label>
                <Input
                  type="number"
                  value={draftDept.sla_resolve_hours ?? ""}
                  onChange={(e) =>
                    setDraftDept((d) => ({
                      ...d,
                      sla_resolve_hours: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>{t("description")}</Label>
                <Textarea
                  value={draftDept.description_fa ?? ""}
                  onChange={(e) => setDraftDept((d) => ({ ...d, description_fa: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draftDept.is_active ?? true}
                  onCheckedChange={(v) => setDraftDept((d) => ({ ...d, is_active: v }))}
                />
                <Label>{t("active")}</Label>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="button" disabled={saveDept.isPending || !draftDept.name_fa} onClick={() => void saveDept.mutateAsync()}>
                  {tCommon("save")}
                </Button>
                {editingDeptId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingDeptId(null)
                      setDraftDept(emptyDept())
                    }}
                  >
                    {tCommon("cancel")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(deps.data?.items ?? []).map((d) => (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{deptLabel(d)}</p>
                    <p className="text-muted-foreground text-xs">
                      {d.slug} · {t(`priority_${d.default_priority}` as "priority_normal")} ·{" "}
                      {(d.form_fields ?? []).length} {t("fields_count")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingDeptId(d.id)
                        setDraftDept(d)
                        setTab("forms")
                      }}
                    >
                      {t("edit")}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void deleteDept.mutateAsync(d.id)}>
                      {t("delete")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="forms" className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("forms_hint")}</p>
          {!editingDeptId ? (
            <p className="text-sm">{t("forms_pick_dept")}</p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("form_for")} {draftDept.name_fa}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(draftDept.form_fields ?? []).map((field, idx) => (
                  <div key={`${field.key}-${idx}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
                    <Input
                      placeholder="key"
                      value={field.key}
                      onChange={(e) =>
                        setDraftDept((d) => {
                          const fields = [...(d.form_fields ?? [])]
                          fields[idx] = { ...fields[idx], key: e.target.value }
                          return { ...d, form_fields: fields }
                        })
                      }
                    />
                    <select
                      className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                      value={field.type}
                      onChange={(e) =>
                        setDraftDept((d) => {
                          const fields = [...(d.form_fields ?? [])]
                          fields[idx] = { ...fields[idx], type: e.target.value }
                          return { ...d, form_fields: fields }
                        })
                      }
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {ft}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder={t("label_fa")}
                      value={field.label_fa ?? ""}
                      onChange={(e) =>
                        setDraftDept((d) => {
                          const fields = [...(d.form_fields ?? [])]
                          fields[idx] = { ...fields[idx], label_fa: e.target.value }
                          return { ...d, form_fields: fields }
                        })
                      }
                    />
                    <Input
                      placeholder={t("options_csv")}
                      value={(field.options ?? []).join(",")}
                      onChange={(e) =>
                        setDraftDept((d) => {
                          const fields = [...(d.form_fields ?? [])]
                          fields[idx] = {
                            ...fields[idx],
                            options: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          }
                          return { ...d, form_fields: fields }
                        })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) =>
                            setDraftDept((d) => {
                              const fields = [...(d.form_fields ?? [])]
                              fields[idx] = { ...fields[idx], required: e.target.checked }
                              return { ...d, form_fields: fields }
                            })
                          }
                        />
                        {t("required")}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraftDept((d) => ({
                            ...d,
                            form_fields: (d.form_fields ?? []).filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDraftDept((d) => ({
                        ...d,
                        form_fields: [
                          ...(d.form_fields ?? []),
                          { key: `field_${(d.form_fields ?? []).length + 1}`, type: "text", label_fa: "", required: false },
                        ],
                      }))
                    }
                  >
                    {t("add_field")}
                  </Button>
                  <Button type="button" disabled={saveDept.isPending} onClick={() => void saveDept.mutateAsync()}>
                    {tCommon("save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assignment" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("assignment_mode")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={ticketSettings.assignment?.mode ?? "department_default"}
                  onChange={(e) =>
                    setTicketSettings((s) => ({
                      ...s,
                      assignment: { ...s.assignment, mode: e.target.value },
                    }))
                  }
                >
                  <option value="department_default">{t("assign_department_default")}</option>
                  <option value="round_robin">{t("assign_round_robin")}</option>
                  <option value="manual">{t("assign_manual")}</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={ticketSettings.assignment?.notify_assignee ?? true}
                  onCheckedChange={(v) =>
                    setTicketSettings((s) => ({
                      ...s,
                      assignment: { ...s.assignment, notify_assignee: v },
                    }))
                  }
                />
                <Label>{t("notify_assignee")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={ticketSettings.assignment?.allow_cross_department_refer ?? true}
                  onCheckedChange={(v) =>
                    setTicketSettings((s) => ({
                      ...s,
                      assignment: { ...s.assignment, allow_cross_department_refer: v },
                    }))
                  }
                />
                <Label>{t("allow_refer")}</Label>
              </div>
              <div className="md:col-span-2">
                <Button type="button" disabled={saveSettings.isPending} onClick={() => void saveSettings.mutateAsync()}>
                  {tCommon("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canned" className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("canned_title")}</Label>
                <Input
                  value={draftCanned.title_fa ?? ""}
                  onChange={(e) => setDraftCanned((c) => ({ ...c, title_fa: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("department")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={draftCanned.department_id ? String(draftCanned.department_id) : ""}
                  onChange={(e) =>
                    setDraftCanned((c) => ({
                      ...c,
                      department_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">{t("all_departments")}</option>
                  {(deps.data?.items ?? []).map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {deptLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>{t("canned_body")}</Label>
                <Textarea
                  rows={4}
                  value={draftCanned.body_fa ?? ""}
                  onChange={(e) => setDraftCanned((c) => ({ ...c, body_fa: e.target.value }))}
                />
              </div>
              <Button
                type="button"
                disabled={saveCanned.isPending || !draftCanned.title_fa || !draftCanned.body_fa}
                onClick={() => void saveCanned.mutateAsync()}
              >
                {t("add_canned")}
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {(canned.data?.items ?? []).map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{c.title_fa}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-wrap">{c.body_fa}</p>
                  </div>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void deleteCanned.mutateAsync(c.id)}>
                    {t("delete")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("number_prefix")}</Label>
                <Input
                  value={ticketSettings.number_prefix ?? "TKT"}
                  onChange={(e) => setTicketSettings((s) => ({ ...s, number_prefix: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("max_open")}</Label>
                <Input
                  type="number"
                  value={ticketSettings.max_open_per_user ?? 10}
                  onChange={(e) => setTicketSettings((s) => ({ ...s, max_open_per_user: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("auto_close_days")}</Label>
                <Input
                  type="number"
                  value={ticketSettings.auto_close_days ?? 14}
                  onChange={(e) => setTicketSettings((s) => ({ ...s, auto_close_days: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={ticketSettings.guest_allowed ?? true}
                  onCheckedChange={(v) => setTicketSettings((s) => ({ ...s, guest_allowed: v }))}
                />
                <Label>{t("guest_allowed")}</Label>
              </div>
              <div className="md:col-span-2">
                <Button type="button" disabled={saveSettings.isPending} onClick={() => void saveSettings.mutateAsync()}>
                  {tCommon("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

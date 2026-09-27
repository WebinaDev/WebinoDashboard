"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { RichTextEditor } from "@/components/content/RichTextEditor"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Detail = {
  id?: number
  title: string
  slug: string
  body: string
  excerpt: string
  status: string
  parent_id?: number | null
  featured_media_id?: number | null
  featured_image_url?: string | null
  seo?: { title?: string; description?: string; focus_keyword?: string }
}

type PageOpt = { id: number; title: string }

export default function CmsPageEditor({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const qc = useQueryClient()
  const id = route.params?.pageId ? Number(route.params.pageId) : null
  const isNew = !id || route.path === "pages/new"

  const [form, setForm] = useState<Detail>({
    title: "",
    slug: "",
    body: "",
    excerpt: "",
    status: "draft",
    seo: {},
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const detailQ = useQuery({
    queryKey: ["cms", "page", id],
    enabled: !isNew && !!id,
    queryFn: () => api<Detail>(`/api/v1/cms/pages/${id}`),
  })

  useEffect(() => {
    if (detailQ.data) {
      setForm({
        ...detailQ.data,
        body: detailQ.data.body || "",
        seo: detailQ.data.seo || {},
      })
    }
  }, [detailQ.data])

  const parentsQ = useQuery({
    queryKey: ["cms", "pages", "parents"],
    queryFn: () => api<{ items: PageOpt[] }>("/api/v1/cms/pages?per_page=100"),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        body: form.body,
        excerpt: form.excerpt,
        status: form.status,
        parent_id: form.parent_id ?? null,
        featured_media_id: form.featured_media_id ?? null,
        seo: form.seo,
      }
      if (isNew) return api<Detail>("/api/v1/cms/pages", { method: "POST", json: payload })
      return api<Detail>(`/api/v1/cms/pages/${id}`, { method: "PATCH", json: payload })
    },
    onSuccess: (res) => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["cms"] })
      if (isNew && res.id) router.replace(`/dashboard/pages/${res.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell
      title={isNew ? t("new_page") : t("edit_page")}
      actions={
        <Button type="button" disabled={!form.title.trim() || saveMut.isPending} onClick={() => void saveMut.mutateAsync()}>
          {tCommon("save")}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("col_title")}
            className="text-lg font-semibold"
          />
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={t("slug")} />
          <Textarea
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            placeholder={t("excerpt")}
            rows={3}
          />
          <RichTextEditor value={form.body} onChange={(html) => setForm({ ...form, body: html })} />
          <SimpleSeoFields seo={form.seo} onChange={(seo) => setForm({ ...form, seo })} />
        </div>
        <aside className="space-y-4">
          <div className="space-y-2 rounded-xl border p-4">
            <Label>{t("col_status")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="draft">{t("stat_draft")}</option>
              <option value="pending">{t("stat_pending")}</option>
              <option value="published">{t("stat_publish")}</option>
            </select>
          </div>
          <div className="space-y-2 rounded-xl border p-4">
            <Label>{t("parent")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.parent_id ?? ""}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">{t("no_parent")}</option>
              {(parentsQ.data?.items ?? [])
                .filter((p) => p.id !== id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium">{t("featured")}</p>
            {form.featured_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.featured_image_url} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" />
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              {t("pick_image")}
            </Button>
          </div>
        </aside>
      </div>
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(item) => setForm({ ...form, featured_media_id: item.id, featured_image_url: item.url })}
      />
    </PageShell>
  )
}

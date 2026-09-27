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
import { Checkbox } from "@/components/ui/checkbox"
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
  categories: number[]
  tags: { id: number; name: string }[]
  featured_media_id?: number | null
  featured_image_url?: string | null
  seo?: { title?: string; description?: string; focus_keyword?: string }
}

type Cat = { id: number; name: string }

export default function MagazineEditorPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const qc = useQueryClient()
  const id = route.params?.postId ? Number(route.params.postId) : null
  const isNew = !id || route.path === "magazine/new"

  const [form, setForm] = useState<Detail>({
    title: "",
    slug: "",
    body: "",
    excerpt: "",
    status: "draft",
    categories: [],
    tags: [],
    seo: {},
  })
  const [tagInput, setTagInput] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)

  const detailQ = useQuery({
    queryKey: ["magazine", "post", id],
    enabled: !isNew && !!id,
    queryFn: () => api<Detail>(`/api/v1/magazine/articles/${id}`),
  })

  useEffect(() => {
    if (detailQ.data) {
      setForm({
        ...detailQ.data,
        body: detailQ.data.body || "",
        tags: detailQ.data.tags || [],
        categories: detailQ.data.categories || [],
        seo: detailQ.data.seo || {},
      })
    }
  }, [detailQ.data])

  const catsQ = useQuery({
    queryKey: ["magazine", "categories"],
    queryFn: () => api<{ items: Cat[] }>("/api/v1/magazine/categories"),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        body: form.body,
        excerpt: form.excerpt,
        status: form.status,
        categories: form.categories,
        tags: form.tags.map((x) => x.name),
        featured_media_id: form.featured_media_id ?? null,
        seo: form.seo,
      }
      if (isNew) {
        return api<Detail>("/api/v1/magazine/articles", { method: "POST", json: payload })
      }
      return api<Detail>(`/api/v1/magazine/articles/${id}`, { method: "PATCH", json: payload })
    },
    onSuccess: (res) => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["magazine"] })
      if (isNew && res.id) router.replace(`/dashboard/magazine/posts/${res.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell
      title={isNew ? t("new_post") : t("edit_post")}
      actions={
        <Button type="button" disabled={!form.title.trim() || saveMut.isPending} onClick={() => void saveMut.mutateAsync()}>
          {tCommon("save")}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
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
            <p className="text-sm font-medium">{t("categories")}</p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {(catsQ.data?.items ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.categories.includes(c.id)}
                    onCheckedChange={(v) => {
                      const set = new Set(form.categories)
                      if (v) set.add(c.id)
                      else set.delete(c.id)
                      setForm({ ...form, categories: [...set] })
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium">{t("tags")}</p>
            <div className="flex flex-wrap gap-1">
              {form.tags.map((tag) => (
                <button
                  key={tag.name}
                  type="button"
                  className="bg-muted rounded-full px-2 py-0.5 text-xs"
                  onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x.name !== tag.name) })}
                >
                  {tag.name} ×
                </button>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  const name = tagInput.trim().replace(/,$/, "")
                  if (!name) return
                  if (!form.tags.some((x) => x.name === name)) {
                    setForm({ ...form, tags: [...form.tags, { id: 0, name }] })
                  }
                  setTagInput("")
                }
              }}
              placeholder={t("tag_hint")}
            />
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

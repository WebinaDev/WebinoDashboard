"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

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
  category_id: number | null
  tags: { id: number; name: string }[]
  cover_url?: string | null
  published_at?: string | null
}

type Cat = { id: number; name: string }

export default function BlogEditorPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const qc = useQueryClient()
  const id = route.params?.postId ? Number(route.params.postId) : null
  const isNew = !id || route.path === "blog/new"

  const [form, setForm] = useState<Detail>({
    title: "",
    slug: "",
    body: "",
    excerpt: "",
    status: "draft",
    category_id: null,
    tags: [],
    cover_url: null,
  })
  const [tagInput, setTagInput] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [slugEditing, setSlugEditing] = useState(false)

  const detailQ = useQuery({
    queryKey: ["blog", "post", id],
    enabled: !isNew && !!id,
    queryFn: () => api<Detail>(`/api/v1/blog/posts/${id}`),
  })

  useEffect(() => {
    if (detailQ.data) {
      setForm({
        ...detailQ.data,
        body: detailQ.data.body || "",
        tags: detailQ.data.tags || [],
        category_id: detailQ.data.category_id ?? null,
        cover_url: detailQ.data.cover_url ?? null,
      })
    }
  }, [detailQ.data])

  const catsQ = useQuery({
    queryKey: ["blog", "categories"],
    queryFn: () => api<{ items: Cat[] }>("/api/v1/blog/categories"),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        body: form.body,
        excerpt: form.excerpt,
        status: form.status,
        category_id: form.category_id,
        tags: form.tags.map((x) => x.name),
        cover_url: form.cover_url ?? null,
        published_at: form.status === "published" ? form.published_at || undefined : form.published_at,
      }
      if (isNew) {
        return api<Detail>("/api/v1/blog/posts", { method: "POST", json: payload })
      }
      return api<Detail>(`/api/v1/blog/posts/${id}`, { method: "PATCH", json: payload })
    },
    onSuccess: (res) => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["blog"] })
      if (isNew && res.id) router.replace(`/dashboard/blog/posts/${res.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const permalinkBase = "/blog/"
  const slugPart = form.slug || ""

  return (
    <PageShell
      title={isNew ? t("new_post") : t("edit_post")}
      actions={
        <div className="flex items-center gap-2">
          {slugPart ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={`/blog/${slugPart}`} target="_blank" rel="noreferrer">
                {t("view_on_site")}
              </Link>
            </Button>
          ) : null}
          <Button type="button" disabled={!form.title.trim() || saveMut.isPending} onClick={() => void saveMut.mutateAsync()}>
            {tCommon("save")}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Input
            value={form.title}
            onChange={(e) => {
              const title = e.target.value
              setForm((f) => ({
                ...f,
                title,
                slug: isNew && !slugEditing ? title.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]+/g, "") : f.slug,
              }))
            }}
            placeholder={t("col_title")}
            className="text-lg font-semibold"
          />
          <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            <span>{permalinkBase}</span>
            {slugEditing ? (
              <Input
                className="h-8 max-w-xs"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                onBlur={() => setSlugEditing(false)}
                autoFocus
              />
            ) : (
              <>
                <button type="button" className="text-foreground font-medium hover:underline" onClick={() => setSlugEditing(true)}>
                  {slugPart || "…"}
                </button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setSlugEditing(true)}>
                  {t("slug")}
                </Button>
              </>
            )}
          </div>
          <Textarea
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            placeholder={t("excerpt")}
            rows={3}
          />
          <RichTextEditor value={form.body} onChange={(html) => setForm({ ...form, body: html })} />
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
              <option value="published">{t("stat_publish")}</option>
            </select>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium">{t("categories")}</p>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.category_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">{t("no_parent")}</option>
              {(catsQ.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
            {form.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.cover_url} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" />
            ) : null}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                {t("pick_image")}
              </Button>
              {form.cover_url ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, cover_url: null })}>
                  {t("delete")}
                </Button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(item) => setForm({ ...form, cover_url: item.url })}
      />
    </PageShell>
  )
}

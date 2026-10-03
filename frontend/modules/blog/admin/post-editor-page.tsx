"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AiGenerateButton } from "@/components/content/AiGenerateButton"
import {
  ContentPublishPanel,
  defaultPublishDateLocal,
  publishStateToPayload,
  type ContentPublishState,
} from "@/components/content/ContentPublishPanel"
import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { RichTextEditor } from "@/components/content/RichTextEditor"
import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { blogPostPermalink } from "@/lib/content-permalink"
import { slugifyTitle } from "@/lib/slugify"

type Detail = {
  id?: number
  title: string
  slug: string
  body: string
  excerpt: string
  status: string
  categories: number[]
  category_id: number | null
  tags: { id: number; name: string }[]
  cover_url?: string | null
  cover_media_id?: number | null
  permalink?: string
  published_at?: string | null
  comment_status?: "open" | "closed"
  visibility?: "public" | "private" | "password"
  password?: string
  seo?: { title?: string; description?: string; focus_keyword?: string }
}

type Cat = { id: number; name: string }

export default function BlogEditorPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
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
    categories: [],
    category_id: null,
    tags: [],
    cover_url: null,
    seo: {},
  })
  const [publish, setPublish] = useState<ContentPublishState>({
    status: "draft",
    visibility: "public",
    password: "",
    commentStatus: "open",
    publishImmediately: true,
    publishDate: defaultPublishDateLocal(),
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
        categories: detailQ.data.categories?.length
          ? detailQ.data.categories
          : detailQ.data.category_id
            ? [detailQ.data.category_id]
            : [],
        category_id: detailQ.data.category_id ?? null,
        cover_url: detailQ.data.cover_url ?? null,
        seo: detailQ.data.seo ?? {},
      })
      setPublish({
        status: detailQ.data.status || "draft",
        visibility: detailQ.data.visibility ?? "public",
        password: detailQ.data.password ?? "",
        commentStatus: detailQ.data.comment_status === "closed" ? "closed" : "open",
        publishImmediately: !detailQ.data.published_at,
        publishDate: detailQ.data.published_at
          ? detailQ.data.published_at.slice(0, 16)
          : defaultPublishDateLocal(),
      })
    }
  }, [detailQ.data])

  const catsQ = useQuery({
    queryKey: ["blog", "categories"],
    queryFn: () => api<{ items: Cat[] }>("/api/v1/blog/categories"),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const primary = form.categories[0] ?? null
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        body: form.body,
        excerpt: form.excerpt,
        category_id: primary,
        categories: form.categories,
        tags: form.tags.map((x) => x.name),
        cover_url: form.cover_url ?? null,
        cover_media_id: form.cover_media_id ?? null,
        seo: form.seo,
        ...publishStateToPayload(publish),
      }
      if (isNew) return api<Detail>("/api/v1/blog/posts", { method: "POST", json: payload })
      return api<Detail>(`/api/v1/blog/posts/${id}`, { method: "PATCH", json: payload })
    },
    onSuccess: (res) => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["blog"] })
      if (isNew && res.id) router.replace(`/dashboard/blog/posts/${res.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const publicPath = form.slug ? detailQ.data?.permalink ?? blogPostPermalink(form.slug) : ""

  return (
    <PageShell
      title={isNew ? t("new_post") : t("edit_post")}
      actions={
        <div className="flex items-center gap-2">
          {!isNew && id ? <AiGenerateButton type="blog" id={id} onDone={() => void detailQ.refetch()} /> : null}
          {!isNew && id ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={`/dashboard/builder/post/${id}`}>{t("open_builder")}</Link>
            </Button>
          ) : null}
          {publicPath ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={publicPath} target="_blank" rel="noreferrer">
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
                slug: isNew && !slugEditing ? slugifyTitle(title) : f.slug,
              }))
            }}
            placeholder={t("col_title")}
            className="text-lg font-semibold"
          />
          <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            <span>{t("permalink")}:</span>
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
                <span dir="ltr" className="text-foreground font-medium">
                  {publicPath || "…"}
                </span>
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
          <SimpleSeoFields seo={form.seo} onChange={(seo) => setForm({ ...form, seo })} />
        </div>

        <aside className="space-y-4">
          <ContentPublishPanel
            state={publish}
            onChange={(patch) => setPublish((s) => ({ ...s, ...patch }))}
            onSave={() => void saveMut.mutateAsync()}
            isSaving={saveMut.isPending}
            locale={locale}
          />

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
                      const next = [...set]
                      setForm({ ...form, categories: next, category_id: next[0] ?? null })
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
            {form.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.cover_url} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" />
            ) : null}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                {t("pick_image")}
              </Button>
              {form.cover_url ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm({ ...form, cover_url: null, cover_media_id: null })}
                >
                  {t("remove_featured")}
                </Button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(item) => setForm({ ...form, cover_media_id: item.id, cover_url: item.url })}
      />
    </PageShell>
  )
}

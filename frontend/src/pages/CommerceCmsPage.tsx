"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type Page = { id: number; slug: string; title: string; published: boolean; body: string | null }

export default function CommerceCmsPage() {
  const { t } = useTranslation(["phase2", "common"])
  const [rows, setRows] = useState<Page[]>([])
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [body, setBody] = useState("")
  const [pending, setPending] = useState(false)

  function load() {
    api<{ data: Page[] }>("/api/v1/cms/pages")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
  }

  useEffect(() => {
    load()
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await api("/api/v1/cms/pages", {
        method: "POST",
        json: { title, slug: slug || undefined, body, published: true },
      })
      setTitle("")
      setSlug("")
      setBody("")
      load()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("phase2:cms_title")}</h1>

      <form onSubmit={(e) => void onCreate(e)} className="grid max-w-xl gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="cms-title">{t("phase2:cms_title")}</Label>
          <Input id="cms-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cms-slug">slug</Label>
          <Input id="cms-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cms-body">body</Label>
          <textarea
            id="cms-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            rows={4}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {t("common:save")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("phase2:cms_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <span className="text-muted-foreground font-mono text-xs">{p.slug}</span>
              </div>
              {p.body ? <p className="text-muted-foreground mt-2 text-xs">{p.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

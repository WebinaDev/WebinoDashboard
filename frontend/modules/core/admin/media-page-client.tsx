"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type MediaItem = {
  id: number
  path: string
  url?: string | null
  mime?: string | null
  size?: number
  alt?: string | null
  original_name?: string | null
  folder?: string | null
}

function asList(payload: unknown): MediaItem[] {
  if (Array.isArray(payload)) return payload as MediaItem[]
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: MediaItem[] }).data
  }
  return []
}

export default function MediaPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("media")
  const tCommon = useTranslations("common")
  const [items, setItems] = useState<MediaItem[]>([])
  const [alt, setAlt] = useState("")
  const [folder, setFolder] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    api<unknown>("/api/v1/media")
      .then((r) => setItems(asList(r)))
      .catch(() => setItems([]))
  }

  useEffect(() => {
    load()
  }, [])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError(t("file_required"))
      return
    }
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const body = new FormData()
      body.append("file", file)
      if (alt.trim()) body.append("alt", alt.trim())
      if (folder.trim()) body.append("folder", folder.trim())
      await api("/api/v1/media", { method: "POST", body })
      setAlt("")
      setFolder("")
      if (fileRef.current) fileRef.current.value = ""
      setMessage(t("uploaded"))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(id: number) {
    setPending(true)
    setError(null)
    try {
      await api(`/api/v1/media/${id}`, { method: "DELETE" })
      setMessage(t("deleted"))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <form onSubmit={(e) => void onUpload(e)} className="grid max-w-xl gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">{t("upload_heading")}</p>
        <div className="space-y-1">
          <Label htmlFor="media-file">{t("file")}</Label>
          <Input id="media-file" type="file" ref={fileRef} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="media-alt">{t("alt")}</Label>
          <Input id="media-alt" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="media-folder">{t("folder")}</Label>
          <Input id="media-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={t("folder_hint")} />
        </div>
        <Button type="submit" disabled={pending}>
          <Upload className="me-2 size-4" />
          {t("upload")}
        </Button>
      </form>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">{t("list_heading")}</h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                {item.url && item.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.alt || item.original_name || ""} className="bg-muted h-32 w-full rounded object-cover" />
                ) : (
                  <div className="bg-muted text-muted-foreground flex h-32 items-center justify-center rounded text-xs">
                    {item.mime || t("file")}
                  </div>
                )}
                <p className="truncate font-medium">{item.original_name || item.path}</p>
                {item.folder ? <p className="text-muted-foreground text-xs">{item.folder}</p> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="text-primary truncate text-xs underline">
                    {item.url}
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  disabled={pending}
                  onClick={() => void onDelete(item.id)}
                >
                  <Trash2 className="me-2 size-4" />
                  {t("delete")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

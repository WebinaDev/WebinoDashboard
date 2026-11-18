"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type Submission = {
  id: number
  payload: Record<string, unknown>
  created_at: string
  profile?: { title?: string; slug?: string | null; kind?: string }
  block?: { type?: string; payload?: { title?: string } }
}

export default function InboxPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("link_hub")
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api<{ data: Submission[] }>("/api/v1/link-hub/inbox")
      setRows(res.data ?? [])
    } catch {
      toast.error(t("load_error"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function remove(id: number) {
    try {
      await api(`/api/v1/link-hub/inbox/${id}`, { method: "DELETE" })
      await load()
    } catch {
      toast.error(t("save_error"))
    }
  }

  return (
    <PageShell title={t("inbox")} description={t("inbox_desc")}>
      {loading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("inbox_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {row.block?.payload?.title || t("form")} · {row.profile?.title || t("business")}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs" dir="ltr">
                    {row.created_at}
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(row.id)}>
                    {t("delete")}
                  </Button>
                </div>
              </div>
              <pre className="bg-muted/40 overflow-x-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(row.payload ?? {}, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}

"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { ISHOP_PAGE_TEMPLATES, ishopFooterDocument, ishopHeaderDocument } from "@/builder/templates/ishop"

type PageRow = {
  id: number
  title: string
  slug: string
  status: string
  has_draft: boolean
  has_published: boolean
}

type IndexPayload = {
  active_theme_slug: string | null
  pages: PageRow[]
}

export default function BuilderListPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder")
  const [rows, setRows] = useState<PageRow[] | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const data = await api<IndexPayload>("/api/v1/builder")
    setRows(data.pages)
    setTheme(data.active_theme_slug)
  }

  useEffect(() => {
    void load().catch(() => setRows([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function seed() {
    setBusy(true)
    try {
      const existing = new Set((rows ?? []).map((row) => row.slug))
      for (const page of ISHOP_PAGE_TEMPLATES) {
        if (existing.has(page.slug)) continue
        try {
          await api("/api/v1/builder/pages", {
            method: "POST",
            json: { title: page.title, slug: page.slug, document: page.document },
          })
        } catch {
          /* slug already exists */
        }
      }
      await api("/api/v1/builder/templates/header", {
        method: "PUT",
        json: { title: t("header"), document: ishopHeaderDocument() },
      })
      await api("/api/v1/builder/templates/footer", {
        method: "PUT",
        json: { title: t("footer"), document: ishopFooterDocument() },
      })
      toast.success(t("seed_done"))
      await load()
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setBusy(true)
    try {
      await api("/api/v1/themes/ecommerce-ishop/activate", { method: "POST" })
      toast.success(t("activated"))
      setTheme("ecommerce-ishop")
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell title={t("list_title")} description={t("list_subtitle")}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild><Link href="/dashboard/builder/new">{t("create")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/builder/chrome/header">{t("header")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/builder/chrome/footer">{t("footer")}</Link></Button>
        <Button variant="outline" disabled={busy} onClick={() => void seed()}>{t("seed")}</Button>
        <Button variant="outline" disabled={busy || theme === "ecommerce-ishop"} onClick={() => void activate()}>{t("activate")}</Button>
        <Button variant="outline" asChild><Link href="/dashboard/import/wordpress">{t("import_link")}</Link></Button>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start">
            <tr>
              <th className="p-3 text-start">{t("title")}</th>
              <th className="p-3 text-start">{t("slug")}</th>
              <th className="p-3 text-start">{t("status")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.title}</td>
                <td className="p-3">{row.slug}</td>
                <td className="p-3">{row.has_published ? t("status_published") : t("status_draft")}</td>
                <td className="p-3 text-end">
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/dashboard/builder/${row.id}`}>{t("open")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}

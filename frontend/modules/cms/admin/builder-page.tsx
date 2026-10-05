"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FilePlus2, Palette, PanelBottom, PanelTop, Settings2 } from "lucide-react"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { CLASSIC_PAGE_TEMPLATES, classicFooterDocument, classicHeaderDocument } from "@/builder/templates/classic"

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
      for (const page of CLASSIC_PAGE_TEMPLATES) {
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
        json: { title: t("header"), document: classicHeaderDocument() },
      })
      await api("/api/v1/builder/templates/footer", {
        method: "PUT",
        json: { title: t("footer"), document: classicFooterDocument() },
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
      await api("/api/v1/themes/ecommerce-classic/activate", { method: "POST" })
      toast.success(t("activated"))
      setTheme("ecommerce-classic")
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell title={t("list_title")} description={t("list_subtitle")}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild><Link href="/dashboard/builder/new"><FilePlus2 className="size-4" aria-hidden />{t("create")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/theme-builder"><Palette className="size-4" aria-hidden />{t("theme_builder")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/builder/settings"><Settings2 className="size-4" aria-hidden />{t("globals")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/builder/chrome/header"><PanelTop className="size-4" aria-hidden />{t("header")}</Link></Button>
        <Button variant="outline" asChild><Link href="/dashboard/builder/chrome/footer"><PanelBottom className="size-4" aria-hidden />{t("footer")}</Link></Button>
        <Button variant="outline" disabled={busy} onClick={() => void seed()}>{t("seed")}</Button>
        <Button variant="outline" disabled={busy || theme === "ecommerce-classic"} onClick={() => void activate()}>{t("activate")}</Button>
        <Button variant="outline" asChild><Link href="/dashboard/import/wordpress">{t("import_link")}</Link></Button>
      </div>
      {rows && rows.length === 0 ? <p className="text-muted-foreground mb-3 text-sm">{t("empty_list")}</p> : null}
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

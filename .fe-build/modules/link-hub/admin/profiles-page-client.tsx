"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import type { LinkHubProfile } from "../lib/types"

export default function ProfilesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("link_hub")
  const [rows, setRows] = useState<LinkHubProfile[]>([])
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api<LinkHubProfile[]>("/api/v1/link-hub/profiles")
      setRows(res)
    } catch {
      toast.error(t("load_error"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createProfile() {
    try {
      await api("/api/v1/link-hub/profiles", {
        method: "POST",
        json: {
          title,
          slug: slug.toLowerCase().trim(),
          is_published: false,
        },
      })
      setTitle("")
      setSlug("")
      toast.success(t("profile_created"))
      await load()
    } catch {
      toast.error(t("save_error"))
    }
  }

  async function remove(id: number) {
    try {
      await api(`/api/v1/link-hub/profiles/${id}`, { method: "DELETE" })
      await load()
    } catch {
      toast.error(t("save_error"))
    }
  }

  return (
    <PageShell title={t("profiles")} description={t("profiles_desc")}>
      <section className="mb-6 grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label>{t("profile_title")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("slug")}</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" placeholder="amir" />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={createProfile} disabled={!title || !slug}>
            {t("create_profile")}
          </Button>
        </div>
      </section>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3">
              <div>
                <div className="font-medium">
                  {row.title || t("untitled")}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({row.kind === "business" ? t("business") : row.slug})
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {row.is_published ? t("published") : t("draft")} · {row.blocks_count ?? 0} {t("blocks")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link
                    href={
                      row.kind === "business"
                        ? "/dashboard/link-hub/page"
                        : `/dashboard/link-hub/profiles/${row.id}`
                    }
                  >
                    {t("edit")}
                  </Link>
                </Button>
                {row.kind === "member" ? (
                  <Button type="button" size="sm" variant="destructive" onClick={() => remove(row.id)}>
                    {t("delete")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}

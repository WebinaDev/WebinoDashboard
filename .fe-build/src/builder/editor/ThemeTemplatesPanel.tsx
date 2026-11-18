"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Star, X } from "lucide-react"

import { THEME_KIND_ICONS } from "@/builder/theme/icons"
import type { ThemeKind } from "@/builder/theme/context"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { builderThemeSettingsHref } from "@/lib/page-builder-nav"

type TemplateRow = {
  id: number
  kind: string
  title: string | null
  is_default: boolean
  has_draft: boolean
  has_published: boolean
}
type KindGroup = { kind: ThemeKind; label: string; templates: TemplateRow[] }

type Props = {
  onClose: () => void
}

/** Theme template picker inside the page builder — opens visual editors without confusing nav. */
export function ThemeTemplatesPanel({ onClose }: Props) {
  const t = useTranslations("theme_builder")
  const tb = useTranslations("builder")
  const [kinds, setKinds] = useState<KindGroup[]>([])
  const [active, setActive] = useState<ThemeKind>("header")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ kinds: KindGroup[] }>("/api/v1/theme-builder")
      .then((data) => setKinds(data.kinds ?? []))
      .catch(() => setKinds([]))
  }, [])

  const group = kinds.find((item) => item.kind === active)

  async function create() {
    setBusy(true)
    try {
      const row = await api<TemplateRow>("/api/v1/theme-builder/templates", {
        method: "POST",
        json: { kind: active, title: t("new_title") },
      })
      window.location.assign(`/dashboard/theme-builder/${active}/${row.id}`)
    } catch {
      toast.error(t("save_failed"))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal aria-label={t("title")}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={tb("back")} onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white text-[#0C2D63] shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            <p className="text-muted-foreground text-xs">{tb("theme_panel_hint")}</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={tb("back")}>
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex flex-wrap gap-2 border-b p-3">
          {kinds.map((item) => {
            const Icon = THEME_KIND_ICONS[item.kind]
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => setActive(item.kind)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${active === item.kind ? "border-[#E16BA6] bg-[#E16BA6]/10 text-[#E16BA6]" : ""}`}
              >
                <Icon className="size-3.5" aria-hidden />
                {t(`kinds.${item.kind}`)}
              </button>
            )
          })}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void create()}>
              <Plus className="size-3.5" aria-hidden />
              {t("create")}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={builderThemeSettingsHref()}>{tb("theme_settings_link")}</Link>
            </Button>
          </div>
          {(group?.templates ?? []).length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
          {(group?.templates ?? []).map((row) => (
            <article key={row.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{row.title}</strong>
                {row.is_default ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">
                    <Star className="size-3" aria-hidden />
                    {t("default")}
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs">{row.has_published ? t("published") : t("draft")}</span>
              </div>
              <Button className="mt-2" size="sm" asChild>
                <Link href={`/dashboard/theme-builder/${row.kind}/${row.id}`}>{t("edit")}</Link>
              </Button>
            </article>
          ))}
        </div>
      </aside>
    </div>
  )
}

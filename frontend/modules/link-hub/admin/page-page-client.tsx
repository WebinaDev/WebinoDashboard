"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { BlockEditor } from "../lib/BlockEditor"
import type { LinkHubBlock, LinkHubOverview, LinkHubProfile } from "../lib/types"

type Props = {
  route: ResolvedAdminRoute
  mode: "business" | "member"
  profileId?: number
}

export default function PageEditorClient({ route, mode, profileId }: Props) {
  const t = useTranslations("link_hub")
  const tCommon = useTranslations("common")
  const [profile, setProfile] = useState<LinkHubProfile | null>(null)
  const [blocks, setBlocks] = useState<LinkHubBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const idFromRoute = profileId ?? (route.params?.id ? Number(route.params.id) : undefined)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (mode === "business") {
          const res = await api<LinkHubOverview>("/api/v1/link-hub/overview")
          if (cancelled) return
          setProfile(res.business)
          setBlocks(
            (res.business.blocks ?? []).map((b, i) => ({
              id: b.id,
              type: b.type,
              sort: b.sort ?? i,
              is_visible: b.is_visible !== false,
              payload: b.payload ?? {},
            })),
          )
        } else if (idFromRoute) {
          const res = await api<LinkHubProfile>(`/api/v1/link-hub/profiles/${idFromRoute}`)
          if (cancelled) return
          setProfile(res)
          setBlocks(
            (res.blocks ?? []).map((b, i) => ({
              id: b.id,
              type: b.type,
              sort: b.sort ?? i,
              is_visible: b.is_visible !== false,
              payload: b.payload ?? {},
            })),
          )
        }
      } catch {
        toast.error(t("load_error"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, idFromRoute, t])

  async function save() {
    if (!profile) return
    setSaving(true)
    try {
      await api(`/api/v1/link-hub/profiles/${profile.id}`, {
        method: "PATCH",
        json: {
          title: profile.title,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          is_published: profile.is_published,
          slug: profile.kind === "member" ? profile.slug : undefined,
        },
      })
      await api(`/api/v1/link-hub/profiles/${profile.id}/blocks`, {
        method: "PUT",
        json: {
          blocks: blocks.map((b, i) => ({
            id: b.id,
            type: b.type,
            sort: i,
            is_visible: b.is_visible,
            payload: b.payload,
          })),
        },
      })
      toast.success(tCommon("saved"))
    } catch {
      toast.error(t("save_error"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title={mode === "business" ? t("edit_page") : t("edit_profile")}
      description={t("editor_desc")}
      actions={
        <Button type="button" onClick={save} disabled={saving || loading || !profile}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      }
    >
      {loading || !profile ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("profile_title")}</Label>
              <Input
                value={profile.title ?? ""}
                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
              />
            </div>
            {profile.kind === "member" ? (
              <div className="space-y-1">
                <Label>{t("slug")}</Label>
                <Input
                  value={profile.slug ?? ""}
                  onChange={(e) => setProfile({ ...profile, slug: e.target.value })}
                  dir="ltr"
                />
              </div>
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("avatar")}</Label>
              <Input
                value={profile.avatar_url ?? ""}
                onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("bio")}</Label>
              <textarea
                className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                value={profile.bio ?? ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.is_published}
                onChange={(e) => setProfile({ ...profile, is_published: e.target.checked })}
              />
              {t("published")}
            </label>
          </section>
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border p-4">
              <h2 className="mb-3 font-semibold">{t("blocks")}</h2>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </section>
            <section className="rounded-2xl border p-4">
              <h2 className="mb-3 font-semibold">{t("preview")}</h2>
              <div className="mx-auto w-full max-w-[22rem] rounded-[1.75rem] border bg-slate-100 p-3 shadow-inner">
                <div className="overflow-hidden rounded-[1.35rem] bg-white">
                  <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <div className="bg-primary text-primary-foreground flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold">
                        {(profile.title || "?").slice(0, 1)}
                      </div>
                    )}
                    <div className="font-bold">{profile.title || t("untitled")}</div>
                    {profile.bio ? (
                      <p className="text-muted-foreground line-clamp-3 text-xs leading-5">{profile.bio}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2 px-3 pb-4">
                    {blocks
                      .filter((b) => b.is_visible)
                      .map((b, i) => (
                        <div
                          key={b.id ?? i}
                          className="rounded-xl border px-3 py-2.5 text-center text-sm font-medium"
                        >
                          {previewLabel(b)}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </PageShell>
  )
}

function previewLabel(block: LinkHubBlock): string {
  const p = block.payload
  if (block.type === "link") return String(p.label || "لینک")
  if (block.type === "contact") return "تماس"
  if (block.type === "form") return String(p.title || "فرم")
  if (block.type === "faq") return String(p.title || "سوالات متداول")
  if (block.type === "event") return String(p.title || "رویداد")
  return block.type
}

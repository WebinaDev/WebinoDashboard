"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type NavItem = { id: string; label: string; href: string }
type NavMenu = { id: string; location: string; name: string; items: NavItem[] }
type Payload = { menus?: NavMenu[] }

const LOCATIONS = ["header", "footer", "mobile"] as const

function uid() {
  return `m-${Math.random().toString(36).slice(2, 9)}`
}

export function MenusSettingsPanel() {
  const t = useTranslations("settings_hub.menus")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<Payload>("site", "menus")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  const menus = draft.menus ?? []

  function setMenus(next: NavMenu[]) {
    setDraft({ ...draft, menus: next })
  }

  function addMenu() {
    setMenus([
      ...menus,
      { id: uid(), location: "header", name: t("new_menu"), items: [{ id: uid(), label: t("home"), href: "/" }] },
    ])
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={addMenu}>
              <Plus className="size-4" aria-hidden />
              {t("add_menu")}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/dashboard/builder/chrome/header">{t("edit_header")}</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/dashboard/builder/chrome/footer">{t("edit_footer")}</Link>
            </Button>
          </div>
          {menus.length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
          {menus.map((menu, mi) => (
            <div key={menu.id} className="space-y-3 rounded-xl border p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <Label>{t("name")}</Label>
                  <Input
                    value={menu.name}
                    onChange={(e) => {
                      const next = menus.slice()
                      next[mi] = { ...menu, name: e.target.value }
                      setMenus(next)
                    }}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <Label>{t("location")}</Label>
                  <select
                    className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                    value={menu.location}
                    onChange={(e) => {
                      const next = menus.slice()
                      next[mi] = { ...menu, location: e.target.value }
                      setMenus(next)
                    }}
                  >
                    {LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{t(`loc_${loc}`)}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setMenus(menus.filter((_, i) => i !== mi))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    {t("remove_menu")}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold">{t("items")}</div>
                {menu.items.map((item, ii) => (
                  <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      placeholder={t("item_label")}
                      value={item.label}
                      onChange={(e) => {
                        const next = menus.slice()
                        const items = menu.items.slice()
                        items[ii] = { ...item, label: e.target.value }
                        next[mi] = { ...menu, items }
                        setMenus(next)
                      }}
                    />
                    <Input
                      dir="ltr"
                      placeholder="/"
                      value={item.href}
                      onChange={(e) => {
                        const next = menus.slice()
                        const items = menu.items.slice()
                        items[ii] = { ...item, href: e.target.value }
                        next[mi] = { ...menu, items }
                        setMenus(next)
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("remove_item")}
                      onClick={() => {
                        const next = menus.slice()
                        next[mi] = { ...menu, items: menu.items.filter((_, i) => i !== ii) }
                        setMenus(next)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = menus.slice()
                    next[mi] = { ...menu, items: [...menu.items, { id: uid(), label: "", href: "/" }] }
                    setMenus(next)
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {t("add_item")}
                </Button>
              </div>
            </div>
          ))}
          <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
        </CardContent>
      </Card>
    </div>
  )
}

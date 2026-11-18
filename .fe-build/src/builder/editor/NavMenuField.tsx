"use client"

import { ExternalLink, Plus, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { MenuTreeEditor } from "@/components/nav-menus/MenuTreeEditor"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { dashboardPath } from "@/kernel/paths"
import { primeNavMenu, type NavMenu, type NavMenuItem } from "@/lib/nav-menus"
import { fetchNavMenus, saveNavMenu } from "@/lib/nav-menus-admin"

/** Shared list across all nav-menu fields in the inspector; refreshed after saves. */
let shared: NavMenu[] | null = null
const subs = new Set<(m: NavMenu[]) => void>()
function publish(list: NavMenu[]) {
  shared = list
  subs.forEach((s) => s(list))
}
async function refresh() {
  publish(await fetchNavMenus())
}

/**
 * Builder inspector control: pick a menu from «منوها» and edit its items inline. Saving writes the same
 * /nav-menus record the admin Menus page edits, so both stay in sync (and the canvas preview updates live).
 */
export function NavMenuField({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const [menus, setMenus] = useState<NavMenu[] | null>(shared)
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<NavMenuItem[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    subs.add(setMenus)
    if (!shared) void refresh().catch(() => publish([]))
    return () => {
      subs.delete(setMenus)
    }
  }, [])

  const current = menus?.find((m) => m.slug === value)
  useEffect(() => {
    setItems(current ? current.items ?? [] : null)
  }, [current])

  const change = (next: NavMenuItem[]) => {
    setItems(next)
    if (current) primeNavMenu(current.slug, { id: current.id, name: current.name, items: next })
  }

  const save = async () => {
    if (!current || !items) return
    setSaving(true)
    try {
      const saved = await saveNavMenu({ ...current, items })
      publish((menus ?? []).map((m) => (m.id === saved.id ? saved : m)))
      toast.success("منو ذخیره شد")
    } catch (e) {
      toast.error(getApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const create = async () => {
    setSaving(true)
    try {
      const saved = await saveNavMenu({ name: `منوی ${((menus?.length ?? 0) + 1).toLocaleString("fa-IR")}`, items: [], locations: [] })
      publish([...(menus ?? []), saved])
      onChange(saved.slug)
      setEditing(true)
    } catch (e) {
      toast.error(getApiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex gap-1">
        <select className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— پیوندهای همین ابزارک / پیش‌فرض —</option>
          {(menus ?? []).map((m) => (
            <option key={m.id} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
        <Button type="button" size="icon" variant="outline" className="size-8" title="منوی جدید" disabled={saving} onClick={create}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      {current ? (
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setEditing((v) => !v)}>
            {editing ? "بستن ویرایش آیتم‌ها" : `ویرایش آیتم‌ها (${(items ?? []).length.toLocaleString("fa-IR")})`}
          </button>
          <a className="ms-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" href={dashboardPath("menus")} target="_blank" rel="noreferrer">
            بخش منوها <ExternalLink className="size-3" />
          </a>
        </div>
      ) : null}
      {current && editing && items ? (
        <div className="rounded-md border bg-muted/30 p-2">
          <MenuTreeEditor compact items={items} onChange={change} />
          <Button type="button" size="sm" className="mt-2 w-full" disabled={saving} onClick={save}>
            <Save className="size-3.5" /> {saving ? "در حال ذخیره…" : "ذخیره در منوها"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

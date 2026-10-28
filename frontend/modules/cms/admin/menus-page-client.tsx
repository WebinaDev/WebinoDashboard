"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderTree, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { MenuTreeEditor } from "@/components/nav-menus/MenuTreeEditor"
import { QueryErrorState } from "@/components/QueryErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { NAV_LOCATIONS, type NavMenu } from "@/lib/nav-menus"
import { deleteNavMenu, fetchNavMenus, NAV_MENUS_KEY, navItemsFromCategories, saveNavMenu } from "@/lib/nav-menus-admin"

type Draft = Partial<NavMenu> & { name: string }

export default function MenusPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const qc = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const list = useQuery({ queryKey: NAV_MENUS_KEY, queryFn: fetchNavMenus })
  const [selected, setSelected] = useState<number | "new" | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)

  const menus = useMemo(() => list.data ?? [], [list.data])

  useEffect(() => {
    if (selected === null && menus.length) setSelected(menus[0].id)
  }, [menus, selected])

  useEffect(() => {
    if (selected === "new") {
      setDraft({ name: "منوی جدید", items: [], locations: [] })
      setDirty(true)
    } else if (typeof selected === "number") {
      const m = menus.find((x) => x.id === selected)
      if (m) {
        setDraft({ ...m, items: m.items ?? [], locations: m.locations ?? [] })
        setDirty(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, list.dataUpdatedAt])

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: saveNavMenu,
    onSuccess: async (m) => {
      toast.success("منو ذخیره شد")
      await qc.invalidateQueries({ queryKey: NAV_MENUS_KEY })
      setSelected(m.id)
      setDirty(false)
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: deleteNavMenu,
    onSuccess: async () => {
      toast.success("منو حذف شد")
      setSelected(null)
      setDraft(null)
      await qc.invalidateQueries({ queryKey: NAV_MENUS_KEY })
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  })

  const fillFromCategories = async () => {
    try {
      const items = await navItemsFromCategories()
      if (!items.length) return void toast.info("دسته‌بندی‌ای یافت نشد")
      const apply = () => patch({ items: items.map((i) => ({ ...i, mega: true })) })
      if (draft?.items?.length) confirm({ title: "جایگزینی آیتم‌ها", description: "آیتم‌های فعلی با درخت دسته‌بندی محصولات جایگزین شوند؟", intent: "action", onConfirm: apply })
      else apply()
    } catch (e) {
      toast.error(getApiErrorMessage(e))
    }
  }

  const owner = (loc: string) => menus.find((m) => m.id !== draft?.id && (m.locations ?? []).includes(loc))

  if (list.isError) return <QueryErrorState onRetry={() => list.refetch()} />

  return (
    <div dir="rtl" className="space-y-4">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">منوها</h1>
          <p className="text-sm text-muted-foreground">منوهای هدر، فوتر، موبایل و مگامنو را بسازید و به جایگاه‌های قالب اختصاص دهید. این منوها در صفحه‌ساز (هدر/فوتر) هم قابل ویرایش‌اند.</p>
        </div>
        <Button onClick={() => setSelected("new")}>
          <Plus className="size-4" /> منوی جدید
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">منوهای شما</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {list.isLoading ? <p className="p-2 text-xs text-muted-foreground">در حال بارگذاری…</p> : null}
            {!list.isLoading && !menus.length ? <p className="p-2 text-xs text-muted-foreground">هنوز منویی نساخته‌اید. تا وقتی منویی به جایگاهی اختصاص نیابد، فروشگاه از منوی پیش‌فرض قالب استفاده می‌کند.</p> : null}
            {menus.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m.id)}
                className={`block w-full rounded-md px-2 py-1.5 text-start text-sm ${selected === m.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
              >
                {m.name}
                {(m.locations ?? []).length ? (
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {(m.locations ?? []).map((l) => NAV_LOCATIONS.find((x) => x.key === l)?.label ?? l).join("، ")}
                  </span>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>

        {draft ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
            <Card>
              <CardHeader className="flex-row flex-wrap items-end gap-3 space-y-0 pb-3">
                <div className="min-w-48 flex-1 space-y-1">
                  <Label>نام منو</Label>
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div className="w-40 space-y-1">
                  <Label>نامک</Label>
                  <Input dir="ltr" value={draft.slug ?? ""} placeholder="خودکار" onChange={(e) => patch({ slug: e.target.value })} />
                </div>
                <Button variant="outline" size="sm" onClick={fillFromCategories}>
                  <FolderTree className="size-4" /> پرکردن از دسته‌بندی‌ها (مگامنو)
                </Button>
              </CardHeader>
              <CardContent>
                <MenuTreeEditor items={draft.items ?? []} onChange={(items) => patch({ items })} />
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">جایگاه نمایش</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {NAV_LOCATIONS.map((loc) => {
                  const checked = (draft.locations ?? []).includes(loc.key)
                  const other = owner(loc.key)
                  return (
                    <label key={loc.key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={(e) => patch({ locations: e.target.checked ? [...(draft.locations ?? []), loc.key] : (draft.locations ?? []).filter((l) => l !== loc.key) })}
                      />
                      <span>
                        {loc.label}
                        {other ? <span className="block text-[11px] text-amber-600">فعلاً: {other.name} (با انتخاب، جایگزین می‌شود)</span> : null}
                      </span>
                    </label>
                  )
                })}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" disabled={save.isPending || !dirty || !draft.name.trim()} onClick={() => save.mutate(draft)}>
                    <Save className="size-4" /> {save.isPending ? "در حال ذخیره…" : "ذخیره منو"}
                  </Button>
                  {draft.id ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive"
                      onClick={() =>
                        confirm({ title: "حذف منو", description: `«${draft.name}» حذف شود؟ جایگاه‌های آن به منوی پیش‌فرض قالب برمی‌گردند.`, destructive: true, onConfirm: () => remove.mutate(draft.id!) })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}

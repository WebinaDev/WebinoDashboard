"use client"

import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, GripVertical, IndentDecrease, IndentIncrease, Plus, Trash2 } from "lucide-react"
import { useEffect, useState, type DragEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import {
  NAV_TYPES,
  NAV_VISIBILITY,
  navItemHref,
  newNavItemId,
  type NavItemType,
  type NavMenuItem,
  type NavVisibility,
} from "@/lib/nav-menus"

/**
 * WordPress-style menu tree editor (drag-and-drop reorder + nesting, max 3 levels).
 * Shared by the admin «منوها» page and the page-builder nav widget inspector so both edit the same data.
 */
const MAX_DEPTH = 3

type Path = number[]
type DropPos = "before" | "after" | "inside"

function getAt(items: NavMenuItem[], path: Path): NavMenuItem | undefined {
  let list = items
  let node: NavMenuItem | undefined
  for (const i of path) {
    node = list[i]
    if (!node) return undefined
    list = node.children ?? []
  }
  return node
}

function removeAt(items: NavMenuItem[], path: Path): [NavMenuItem[], NavMenuItem | undefined] {
  const [head, ...rest] = path
  if (!rest.length) {
    const copy = [...items]
    const [removed] = copy.splice(head, 1)
    return [copy, removed]
  }
  const copy = [...items]
  const [children, removed] = removeAt(copy[head].children ?? [], rest)
  copy[head] = { ...copy[head], children }
  return [copy, removed]
}

function insertAt(items: NavMenuItem[], path: Path, node: NavMenuItem): NavMenuItem[] {
  const [head, ...rest] = path
  const copy = [...items]
  if (!rest.length) {
    copy.splice(head, 0, node)
    return copy
  }
  copy[head] = { ...copy[head], children: insertAt(copy[head].children ?? [], rest, node) }
  return copy
}

function updateAt(items: NavMenuItem[], path: Path, patch: Partial<NavMenuItem>): NavMenuItem[] {
  const [head, ...rest] = path
  const copy = [...items]
  copy[head] = rest.length ? { ...copy[head], children: updateAt(copy[head].children ?? [], rest, patch) } : { ...copy[head], ...patch }
  return copy
}

function depthOf(node: NavMenuItem): number {
  return 1 + Math.max(0, ...(node.children ?? []).map(depthOf))
}

const samePrefix = (a: Path, b: Path) => a.length <= b.length && a.every((v, i) => b[i] === v)

/** Move `from` to a drop position relative to `to`; returns null when invalid (into itself / too deep). */
export function moveNavItem(items: NavMenuItem[], from: Path, to: Path, pos: DropPos): NavMenuItem[] | null {
  if (samePrefix(from, to)) return null
  const node = getAt(items, from)
  if (!node) return null
  const targetDepth = pos === "inside" ? to.length + 1 : to.length
  if (targetDepth - 1 + depthOf(node) > MAX_DEPTH) return null
  // Compute the destination path before removal, then adjust for the removed index.
  let dest: Path = pos === "inside" ? [...to, (getAt(items, to)?.children ?? []).length] : [...to.slice(0, -1), to[to.length - 1] + (pos === "after" ? 1 : 0)]
  const [without] = removeAt(items, from)
  const fl = from.length - 1
  if (dest.length > fl && from.slice(0, fl).every((v, i) => dest[i] === v) && dest[fl] > from[fl]) {
    dest = [...dest]
    dest[fl] -= 1
  }
  return insertAt(without, dest, node)
}

type SourceRow = { id: number; label: string; slug: string }

function SourcePicker({ type, onPick }: { type: NavItemType; onPick: (row: SourceRow) => void }) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (type === "custom") return
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      api<{ data: SourceRow[] }>(`/api/v1/nav-menus/sources?type=${type}&q=${encodeURIComponent(q)}`)
        .then((r) => alive && setRows(r.data ?? []))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [type, q])
  if (type === "custom") return null
  return (
    <div className="space-y-1">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو…" className="h-8 text-xs" />
      <div className="max-h-40 overflow-auto rounded border bg-background text-xs">
        {loading ? <div className="p-2 text-muted-foreground">در حال بارگذاری…</div> : null}
        {!loading && !rows.length ? <div className="p-2 text-muted-foreground">موردی یافت نشد</div> : null}
        {rows.map((r) => (
          <button key={r.id} type="button" className="block w-full truncate px-2 py-1 text-start hover:bg-muted" onClick={() => onPick(r)}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const field = "h-8 w-full rounded-md border bg-background px-2 text-xs"

function ItemFields({ item, onPatch }: { item: NavMenuItem; onPatch: (p: Partial<NavMenuItem>) => void }) {
  return (
    <div className="grid gap-2 border-t p-2 sm:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span>عنوان</span>
        <Input className="h-8 text-xs" value={item.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </label>
      <label className="space-y-1 text-xs">
        <span>نوع لینک</span>
        <select className={field} value={item.type} onChange={(e) => onPatch({ type: e.target.value as NavItemType, ref: undefined, ref_id: undefined })}>
          {NAV_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {item.type === "custom" ? (
        <label className="space-y-1 text-xs sm:col-span-2">
          <span>آدرس (مثلاً ‎/about یا https://…)</span>
          <Input dir="ltr" className="h-8 text-xs" value={item.url ?? ""} onChange={(e) => onPatch({ url: e.target.value.replace(/^\/pages\//, "/") })} />
        </label>
      ) : (
        <div className="space-y-1 text-xs sm:col-span-2">
          <span>
            مقصد: <b dir="ltr">{item.ref ? navItemHref(item) : "—"}</b>
          </span>
          <SourcePicker type={item.type} onPick={(r) => onPatch({ ref: r.slug, ref_id: r.id, label: item.label || r.label })} />
        </div>
      )}
      <label className="space-y-1 text-xs">
        <span>آیکن (نام lucide یا آدرس تصویر)</span>
        <Input dir="ltr" className="h-8 text-xs" value={item.icon ?? ""} onChange={(e) => onPatch({ icon: e.target.value || undefined })} />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-1 text-xs">
        <label className="space-y-1">
          <span>نشان (مثلاً «جدید»)</span>
          <Input className="h-8 text-xs" value={item.badge ?? ""} onChange={(e) => onPatch({ badge: e.target.value || undefined })} />
        </label>
        <label className="space-y-1">
          <span>رنگ</span>
          <input type="color" className="h-8 w-10 rounded border" value={item.badge_color ?? "#ef4444"} onChange={(e) => onPatch({ badge_color: e.target.value })} />
        </label>
      </div>
      <label className="space-y-1 text-xs">
        <span>نمایش</span>
        <select className={field} value={item.visibility ?? "all"} onChange={(e) => onPatch({ visibility: e.target.value as NavVisibility })}>
          {NAV_VISIBILITY.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!item.new_tab} onChange={(e) => onPatch({ new_tab: e.target.checked || undefined })} />
          باز شدن در تب جدید
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!item.mega} onChange={(e) => onPatch({ mega: e.target.checked || undefined })} />
          مگامنو
        </label>
      </div>
    </div>
  )
}

export function MenuTreeEditor({ items, onChange, compact = false }: { items: NavMenuItem[]; onChange: (items: NavMenuItem[]) => void; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const [drag, setDrag] = useState<Path | null>(null)
  const [over, setOver] = useState<{ key: string; pos: DropPos } | null>(null)

  const addRoot = () => {
    const it: NavMenuItem = { id: newNavItemId(), label: "آیتم جدید", type: "custom", url: "/" }
    onChange([...items, it])
    setOpen(it.id)
  }

  const onDragOver = (e: DragEvent, path: Path) => {
    if (!drag) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    // In RTL, dragging further to the inline-start (left) nests under the hovered row.
    const indent = document.documentElement.dir === "rtl" ? r.right - e.clientX > 48 : e.clientX - r.left > 48
    const pos: DropPos = y < 0.3 ? "before" : y > 0.7 && !indent ? "after" : path.length < MAX_DEPTH ? "inside" : "after"
    setOver({ key: path.join("."), pos })
  }

  const onDrop = (e: DragEvent, path: Path) => {
    e.preventDefault()
    if (drag && over) {
      const next = moveNavItem(items, drag, path, over.pos)
      if (next) onChange(next)
    }
    setDrag(null)
    setOver(null)
  }

  const shift = (path: Path, dir: "up" | "down" | "in" | "out") => {
    const i = path[path.length - 1]
    let next: NavMenuItem[] | null = null
    if (dir === "up" && i > 0) next = moveNavItem(items, path, [...path.slice(0, -1), i - 1], "before")
    if (dir === "down") {
      const sib = [...path.slice(0, -1), i + 1]
      if (getAt(items, sib)) next = moveNavItem(items, path, sib, "after")
    }
    if (dir === "in" && i > 0) next = moveNavItem(items, path, [...path.slice(0, -1), i - 1], "inside")
    if (dir === "out" && path.length > 1) next = moveNavItem(items, path, path.slice(0, -1), "after")
    if (next) onChange(next)
  }

  const renderList = (list: NavMenuItem[], parent: Path) => (
    <ul className={parent.length ? "ms-5 mt-1 space-y-1 border-s ps-2" : "space-y-1"}>
      {list.map((it, i) => {
        const path = [...parent, i]
        const key = path.join(".")
        const isOver = over?.key === key
        const expanded = open === it.id
        return (
          <li key={it.id}>
            <div
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = "move"
                setDrag(path)
              }}
              onDragEnd={() => {
                setDrag(null)
                setOver(null)
              }}
              onDragOver={(e) => {
                e.stopPropagation()
                onDragOver(e, path)
              }}
              onDrop={(e) => {
                e.stopPropagation()
                onDrop(e, path)
              }}
              className={[
                "rounded-md border bg-card",
                isOver && over?.pos === "before" ? "border-t-2 border-t-primary" : "",
                isOver && over?.pos === "after" ? "border-b-2 border-b-primary" : "",
                isOver && over?.pos === "inside" ? "ring-2 ring-primary/50" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-1 p-1.5 text-sm">
                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-start" onClick={() => setOpen(expanded ? null : it.id)}>
                  {expanded ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
                  <span className="truncate font-medium">{it.label || "بدون عنوان"}</span>
                  {it.badge ? (
                    <span className="rounded px-1 text-[10px] text-white" style={{ background: it.badge_color || "#ef4444" }}>
                      {it.badge}
                    </span>
                  ) : null}
                  {!compact ? <span className="truncate text-xs text-muted-foreground">{NAV_TYPES.find((t) => t.key === it.type)?.label}</span> : null}
                  {it.visibility && it.visibility !== "all" ? <span className="text-[10px] text-amber-600">{NAV_VISIBILITY.find((v) => v.key === it.visibility)?.label}</span> : null}
                </button>
                <Button type="button" size="icon" variant="ghost" className="size-7" title="بالا" onClick={() => shift(path, "up")}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" title="پایین" onClick={() => shift(path, "down")}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" title="زیرمنوی آیتم قبلی" onClick={() => shift(path, "in")}>
                  <IndentIncrease className="size-3.5 rtl:-scale-x-100" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" title="خروج از زیرمنو" onClick={() => shift(path, "out")}>
                  <IndentDecrease className="size-3.5 rtl:-scale-x-100" />
                </Button>
                {path.length < MAX_DEPTH ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    title="افزودن زیرمنو"
                    onClick={() => {
                      const child: NavMenuItem = { id: newNavItemId(), label: "زیرمنو", type: "custom", url: "/" }
                      onChange(updateAt(items, path, { children: [...(it.children ?? []), child] }))
                      setOpen(child.id)
                    }}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                ) : null}
                <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" title="حذف" onClick={() => onChange(removeAt(items, path)[0])}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {expanded ? <ItemFields item={it} onPatch={(p) => onChange(updateAt(items, path, p))} /> : null}
            </div>
            {it.children?.length ? renderList(it.children, path) : null}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div dir="rtl" className="space-y-2">
      {items.length ? renderList(items, []) : <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">این منو هنوز آیتمی ندارد.</p>}
      <Button type="button" variant="outline" size="sm" onClick={addRoot}>
        <Plus className="size-4" /> افزودن آیتم
      </Button>
      <p className="text-[11px] text-muted-foreground">برای جابه‌جایی بکشید و رها کنید؛ رها کردن روی وسط یک آیتم آن را زیرمنو می‌کند.</p>
    </div>
  )
}

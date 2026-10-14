"use client"

import { ChevronDown, Plus, ShoppingBag, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cartSnapshot, subscribeCart, type CartLine } from "../cart"
import { mapApiProduct, type ShopProduct } from "../catalog"
import { linkAttrs, parseRows, propBool, propNum, propStr } from "../props"
import { useServerCart } from "../storefront/actions"
import { StoreProductCard } from "../storefront/ui"
import { fetchCatalogPayload } from "../storefront/use-catalog"
import type { WidgetNode } from "../types"
import { buildNavTree, type NavItem } from "../nav-tree"
import { WIcon } from "./extra-widgets"
import { useBuilderRuntime } from "./runtime"

function useMoney() {
  const t = useTranslations("builder")
  const locale = useLocale()
  return (amount: number) => `${formatNumber(Math.max(0, Math.round(amount)), normalizeUiLocale(locale))} ${t("currency_toman")}`
}

function safeHref(href: string): string {
  const v = href.trim()
  if (!v) return "#"
  if (v.startsWith("/") || v.startsWith("#") || /^https?:\/\//i.test(v) || /^(mailto|tel):/i.test(v)) return v
  return "#"
}

/* ------------------------------------------------------------ loop grid */

type LoopItem = { key: string; href: string; title: string; image?: string | null; excerpt?: string; product?: ShopProduct }

/** Loop Grid / Carousel over products or posts with a query builder and pagination (none / load more / numbers). */
export function LoopGridWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const source = propStr(widget.props, "source", "products")
  const perPage = Math.max(1, Math.min(24, propNum(widget.props, "perPage", 8)))
  const columns = Math.max(1, Math.min(6, propNum(widget.props, "columns", 4)))
  const layout = propStr(widget.props, "layout", "grid")
  const pagination = propStr(widget.props, "pagination", "none")
  const offset = pagination === "none" ? Math.max(0, Math.min(24, propNum(widget.props, "offset", 0))) : 0
  const exclude = useMemo(() => new Set(propStr(widget.props, "exclude", "").split(/[,،\s]+/).filter(Boolean)), [widget.props])
  const runtime = useBuilderRuntime()
  const query = useMemo(() => {
    const params = new URLSearchParams({ per_page: String(perPage + offset), sort: propStr(widget.props, "sort", "newest") })
    const category = propStr(widget.props, "category", "") || (propBool(widget.props, "currentQuery") ? runtime.categorySlug ?? "" : "")
    if (category) params.set("category", category)
    const brand = propStr(widget.props, "brand", "")
    if (brand && source === "products") params.set("brand", brand)
    if (propBool(widget.props, "onSale") && source === "products") params.set("on_sale", "1")
    if (propBool(widget.props, "inStock") && source === "products") params.set("in_stock", "1")
    return params
  }, [offset, perPage, runtime.categorySlug, source, widget.props])
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<LoopItem[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setPage(1)
  }, [query])

  useEffect(() => {
    let cancel = false
    const params = new URLSearchParams(query)
    params.set("page", String(page))
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const job: Promise<{ rows: LoopItem[]; total: number }> =
      source === "posts"
        ? fetch(`${base}/api/v1/public/blog?${params}`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
              const rows: { slug: string; title: string; excerpt?: string; cover_url?: string }[] = Array.isArray(json?.data) ? json.data : []
              return { rows: rows.map((p) => ({ key: p.slug, href: `/blog/${p.slug}`, title: p.title, image: p.cover_url, excerpt: p.excerpt })), total: Number(json?.total ?? rows.length) || 0 }
            })
            .catch(() => ({ rows: [], total: 0 }))
        : fetchCatalogPayload(params.toString()).then((payload) => ({
            rows: (payload?.items ?? []).map((p) => ({ key: p.slug, href: `/product/${p.slug}`, title: p.name, image: p.image, product: p })),
            total: payload?.total ?? 0,
          }))
    void job.then(({ rows, total: count }) => {
      if (cancel) return
      const visible = rows.slice(offset).filter((row) => !exclude.has(row.key))
      setTotal(count)
      setItems((current) => (pagination === "load_more" && page > 1 && current ? [...current, ...visible] : visible))
    })
    return () => {
      cancel = true
    }
  }, [exclude, offset, page, pagination, query, source])

  if (items === null) return editing ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : null
  if (!items.length) return editing ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-foreground/60">موردی با این کوئری پیدا نشد.</p> : null
  const pages = Math.max(1, Math.ceil(total / perPage))
  const title = propStr(widget.props, "title", "")
  const card = (item: LoopItem) =>
    item.product ? (
      <StoreProductCard key={item.key} product={item.product} />
    ) : (
      <Link key={item.key} href={item.href} className="block overflow-hidden rounded-2xl border border-border bg-card">
        <span className="block aspect-video bg-muted">{item.image ? <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
        <span className="block p-4">
          <strong className="line-clamp-2 text-sm font-extrabold text-foreground">{item.title}</strong>
          {item.excerpt ? <span className="mt-1 line-clamp-2 block text-xs leading-6 text-foreground/70">{item.excerpt}</span> : null}
        </span>
      </Link>
    )
  return (
    <section aria-label={title || undefined}>
      {title ? <h2 className="wb-type-h2 mb-3">{title}</h2> : null}
      {layout === "carousel" ? (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" tabIndex={0} aria-roledescription="carousel">
          {items.map((item) => <div key={item.key} className="shrink-0 snap-start" style={{ width: `calc((100% - ${(columns - 1) * 0.75}rem) / ${columns})`, minWidth: 180 }}>{card(item)}</div>)}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.round(960 / columns)}px), 1fr))` }}>
          {items.map(card)}
        </div>
      )}
      {pagination === "load_more" && page < pages ? (
        <div className="mt-4 text-center"><button type="button" className="wb-btn wb-btn-outline" onClick={() => setPage(page + 1)}>نمایش بیشتر</button></div>
      ) : null}
      {pagination === "numbers" && pages > 1 ? (
        <nav className="mt-4 flex flex-wrap justify-center gap-1" aria-label="صفحه‌بندی">
          {Array.from({ length: Math.min(pages, 10) }, (_, index) => index + 1).map((n) => (
            <button key={n} type="button" aria-current={n === page ? "page" : undefined} className={`size-9 rounded-lg border text-sm ${n === page ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => setPage(n)}>
              {n.toLocaleString("fa-IR")}
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------ image box / flip box */

export function ImageBoxWidget({ widget }: { widget: WidgetNode }) {
  const image = propStr(widget.props, "image", "")
  const href = propStr(widget.props, "href", "")
  const side = propStr(widget.props, "layout", "top") === "side"
  const body = (
    <div className={`flex h-full gap-3 overflow-hidden rounded-2xl border border-border bg-card ${side ? "items-center" : "flex-col"}`}>
      {image ? <img src={image} alt={propStr(widget.props, "alt", "")} loading="lazy" className={side ? "h-28 w-28 shrink-0 object-cover" : "aspect-[4/3] w-full object-cover"} /> : <span className={`bg-muted ${side ? "h-28 w-28" : "aspect-[4/3] w-full"}`} />}
      <span className="block p-4">
        <strong className="block text-base font-extrabold text-foreground">{propStr(widget.props, "title", "")}</strong>
        <span className="mt-1 block text-sm leading-7 text-foreground/70">{propStr(widget.props, "text", "")}</span>
      </span>
    </div>
  )
  return href ? <Link href={safeHref(href)} {...linkAttrs(widget.props, "href")} className="block h-full">{body}</Link> : body
}

export function FlipBoxWidget({ widget }: { widget: WidgetNode }) {
  const [flipped, setFlipped] = useState(false)
  const href = propStr(widget.props, "href", "")
  const face = "absolute inset-0 grid place-items-center gap-2 rounded-2xl p-6 text-center [backface-visibility:hidden]"
  return (
    <div
      className="wb-flip group relative [perspective:1000px]"
      style={{ minHeight: propNum(widget.props, "height", 240) }}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onFocus={() => setFlipped(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFlipped(false)
      }}
    >
      <div className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
        <div className={`${face} bg-card text-foreground border border-border`} aria-hidden={flipped}>
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><WIcon name={propStr(widget.props, "icon", "star")} /></span>
          <strong className="text-lg font-extrabold">{propStr(widget.props, "frontTitle", "")}</strong>
          <span className="text-sm text-foreground/70">{propStr(widget.props, "frontText", "")}</span>
          {/* Keyboard users flip with this button (focus flips the card). */}
          <button type="button" className="sr-only focus:not-sr-only" onClick={() => setFlipped(true)}>نمایش پشت کارت</button>
        </div>
        <div className={`${face} bg-primary text-primary-foreground [transform:rotateY(180deg)]`} aria-hidden={!flipped}>
          <strong className="text-lg font-extrabold">{propStr(widget.props, "backTitle", "")}</strong>
          <span className="text-sm opacity-90">{propStr(widget.props, "backText", "")}</span>
          {href ? <Link href={safeHref(href)} {...linkAttrs(widget.props, "href")} tabIndex={flipped ? 0 : -1} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--sf-navy,#0C2D63)]">{propStr(widget.props, "button", "بیشتر")}</Link> : null}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ automatic table of contents */

type TocRow = { id: string; text: string; level: number }

function slugify(text: string, used: Set<string>): string {
  const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section"
  let id = base
  let n = 2
  while (used.has(id) || (typeof document !== "undefined" && document.getElementById(id))) id = `${base}-${n++}`
  used.add(id)
  return id
}

/** Builds a TOC from the page's headings after render; gives headings ids when missing. */
export function TocWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const levels = propStr(widget.props, "levels", "h2,h3")
  const [rows, setRows] = useState<TocRow[]>([])
  const [open, setOpen] = useState(!propBool(widget.props, "collapsed"))
  const domId = useId()
  useEffect(() => {
    const selector = levels.split(",").map((s) => s.trim()).filter((s) => /^h[1-6]$/.test(s)).join(",") || "h2,h3"
    const scan = () => {
      const root = document.querySelector(".wb-canvas") ?? document.body
      const used = new Set<string>()
      const found: TocRow[] = []
      root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (el.closest("[data-wb-toc]")) return
        const text = el.textContent?.trim() ?? ""
        if (!text) return
        if (!el.id) el.id = slugify(text, used)
        found.push({ id: el.id, text, level: Number(el.tagName.slice(1)) })
      })
      setRows(found)
    }
    scan()
    const timer = window.setTimeout(scan, 1200)
    return () => window.clearTimeout(timer)
  }, [levels])
  const min = rows.reduce((m, row) => Math.min(m, row.level), 6)
  if (!rows.length) return editing ? <p className="rounded-2xl border border-dashed p-4 text-sm text-foreground/60">فهرست مطالب از تیترهای صفحه ساخته می‌شود.</p> : null
  return (
    <nav data-wb-toc className="rounded-2xl border border-border bg-card p-4" aria-labelledby={`${domId}-t`}>
      <button type="button" id={`${domId}-t`} aria-expanded={open} aria-controls={`${domId}-l`} className="flex w-full items-center justify-between text-sm font-extrabold" onClick={() => setOpen(!open)}>
        {propStr(widget.props, "title", "فهرست مطالب")}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ol id={`${domId}-l`} className="mt-3 grid gap-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.id} style={{ paddingInlineStart: (row.level - min) * 14 }}>
              <a href={`#${row.id}`} className="text-foreground/80 hover:text-primary">{row.text}</a>
            </li>
          ))}
        </ol>
      ) : null}
    </nav>
  )
}

/* ------------------------------------------------------------ hotspots */

export function HotspotWidget({ widget }: { widget: WidgetNode }) {
  const image = propStr(widget.props, "image", "")
  const points = parseRows(widget.props.points, ["x", "y", "title", "text", "href"])
  const [active, setActive] = useState<number | null>(null)
  return (
    <div className="relative overflow-hidden rounded-2xl" onKeyDown={(event) => { if (event.key === "Escape") setActive(null) }}>
      {image ? <img src={image} alt={propStr(widget.props, "alt", "")} loading="lazy" className="block w-full" /> : <div className="aspect-video bg-muted" />}
      {points.map((point, index) => {
        const x = Math.max(0, Math.min(100, Number(point.x) || 50))
        const y = Math.max(0, Math.min(100, Number(point.y) || 50))
        const open = active === index
        return (
          <div key={index} className="absolute" style={{ insetInlineStart: `${x}%`, top: `${y}%` }}>
            <button
              type="button"
              aria-expanded={open}
              aria-label={point.title || `نقطه ${index + 1}`}
              className="grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-white/60 rtl:translate-x-1/2"
              onClick={() => setActive(open ? null : index)}
            >
              <Plus className={`size-4 transition-transform ${open ? "rotate-45" : ""}`} aria-hidden />
            </button>
            {open ? (
              <div role="dialog" aria-label={point.title} className="absolute top-5 z-10 w-56 rounded-xl bg-card p-3 text-sm text-foreground shadow-xl" style={{ insetInlineStart: x > 60 ? "auto" : 0, insetInlineEnd: x > 60 ? 0 : "auto" }}>
                <strong className="block">{point.title}</strong>
                {point.text ? <p className="mt-1 text-xs leading-6 text-foreground/70">{point.text}</p> : null}
                {point.href ? <Link href={safeHref(point.href)} className="mt-2 inline-block text-xs font-bold text-primary">مشاهده</Link> : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ multi-level nav menu */

function NavBranch({ item, depth, vertical }: { item: NavItem; depth: number; vertical: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!item.children.length) {
    return <li><Link href={safeHref(item.href)} className="block rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted hover:text-primary">{item.label}</Link></li>
  }
  return (
    <li
      className="relative"
      onMouseEnter={vertical ? undefined : () => setOpen(true)}
      onMouseLeave={vertical ? undefined : () => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false) }}
    >
      <div className="flex items-center">
        <Link href={safeHref(item.href)} className="block rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:text-primary">{item.label}</Link>
        <button type="button" aria-expanded={open} aria-controls={id} aria-label={`زیرمنوی ${item.label}`} className="grid size-7 place-items-center rounded" onClick={() => setOpen(!open)}>
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
      <ul id={id} hidden={!open} className={vertical ? "ms-3 border-s border-border ps-2" : `absolute z-20 min-w-48 rounded-xl border border-border bg-card p-1 shadow-xl ${depth === 0 ? "top-full start-0" : "top-0 start-full"}`}>
        {item.children.map((child) => <NavBranch key={child.label + child.href} item={child} depth={depth + 1} vertical={vertical} />)}
      </ul>
    </li>
  )
}

export function NavDropdownWidget({ widget }: { widget: WidgetNode }) {
  const tree = buildNavTree(parseRows(widget.props.items, ["label", "href", "level"]) as { label: string; href: string; level: string }[])
  const vertical = propStr(widget.props, "direction", "row") === "column"
  if (!tree.length) return null
  return (
    <nav aria-label={propStr(widget.props, "ariaLabel", "منوی اصلی")}>
      <ul className={`flex gap-1 ${vertical ? "flex-col" : "flex-wrap items-center"}`}>
        {tree.map((item) => <NavBranch key={item.label + item.href} item={item} depth={0} vertical={vertical} />)}
      </ul>
    </nav>
  )
}

/* ------------------------------------------------------------ multi-state box */

/** States switched by its own buttons, or from any link `#state-<cssId>-<n>` ("go to state" action). */
export function StateBoxWidget({ widget }: { widget: WidgetNode }) {
  const states = parseRows(widget.props.states, ["title", "text", "image"])
  const [index, setIndex] = useState(0)
  const anchor = widget.advanced?.cssId || widget.id
  useEffect(() => {
    const apply = () => {
      const m = window.location.hash.match(new RegExp(`^#state-${anchor.replace(/[^\w-]/g, "")}-(\\d+)$`))
      if (m) setIndex(Math.max(0, Number(m[1]) - 1))
    }
    apply()
    window.addEventListener("hashchange", apply)
    return () => window.removeEventListener("hashchange", apply)
  }, [anchor])
  if (!states.length) return null
  const current = states[Math.min(index, states.length - 1)]
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {propBool(widget.props, "showButtons", true) ? (
        <div className="mb-3 flex flex-wrap gap-1" role="group">
          {states.map((state, i) => (
            <button key={i} type="button" aria-pressed={i === index} className={`rounded-full px-3 py-1 text-xs font-bold ${i === index ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setIndex(i)}>
              {state.title || `حالت ${i + 1}`}
            </button>
          ))}
        </div>
      ) : null}
      <div aria-live="polite" className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <strong className="block text-lg font-extrabold">{current.title}</strong>
          <p className="mt-1 whitespace-pre-line text-sm leading-7 text-foreground/75">{current.text}</p>
        </div>
        {current.image ? <img src={current.image} alt="" loading="lazy" className="max-h-56 rounded-xl object-cover" /> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ menu cart (drawer) */

const snapshotJson = () => JSON.stringify(cartSnapshot())
function useGuestLines(): CartLine[] {
  // Snapshot as a string so the store value is stable between renders.
  const raw = useSyncExternalStore(subscribeCart, snapshotJson, () => "[]")
  return useMemo(() => JSON.parse(raw) as CartLine[], [raw])
}

export function MenuCartWidget({ widget }: { widget: WidgetNode }) {
  const [open, setOpen] = useState(false)
  const { cart, auth } = useServerCart()
  const guest = useGuestLines()
  const money = useMoney()
  const lines =
    auth === "auth" && cart
      ? cart.items.map((item) => ({ key: String(item.id), name: item.product.name, qty: item.quantity, price: item.product.price_minor, image: item.product.image_url ?? item.product.cover_image_url, slug: item.product.slug }))
      : guest.map((line) => ({ key: line.slug, name: line.name, qty: line.qty, price: line.price, image: line.image, slug: line.slug }))
  const count = lines.reduce((sum, line) => sum + line.qty, 0)
  const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} className="relative inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold" onClick={() => setOpen(true)}>
        <ShoppingBag className="size-[18px]" aria-hidden />
        {propStr(widget.props, "label", "سبد خرید")}
        {count ? <span className="absolute -end-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{count.toLocaleString("fa-IR")}</span> : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex bg-black/40" onClick={() => setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label="سبد خرید" className="ms-auto flex h-full w-full max-w-sm flex-col bg-card text-foreground shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4 font-extrabold">
              سبد خرید
              <button type="button" autoFocus aria-label="بستن" onClick={() => setOpen(false)}><X className="size-5" /></button>
            </div>
            <ul className="min-h-0 flex-1 overflow-auto p-4">
              {lines.length === 0 ? <li className="text-sm text-foreground/60">سبد خرید خالی است.</li> : null}
              {lines.map((line) => (
                <li key={line.key} className="mb-3 flex items-center gap-3">
                  <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">{line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={line.slug ? `/product/${line.slug}` : "#"} className="line-clamp-1 text-sm font-bold">{line.name}</Link>
                    <span className="flex items-center gap-1 text-xs text-foreground/60">{line.qty.toLocaleString("fa-IR")} × {money(line.price)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-4">
              <div className="mb-3 flex justify-between text-sm font-bold"><span>جمع</span><span>{money(total)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/cart" className="wb-btn wb-btn-outline text-center" onClick={() => setOpen(false)}>مشاهده سبد</Link>
                <Link href="/checkout" className="wb-btn wb-btn-primary text-center" onClick={() => setOpen(false)}>تسویه حساب</Link>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------ upsells / cross-sells */

export function LinkedProductsWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const runtime = useBuilderRuntime()
  const slug = propStr(widget.props, "slug", "") || runtime.productSlug || ""
  const type = propStr(widget.props, "type", "upsell")
  const [items, setItems] = useState<ShopProduct[] | null>(null)
  useEffect(() => {
    if (!slug) return
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}/linked?type=${encodeURIComponent(type)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { items?: Record<string, unknown>[] } } | null) => {
        if (!cancel) setItems((json?.data?.items ?? []).map((row, index) => mapApiProduct(row, index)))
      })
      .catch(() => !cancel && setItems([]))
    return () => {
      cancel = true
    }
  }, [slug, type])
  if (!slug || !items?.length) return editing ? <p className="rounded-2xl border border-dashed p-4 text-sm text-foreground/60">{type === "cross_sell" ? "محصولات مکمل" : "پیشنهاد ارتقا"} — از تنظیمات محصول انتخاب می‌شوند.</p> : null
  return (
    <section>
      <h2 className="wb-type-h2 mb-3">{propStr(widget.props, "title", type === "cross_sell" ? "معمولاً با هم خریده می‌شوند" : "شاید این‌ها را هم بپسندید")}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{items.map((product) => <StoreProductCard key={product.slug} product={product} />)}</div>
    </section>
  )
}

/* ------------------------------------------------------------ purchase summary (thank-you page) */

type OrderRow = { id: number; number?: string; order_number?: string; status?: string; total_minor?: number; grand_total_minor?: number; created_at?: string; items?: { id: number; name?: string; quantity: number; product?: { name?: string } }[] }

export function PurchaseSummaryWidget({ editing }: { editing: boolean }) {
  const [order, setOrder] = useState<OrderRow | null | undefined>(undefined)
  const money = useMoney()
  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const id = new URLSearchParams(window.location.search).get("order")
    const url = id && /^\d+$/.test(id) ? `${base}/api/v1/account/orders/${id}` : `${base}/api/v1/account/orders?per_page=1`
    fetch(url, { credentials: "include", headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancel) return
        const data = json?.data
        setOrder(Array.isArray(data) ? data[0] ?? null : data && typeof data === "object" ? (data as OrderRow) : null)
      })
      .catch(() => !cancel && setOrder(null))
    return () => {
      cancel = true
    }
  }, [])
  if (order === undefined) return null
  if (!order) return editing ? <p className="rounded-2xl border border-dashed p-4 text-sm text-foreground/60">خلاصه آخرین سفارش مشتری واردشده (یا ‎?order=شناسه).</p> : null
  const total = order.grand_total_minor ?? order.total_minor ?? 0
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="خلاصه سفارش">
      <h2 className="text-lg font-extrabold">سفارش شما ثبت شد</h2>
      <p className="mt-1 text-sm text-foreground/70">شماره سفارش: <bdi>{order.number ?? order.order_number ?? order.id}</bdi></p>
      <ul className="mt-3 grid gap-1 text-sm">
        {(order.items ?? []).map((item) => <li key={item.id} className="flex justify-between"><span>{item.name ?? item.product?.name}</span><span>× {item.quantity.toLocaleString("fa-IR")}</span></li>)}
      </ul>
      <div className="mt-3 flex justify-between border-t border-border pt-3 font-bold"><span>مبلغ کل</span><span>{money(total)}</span></div>
      <Link href="/account" className="mt-4 inline-block text-sm font-bold text-primary">پیگیری در حساب کاربری</Link>
    </section>
  )
}

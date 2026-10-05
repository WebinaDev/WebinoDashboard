"use client"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"

import type { ShopProduct } from "@/builder/catalog"
import { useCatalog } from "@/builder/storefront/use-catalog"

import { IconChevronDown, IconChevronLeft, IconSort } from "./icons"
import { ClassicProductCard } from "./ClassicProductCard"
import { useDigits } from "./parts"

/* --------------------------------------------------------- breadcrumb bar */

export function ClassicBreadcrumbBar({ items, aside }: { items: { label: string; href?: string }[]; aside?: ReactNode }) {
  return (
    <div className="sfc-crumbbar">
      <div className="sfc-container sfc-crumbbar__inner">
        <nav className="sfc-crumbs" aria-label="breadcrumb">
          {items.map((item, index) => (
            <span key={item.label + index} className="sfc-crumbs__item">
              {index > 0 ? <IconChevronLeft size={10} className="sfc-crumbs__sep" /> : null}
              {item.href && index < items.length - 1 ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>
              )}
            </span>
          ))}
        </nav>
        {aside ? <div className="sfc-crumbbar__aside">{aside}</div> : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- sort tabs */

const SORTS = [
  { id: "new", label: "جدیدترین" },
  { id: "featured", label: "پربازدیدترین" },
  { id: "best", label: "پرفروش‌ترین" },
  { id: "price", label: "ارزان‌ترین" },
  { id: "price_desc", label: "گران‌ترین" },
]

export function ClassicSortTabs({ editing, total }: { editing: boolean; total?: number }) {
  const router = useRouter()
  const params = useSearchParams()
  const digits = useDigits()
  const archiveSort = useClassicThemeSettings().archive?.default_sort
  const sortFallback =
    archiveSort === "price_asc"
      ? "price_asc"
      : archiveSort === "price_desc"
        ? "price_desc"
        : archiveSort === "popular"
          ? "popular"
          : "new"
  const current = params.get("sort") ?? sortFallback
  return (
    <div className="sfc-sort">
      <span className="sfc-sort__label">
        <IconSort size={18} />
        مرتب‌سازی:
      </span>
      <div className="sfc-sort__tabs" role="tablist">
        {SORTS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current === tab.id}
            className={current === tab.id ? "is-active" : ""}
            onClick={() => {
              if (editing) return
              const next = new URLSearchParams(params.toString())
              next.set("sort", tab.id)
              next.delete("page")
              router.replace(`?${next.toString()}`, { scroll: false })
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {typeof total === "number" ? <span className="sfc-sort__total">{digits(total)} کالا</span> : null}
    </div>
  )
}

/* --------------------------------------------------------- archive grid */

export function ClassicArchiveGrid({
  products,
  editing,
  title,
  showSort,
}: {
  products: ShopProduct[]
  editing: boolean
  title?: string
  showSort?: boolean
}) {
  const archive = useClassicThemeSettings().archive ?? {}
  const columns = Math.min(6, Math.max(2, Number(archive.product_columns ?? 3)))
  return (
    <section className="sfc-archive" style={{ ["--sfc-archive-cols" as string]: String(columns) }}>
      {title || showSort ? (
        <div className="sfc-archive__head">
          {title ? <h2 className="sfc-archive__title">{title}</h2> : null}
          {showSort ? <ClassicSortTabs editing={editing} total={products.length} /> : null}
        </div>
      ) : null}
      {products.length === 0 ? (
        <div className="sfc-archive__empty">
          <strong>محصولی با این مشخصات پیدا نشد</strong>
          <span>فیلترها را تغییر دهید یا همه محصولات را ببینید.</span>
          <Link href="/shop" className="sfc-btn">مشاهده همه محصولات</Link>
        </div>
      ) : (
        <div className="sfc-archive__grid">
          {products.map((p) => (
            <ClassicProductCard key={p.slug} product={p} variant="archive" />
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------- filters */

function FilterGroup({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const digits = useDigits()
  return (
    <div className={`sfc-filter__group ${open ? "is-open" : ""}`}>
      <button type="button" className="sfc-filter__summary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span className="sfc-filter__summary-end">
          {typeof count === "number" ? <span className="sfc-filter__count">{digits(count)}</span> : null}
          <IconChevronDown size={16} className="sfc-filter__chev" />
        </span>
      </button>
      {open ? <div className="sfc-filter__body">{children}</div> : null}
    </div>
  )
}

export function ClassicFilters({ editing }: { editing: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const catalog = useCatalog(48)
  const digits = useDigits()
  const archive = useClassicThemeSettings().archive ?? {}
  const filtersOpen = Boolean(archive.filters_open_default)
  if (archive.sidebar_enabled === false) return null
  const category = params.get("category") ?? ""
  const brand = params.get("brand") ?? ""
  const inStock = params.get("in_stock") === "1"
  const onSale = params.get("on_sale") === "1"
  const any = Boolean(category || brand || inStock || onSale || params.get("q"))

  const counts = useMemo(() => {
    const cat = new Map<string, number>()
    const br = new Map<string, number>()
    for (const p of catalog.products) {
      cat.set(p.categorySlug, (cat.get(p.categorySlug) ?? 0) + 1)
      br.set(p.brandSlug, (br.get(p.brandSlug) ?? 0) + 1)
    }
    return { cat, br }
  }, [catalog.products])

  function setParam(key: string, value: string) {
    if (editing) return
    const next = new URLSearchParams(params.toString())
    if (!value || next.get(key) === value) next.delete(key)
    else next.set(key, value)
    next.delete("page")
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  return (
    <aside className="sfc-filter sf-filters">
      <div className="sfc-filter__head">
        <strong>فیلترها</strong>
        {any ? (
          <button type="button" onClick={() => !editing && router.replace("?", { scroll: false })}>
            حذف فیلترها
          </button>
        ) : null}
      </div>
      <FilterGroup title="دسته‌بندی" count={catalog.categories.length} defaultOpen={filtersOpen}>
        {catalog.categories.map((item) => (
          <label key={item.slug} className="sfc-check">
            <input type="checkbox" checked={category === item.slug} onChange={() => setParam("category", item.slug)} />
            <span className="sfc-check__box" aria-hidden="true" />
            <span className="sfc-check__label">{item.name}</span>
            <span className="sfc-check__count">{digits(counts.cat.get(item.slug) ?? 0)}</span>
          </label>
        ))}
      </FilterGroup>
      <FilterGroup title="برند" count={catalog.brands.length} defaultOpen={filtersOpen}>
        {catalog.brands.map((item) => (
          <label key={item.slug} className="sfc-check">
            <input type="checkbox" checked={brand === item.slug} onChange={() => setParam("brand", item.slug)} />
            <span className="sfc-check__box" aria-hidden="true" />
            <span className="sfc-check__label">{item.name}</span>
            <span className="sfc-check__count">{digits(counts.br.get(item.slug) ?? 0)}</span>
          </label>
        ))}
      </FilterGroup>
      <label className="sfc-switch">
        <span>فقط کالاهای موجود</span>
        <input type="checkbox" checked={inStock} onChange={() => setParam("in_stock", inStock ? "" : "1")} />
        <span className="sfc-switch__track" aria-hidden="true" />
      </label>
      <label className="sfc-switch">
        <span>فقط کالاهای تخفیف‌دار</span>
        <input type="checkbox" checked={onSale} onChange={() => setParam("on_sale", onSale ? "" : "1")} />
        <span className="sfc-switch__track" aria-hidden="true" />
      </label>
    </aside>
  )
}

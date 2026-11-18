"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import type { ShopProduct } from "@/builder/catalog"
import { addShopItem } from "@/builder/storefront/actions"
import { useProductQuery } from "@/builder/storefront/use-catalog"
import { OptImg } from "@/components/perf/OptImg"
import { optImg } from "@/lib/image-url"

import { ClassicProductCard } from "./ClassicProductCard"
import { IconChevronLeft, IconChevronRight, IconStar } from "./icons"
import { ClassicAmount, useDigits } from "./parts"

/* ------------------------------------------------ collection products (parisma classic-collection) */

export function ClassicCollectionProducts({
  title,
  category,
  sort,
  limit,
  banner,
  bannerHref,
  more,
}: {
  title: string
  category?: string
  sort?: string
  limit?: number
  banner?: string
  bannerHref?: string
  more?: string
}) {
  const { products } = useProductQuery({ category, sort: sort || "newest", limit: limit && limit > 0 ? limit : 10 })
  const track = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" })
  if (!products.length) return null
  const href = more || (category ? `/shop?category=${encodeURIComponent(category)}` : "/shop")
  return (
    <section className="sfc-collection">
      <div className="sfc-collection__inner">
        <div className="sfc-collection__navigation">
          <span className="sfc-collection__icon">
            <IconStar size={22} />
          </span>
          <h2 className="sfc-collection__title">{title}</h2>
          <Link href={href} className="sfc-collection__more">
            مشاهده همه <IconChevronLeft size={12} />
          </Link>
          <div className="sfc-collection__arrows">
            <button type="button" aria-label="قبلی" onClick={() => scroll(1)}>
              <IconChevronRight size={16} />
            </button>
            <button type="button" aria-label="بعدی" onClick={() => scroll(-1)}>
              <IconChevronLeft size={16} />
            </button>
          </div>
        </div>
        <div className="sfc-collection__collections" ref={track}>
          {products.map((p) => (
            <div key={p.slug} className="sfc-collection__cell">
              <ClassicProductCard product={p} />
            </div>
          ))}
        </div>
        {banner ? (
          <Link href={bannerHref || href} className="sfc-collection__baner">
            <OptImg loading="lazy" decoding="async" {...optImg(banner)} alt={title} />
          </Link>
        ) : null}
      </div>
    </section>
  )
}

/* ------------------------------------------------ side package (parisma «پکیج گیمرها») */

export function ClassicPackageSide({
  title,
  category,
  slugs,
  discountPercent = 0,
  limit,
}: {
  title: string
  category?: string
  slugs?: string
  discountPercent?: number
  limit?: number
}) {
  const digits = useDigits()
  const wanted = useMemo(
    () =>
      (slugs ?? "")
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [slugs],
  )
  const { products } = useProductQuery({ category, sort: "best_selling", limit: wanted.length ? 48 : limit && limit > 0 ? limit : 4 })
  const pack: ShopProduct[] = wanted.length
    ? (wanted.map((s) => products.find((p) => p.slug === s)).filter(Boolean) as ShopProduct[])
    : products.slice(0, limit && limit > 0 ? limit : 4)
  const [off, setOff] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  if (!pack.length) return null
  const picked = pack.filter((p) => !off[p.slug])
  const sum = picked.reduce((s, p) => s + p.price, 0)
  const pct = Math.max(0, Math.min(90, Number(discountPercent) || 0))
  const final = picked.length === pack.length && pct > 0 ? Math.round(sum * (1 - pct / 100)) : sum

  async function buy() {
    setBusy(true)
    for (const p of picked) await addShopItem(p, 1)
    setBusy(false)
    setDone(true)
  }

  return (
    <section className="sfc-package">
      <div className="sfc-package__head">
        <strong>{title}</strong>
        {pct > 0 ? <span className="sfc-package__badge">{digits(pct)}٪ تخفیف خرید کامل پکیج</span> : null}
      </div>
      <ul className="sfc-package__list">
        {pack.map((p) => (
          <li key={p.slug} className={off[p.slug] ? "is-off" : ""}>
            <label>
              <input type="checkbox" checked={!off[p.slug]} onChange={(e) => setOff((o) => ({ ...o, [p.slug]: !e.target.checked }))} />
              <span className="sfc-package__img">{p.image ? <OptImg loading="lazy" decoding="async" {...optImg(p.image)} alt="" /> : null}</span>
              <Link href={`/product/${p.slug}`} className="sfc-package__name">
                {p.name}
              </Link>
              <ClassicAmount value={p.price} className="sfc-package__price" />
            </label>
          </li>
        ))}
      </ul>
      <div className="sfc-package__footer">
        <div className="sfc-package__action">
          <span className="sfc-package__count">{digits(picked.length)} کالا</span>
          <button type="button" className="sfc-btn" disabled={busy || !picked.length} onClick={() => void buy()}>
            {done ? "به سبد اضافه شد" : "میخرم"}
          </button>
        </div>
        <div className="sfc-package__total">
          {final !== sum ? <del><ClassicAmount value={sum} /></del> : null}
          <ClassicAmount value={final} />
        </div>
      </div>
      {done ? (
        <Link href="/cart" className="sfc-package__cart">
          مشاهده سبد خرید <IconChevronLeft size={12} />
        </Link>
      ) : null}
    </section>
  )
}

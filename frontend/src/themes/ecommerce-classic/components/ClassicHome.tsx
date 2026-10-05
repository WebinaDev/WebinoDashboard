"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { SAMPLE_BRANDS, toneClass, type ShopProduct } from "@/builder/catalog"
import { useCatalog, type CatalogState } from "@/builder/storefront/use-catalog"

import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFire, IconPercent } from "./icons"
import { ClassicProductCard } from "./ClassicProductCard"
import { ClassicAmount, ClassicSectionHead, useDigits } from "./parts"

function imageForCategory(catalog: CatalogState, slug: string, name: string): string | null {
  const hit = catalog.products.find((p) => (p.categorySlug === slug || p.category === name) && p.image)
  return hit?.image ?? null
}

function lines(raw: string): string[][] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()))
}

/* ------------------------------------------------------------------ stories */

type Story = { id: string; title: string; image: string | null; href: string; badge?: string }

export function ClassicStoryStrip({ title }: { title?: string }) {
  const catalog = useCatalog(16)
  const [remote, setRemote] = useState<Story[] | null>(null)
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/product-stories`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const items = Array.isArray(json?.data?.items) ? json.data.items : []
        setRemote(
          items.map((item: { id: number; title: string; media_url: string; link_url?: string | null; product_id?: number | null }) => ({
            id: String(item.id),
            title: item.title,
            image: item.media_url,
            href: item.link_url || (item.product_id ? `/product/${item.product_id}` : "#"),
          })),
        )
      })
      .catch(() => setRemote([]))
  }, [])
  const fallback: Story[] = catalog.products.slice(0, 14).map((p, i) => ({
    id: p.slug,
    title: p.name,
    image: p.image ?? null,
    href: `/product/${p.slug}`,
    badge: p.compare ? "تخفیف" : p.isNew || i % 4 === 1 ? "جدید" : undefined,
  }))
  const stories = remote && remote.length ? remote : fallback
  if (!stories.length) return null
  return (
    <section className="sfc-stories" aria-label={title || "استوری"}>
      <div className="sfc-stories__track">
        {stories.map((story) => (
          <Link key={story.id} href={story.href} className="sfc-story">
            <span className="sfc-story__ring">
              <span className="sfc-story__img">
                {story.image ? <img src={story.image} alt="" loading="lazy" /> : <span>{story.title.slice(0, 1)}</span>}
              </span>
              {story.badge ? <span className="sfc-story__badge">{story.badge}</span> : null}
            </span>
            <span className="sfc-story__label">{story.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- hero */

const HERO_DEFAULTS = [
  { kicker: "کرم ترمیم‌کننده و اسپری آبرسان", title: "ترمیم پوست حساس فقط این...", sub: "Relief Cream & Hydrating Spray", href: "/shop" },
  { kicker: "خرید اقساطی بدون چک و ضامن", title: "همین الان بخر، بعداً پرداخت کن...", sub: "Installment Payment", href: "/shop" },
  { kicker: "مراقبت حرفه‌ای مو", title: "موهای رویایی فقط با این...", sub: "Hair Styler Pro", href: "/shop?category=hair" },
]

export function ClassicHero({ slidesText, height }: { slidesText?: string; height?: number }) {
  const parsed = lines(slidesText ?? "").map(([title, kicker, href, image, sub]) => ({
    title: title || "",
    kicker: kicker || "",
    href: href || "/shop",
    image: image || "",
    sub: sub || "",
  }))
  const slides = parsed.length ? parsed : HERO_DEFAULTS.map((s) => ({ ...s, image: "" }))
  const [index, setIndex] = useState(0)
  const count = slides.length
  useEffect(() => {
    if (count < 2) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000)
    return () => window.clearInterval(timer)
  }, [count])
  const slide = slides[index] ?? slides[0]
  return (
    <section className="sfc-hero" style={height ? { minHeight: height } : undefined}>
      <div className="sfc-hero__frame">
        {slides.map((s, i) => (
          <Link
            key={s.title + i}
            href={s.href}
            className={`sfc-hero__slide ${i === index ? "is-active" : ""}`}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
          >
            {s.image ? <img src={s.image} alt={s.title} className="sfc-hero__img" /> : null}
            {!s.image ? (
              <span className="sfc-hero__copy">
                <span className="sfc-hero__corner sfc-hero__corner--top" aria-hidden="true" />
                <span className="sfc-hero__kicker">{s.kicker}</span>
                <strong className="sfc-hero__title">{s.title}</strong>
                {s.sub ? <span className="sfc-hero__sub">{s.sub}</span> : null}
                <span className="sfc-hero__corner sfc-hero__corner--bottom" aria-hidden="true" />
              </span>
            ) : null}
          </Link>
        ))}
        <div className="sfc-hero__dots" role="tablist">
          {slides.map((s, i) => (
            <button
              key={s.title + i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.title || `اسلاید ${i + 1}`}
              className={i === index ? "is-active" : ""}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
      <button type="button" className="sfc-hero__nav sfc-hero__nav--next" aria-label="بعدی" onClick={() => setIndex((i) => (i + 1) % count)}>
        <IconChevronRight size={16} />
      </button>
      <button type="button" className="sfc-hero__nav sfc-hero__nav--prev" aria-label="قبلی" onClick={() => setIndex((i) => (i + count - 1) % count)}>
        <IconChevronLeft size={16} />
      </button>
      <span className="sr-only">{slide?.title}</span>
    </section>
  )
}

/* --------------------------------------------- pink category tiles + offer */

export function ClassicCategoryTiles({ tilesText }: { tilesText?: string }) {
  const catalog = useCatalog(16)
  const digits = useDigits()
  const custom = lines(tilesText ?? "").map(([name, href, image]) => ({ name: name || "", href: href || "/shop", image: image || null }))
  const tiles = custom.length
    ? custom.slice(0, 3)
    : catalog.categories.slice(0, 3).map((c) => ({
        name: c.name,
        href: `/shop?category=${c.slug}`,
        image: imageForCategory(catalog, c.slug, c.name),
      }))
  const offer = catalog.products.find((p) => p.compare && p.compare > p.price) ?? catalog.products[0]
  const off = offer?.compare && offer.compare > offer.price ? Math.round((1 - offer.price / offer.compare) * 100) : 0
  const left = typeof offer?.stock === "number" ? offer.stock : 1
  const sold = 0
  const total = Math.max(left + sold, 1)
  return (
    <section className="sfc-tiles">
      {tiles.map((tile) => (
        <Link key={tile.name + tile.href} href={tile.href} className="sfc-tile">
          <span className="sfc-tile__img">{tile.image ? <img src={tile.image} alt="" loading="lazy" /> : null}</span>
          <strong className="sfc-tile__title">{tile.name}</strong>
          <span className="sfc-tile__notch" aria-hidden="true">
            <IconChevronDown size={12} />
          </span>
        </Link>
      ))}
      {offer ? (
        <Link href={`/product/${offer.slug}`} className="sfc-offer">
          <div className="sfc-offer__body">
            <div className="sfc-offer__image">
              {offer.image ? <img src={offer.image} alt="" loading="lazy" /> : <span className={`bg-gradient-to-br ${toneClass(offer.tone)}`} />}
            </div>
            <div className="sfc-offer__detail">
              <span className="sfc-offer__badge">
                <IconPercent size={16} />
              </span>
              <strong className="sfc-offer__title">{offer.name}</strong>
            </div>
          </div>
          <div className="sfc-offer__foot">
            <div className="sfc-offer__stock">
              <span className="sfc-offer__left">{digits(left)}</span>
              <div className="sfc-offer__progress">
                <div className="sfc-offer__progress-title">
                  <span>عدد باقی‌مانده</span>
                  <span>{digits(sold)} فروخته‌شده</span>
                </div>
                <div className="sfc-offer__bars">
                  <span style={{ width: `${(left / total) * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="sfc-offer__price">
              {off > 0 ? <span className="sfc-offer__off">{digits(off)}٪</span> : null}
              <ClassicAmount value={offer.price} />
            </div>
          </div>
        </Link>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------ icon category grid */

export function ClassicIconCategories({ title, variant = "home" }: { title?: string; variant?: "home" | "archive" }) {
  const catalog = useCatalog(16)
  const items = catalog.categories.slice(0, variant === "archive" ? 8 : 6)
  return (
    <section className={`sfc-catgrid sfc-catgrid--${variant}`}>
      {title ? <ClassicSectionHead title={title} href="/shop" /> : null}
      <div className="sfc-catgrid__items">
        {items.map((cat) => {
          const img = imageForCategory(catalog, cat.slug, cat.name)
          return (
            <Link key={cat.slug} href={`/shop?category=${cat.slug}`} className="sfc-catgrid__item">
              <span className="sfc-catgrid__icon">
                {img ? <img src={img} alt="" loading="lazy" /> : <span className={`bg-gradient-to-br ${toneClass(cat.tone)}`}>{cat.name.slice(0, 1)}</span>}
              </span>
              <span className="sfc-catgrid__name">{cat.name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ product row */

export function ClassicProductRow({
  title,
  products,
  href = "/shop",
  more,
  tone = "light",
}: {
  title: string
  products: ShopProduct[]
  href?: string
  more?: string
  tone?: "light" | "pink"
}) {
  const track = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }
  if (!products.length) return null
  return (
    <section className={`sfc-row sfc-row--${tone}`}>
      <ClassicSectionHead title={title} href={href} more={more ?? "مشاهده همه محصولات"} />
      <div className="sfc-row__viewport">
        <div className="sfc-row__track" ref={track}>
          {products.map((p) => (
            <div key={p.slug} className="sfc-row__cell">
              <ClassicProductCard product={p} />
            </div>
          ))}
        </div>
        <button type="button" className="sfc-row__nav sfc-row__nav--next" aria-label="بعدی" onClick={() => scroll(-1)}>
          <IconChevronLeft size={16} />
        </button>
        <button type="button" className="sfc-row__nav sfc-row__nav--prev" aria-label="قبلی" onClick={() => scroll(1)}>
          <IconChevronRight size={16} />
        </button>
      </div>
    </section>
  )
}

/* --------------------------------------------------------- dark promo trio */

const PROMO_DEFAULTS = [
  { kicker: "پرفروش‌ترین‌های", title: "مراقبت از مو", href: "/shop?category=hair", tone: "wine", image: "" },
  { kicker: "پرفروش‌ترین‌های", title: "مراقبت از پوست", href: "/shop?category=skin", tone: "olive", image: "" },
  { kicker: "پرفروش‌ترین‌های", title: "لوازم شخصی برقی", href: "/shop", tone: "charcoal", image: "" },
]

export function ClassicPromoTrio({ itemsText }: { itemsText?: string }) {
  const parsed = lines(itemsText ?? "").map(([title, kicker, href, image, tone]) => ({
    title: title || "",
    kicker: kicker || "",
    href: href || "/shop",
    image: image || "",
    tone: tone || "charcoal",
  }))
  const items = parsed.length ? parsed : PROMO_DEFAULTS
  return (
    <section className="sfc-promos">
      {items.slice(0, 3).map((item) => (
        <Link key={item.title + item.href} href={item.href} className={`sfc-promo sfc-promo--${item.tone}`}>
          {item.image ? <img src={item.image} alt="" className="sfc-promo__img" loading="lazy" /> : null}
          <span className="sfc-promo__corner sfc-promo__corner--a" aria-hidden="true" />
          <span className="sfc-promo__corner sfc-promo__corner--b" aria-hidden="true" />
          <span className="sfc-promo__copy">
            <span className="sfc-promo__kicker">{item.kicker}</span>
            <strong className="sfc-promo__title">{item.title}</strong>
            <span className="sfc-promo__cta">مشاهده محصولات</span>
          </span>
        </Link>
      ))}
    </section>
  )
}

/* ----------------------------------------------------- numbered bestsellers */

export function ClassicBestSellers({ title, limit = 9 }: { title?: string; limit?: number }) {
  const catalog = useCatalog(Math.max(limit, 9))
  const digits = useDigits()
  const rows = catalog.products.slice().reverse().slice(0, limit)
  if (!rows.length) return null
  return (
    <section className="sfc-best">
      <ClassicSectionHead title={title || "پرفروش‌ترین محصولات"} href="/shop?sort=featured" />
      <div className="sfc-best__grid">
        {rows.map((p, i) => (
          <Link key={p.slug} href={`/product/${p.slug}`} className="sfc-best__item">
            <span className="sfc-best__detail">
              <span className="sfc-best__num">{digits(i + 1)}</span>
              <span className="sfc-best__sep" aria-hidden="true" />
              <span className="sfc-best__title">{p.name}</span>
            </span>
            <span className="sfc-best__img">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</span>
            {i < 3 ? (
              <span className="sfc-best__fire" aria-hidden="true">
                <IconFire size={14} />
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- brands */

export function ClassicBrandGrid({ title }: { title?: string }) {
  const catalog = useCatalog(24)
  const digits = useDigits()
  const brands = catalog.brands.length ? catalog.brands : SAMPLE_BRANDS.map((name) => ({ name, slug: name }))
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of catalog.products) map.set(p.brandSlug || p.brand, (map.get(p.brandSlug || p.brand) ?? 0) + 1)
    return map
  }, [catalog.products])
  return (
    <section className="sfc-brands">
      <ClassicSectionHead title={title || "برندهای محبوب"} href="/shop" />
      <div className="sfc-brands__grid">
        {brands.slice(0, 12).map((brand) => {
          const logo = catalog.products.find((p) => (p.brandSlug === brand.slug || p.brand === brand.name) && p.image)?.image
          return (
            <Link key={brand.slug} href={`/shop?brand=${encodeURIComponent(brand.slug)}`} className="sfc-brand">
              <span className="sfc-brand__logo">{logo ? <img src={logo} alt="" loading="lazy" /> : <span>{brand.name}</span>}</span>
              <span className="sfc-brand__name">{brand.name}</span>
              <span className="sfc-brand__count">{digits(counts.get(brand.slug) ?? counts.get(brand.name) ?? 0)} کالا</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ blog */

type Post = { slug: string; title: string; excerpt?: string; cover_url?: string; published_at?: string }

const POST_DEFAULTS: Post[] = [
  { slug: "routine", title: "روتین صبحگاهی برای پوست شهری", excerpt: "سه گام کوتاه که قبل از آفتاب جواب می‌دهد." },
  { slug: "cleanser", title: "شوینده را با نوع پوست جور کنید", excerpt: "خشک، مختلط یا چرب؛ یک راهنمای ساده." },
  { slug: "hair-oil", title: "درخشش مو بدون روغن اضافه", excerpt: "کی و چقدر از روغن مو استفاده کنیم." },
  { slug: "sunscreen", title: "ضدآفتاب کرمی یا استیکی؟", excerpt: "کدام گزینه برای شما مناسب‌تر است." },
]

export function ClassicBlogBlock({ title }: { title?: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/blog`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const items = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.items) ? json.data.items : []
        setPosts(items.slice(0, 5))
      })
      .catch(() => setPosts([]))
  }, [])
  const list = posts.length ? posts : POST_DEFAULTS
  const [lead, ...rest] = list
  if (!lead) return null
  return (
    <section className="sfc-blog">
      <ClassicSectionHead title={title || "مجله"} href="/blog" more="مشاهده همه مقالات" />
      <div className="sfc-blog__grid">
        <Link href={`/blog/${lead.slug}`} className="sfc-blog__lead">
          {lead.cover_url ? <img src={lead.cover_url} alt="" loading="lazy" /> : <span className="sfc-blog__ph" />}
          <span className="sfc-blog__over">
            <strong>{lead.title}</strong>
            {lead.excerpt ? <span>{lead.excerpt}</span> : null}
          </span>
        </Link>
        <div className="sfc-blog__list">
          {rest.slice(0, 4).map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="sfc-blog__item">
              <span className="sfc-blog__thumb">{post.cover_url ? <img src={post.cover_url} alt="" loading="lazy" /> : null}</span>
              <span className="sfc-blog__body">
                <strong>{post.title}</strong>
                {post.excerpt ? <span>{post.excerpt}</span> : null}
                <span className="sfc-blog__more">
                  ادامه مطلب <IconChevronLeft size={12} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------- recently viewed */

export function ClassicRecentlyViewed({ title }: { title?: string }) {
  const catalog = useCatalog(48)
  const [slugs, setSlugs] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("wb_recently_viewed")
      const parsed = raw ? (JSON.parse(raw) as unknown) : []
      setSlugs(Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [])
    } catch {
      setSlugs([])
    }
  }, [])
  const products = slugs
    .map((slug) => catalog.products.find((p) => p.slug === slug))
    .filter((p): p is ShopProduct => Boolean(p))
  if (!products.length) return null
  return <ClassicProductRow title={title || "بازدیدهای اخیر شما"} products={products} href="/shop" more="مشاهده همه" />
}

/* ------------------------------------------------- amazing offers pink band */

export function ClassicAmazingBand({ title }: { title?: string }) {
  const catalog = useCatalog(24)
  const digits = useDigits()
  const track = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const offers = catalog.products.filter((p) => p.compare && p.compare > p.price)
  const list = (offers.length ? offers : catalog.products).slice(0, 10)
  if (!list.length) return null
  const end = new Date()
  end.setHours(23, 59, 59, 0)
  const diff = now == null ? 0 : Math.max(0, end.getTime() - now)
  const hms = [Math.floor(diff / 3600000), Math.floor((diff % 3600000) / 60000), Math.floor((diff % 60000) / 1000)]
  return (
    <section className="sfc-amazing">
      <div className="sfc-amazing__intro">
        <strong className="sfc-amazing__title">{title || "پیشنهاد شگفت‌انگیز"}</strong>
        <div className="sfc-amazing__timer" dir="ltr">
          {hms.map((v, i) => (
            <span key={i}>
              {i > 0 ? <i>:</i> : null}
              <b>{digits(Math.floor(v / 10))}</b>
              <b>{digits(v % 10)}</b>
            </span>
          ))}
        </div>
        <Link href="/amazing-offers" className="sfc-amazing__all">
          مشاهده همه <IconChevronLeft size={14} />
        </Link>
      </div>
      <div className="sfc-amazing__track" ref={track}>
        {list.map((p) => (
          <div key={p.slug} className="sfc-amazing__cell">
            <ClassicProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}

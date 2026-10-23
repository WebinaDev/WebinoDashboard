"use client"

/* Theme-part widgets: granular pieces of the header, footer, product page, archive,
 * cart and single post so theme templates (Theme Builder → header/footer/single_product/
 * product_archive/cart/single_post) can be composed freely. Every piece reads real data
 * from the current runtime (product slug, category, post slug, cart) or admin-entered props. */

import { Heart, Phone, ShoppingBag, UserRound } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { WebinaCredit } from "@/components/brand/WebinaCredit"
import { formatDate } from "@/lib/locale"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import { ClassicAmount, ClassicPrice, ClassicRating } from "@/themes/ecommerce-classic/components/parts"
import { ClassicSortTabs } from "@/themes/ecommerce-classic/components/ClassicArchive"
import { cartSnapshot, subscribeCart } from "../cart"
import { mapApiProduct, type ShopProduct } from "../catalog"
import { parseLinks, propBool, propNum, propStr } from "../props"
import { useServerCart } from "../storefront/actions"
import { previewCoupon, readStoredCoupon, storeCoupon } from "../storefront/coupon"
import { useCatalog } from "../storefront/use-catalog"
import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"
import { ProductQueryWidget, splitRows } from "./extra-widgets"
import { sanitizeBuilderHtml } from "./sanitize-html"
import { Img } from "./img"

function Placeholder({ label }: { label: string }) {
  return <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{label}</p>
}

/* ------------------------------------------------------------- product data */

const productCache = new Map<string, Promise<ShopProduct | null>>()

export function fetchProduct(slug: string): Promise<ShopProduct | null> {
  const hit = productCache.get(slug)
  if (hit) return hit
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const job = fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { data?: Record<string, unknown> } | null) => (json?.data && typeof json.data === "object" ? mapApiProduct(json.data, 0) : null))
    .catch(() => null)
  productCache.set(slug, job)
  return job
}

/** The product for this template: widget slug override → page product → (editor only) first catalog item. */
function usePartProduct(widget: WidgetNode, editing: boolean): ShopProduct | null | undefined {
  const runtime = useBuilderRuntime()
  const slug = propStr(widget.props, "slug", "") || runtime.productSlug || ""
  const catalog = useCatalog(4)
  const [product, setProduct] = useState<ShopProduct | null | undefined>(undefined)
  useEffect(() => {
    let cancel = false
    if (!slug) {
      setProduct(null)
      return
    }
    void fetchProduct(slug).then((p) => {
      if (!cancel) setProduct(p)
    })
    return () => {
      cancel = true
    }
  }, [slug])
  if (!slug && editing) return catalog.products[0] ?? null
  return product
}

export function ProductPartWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const product = usePartProduct(widget, editing)
  const tag = propStr(widget.props, "tag", "h1")
  if (product === undefined) return null
  if (!product) return editing ? <Placeholder label="بخش محصول — در قالب «محصول تکی» با محصول صفحه پر می‌شود" /> : null
  switch (widget.type) {
    case "product-title": {
      const Tag = tag === "h2" ? "h2" : tag === "h3" ? "h3" : "h1"
      return <Tag className="text-xl font-extrabold text-foreground md:text-2xl">{product.name}</Tag>
    }
    case "product-price":
      return <ClassicPrice price={product.price} compare={product.compare} size={propStr(widget.props, "size", "lg") === "md" ? "md" : "lg"} />
    case "product-rating":
      return product.rating ? <ClassicRating value={product.rating} /> : null
    case "product-stock": {
      const stock = typeof product.stock === "number" ? product.stock : null
      return (
        <p className={`text-sm font-semibold ${product.inStock ? "text-emerald-600" : "text-destructive"}`}>
          {product.inStock ? propStr(widget.props, "inText", "موجود در انبار") : propStr(widget.props, "outText", "ناموجود")}
          {product.inStock && stock != null && stock <= propNum(widget.props, "lowAt", 5) ? ` — ${stock.toLocaleString("fa-IR")} عدد باقی‌مانده` : ""}
        </p>
      )
    }
    case "product-attributes": {
      const rows = [
        { label: "برند", value: product.brand },
        { label: "دسته‌بندی", value: product.category },
        { label: "تنوع", value: product.variants.length ? `${product.variants.length.toLocaleString("fa-IR")} مدل` : "" },
      ].filter((r) => r.value)
      if (!rows.length) return null
      return (
        <dl className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className="text-foreground/60">{r.label}</dt>
              <dd className="font-semibold text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      )
    }
    case "product-description":
      return product.description ? <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">{product.description}</div> : null
    case "product-faq":
      return product.faqs.length ? (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {product.faqs.map((f, i) => (
            <details key={i} className="p-4">
              <summary className="cursor-pointer text-sm font-bold">{f.question}</summary>
              <p className="mt-2 text-sm leading-7 text-foreground/75">{f.answer}</p>
            </details>
          ))}
        </div>
      ) : null
    default:
      return null
  }
}

/** 3.17 — standalone instalment info: the product's real plans, or admin text/image when no product. */
export function InstallmentWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const product = usePartProduct(widget, editing)
  const theme = useClassicThemeSettings()
  const image = propStr(widget.props, "image", "") || String(theme.commerce?.installment_image ?? "")
  const title = propStr(widget.props, "title", "خرید اقساطی")
  const text = propStr(widget.props, "text", "")
  const plans = product?.installments ?? []
  if (!plans.length && !text && !image) return editing ? <Placeholder label="اقساط — طرح‌های اقساط محصول یا متن/تصویر دلخواه" /> : null
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <strong className="block text-sm font-extrabold text-foreground">{title}</strong>
      {text ? <p className="mt-1 text-xs leading-6 text-foreground/70">{text}</p> : null}
      {plans.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {plans.map((plan) => (
            <li key={plan.months} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs">
              <span>{plan.months.toLocaleString("fa-IR")} قسط</span>
              <ClassicAmount value={plan.monthly} />
            </li>
          ))}
        </ul>
      ) : null}
      {image ? <Img src={image} alt="" loading="lazy" className="mt-3 max-h-12 w-auto" /> : null}
    </section>
  )
}

export function RelatedProductsWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const product = usePartProduct(widget, editing)
  const category = product?.categorySlug ?? ""
  const node = useMemo<WidgetNode>(
    () => ({ ...widget, props: { ...widget.props, category, sort: propStr(widget.props, "sort", "best_selling"), excludeSlug: product?.slug ?? "" } }),
    [category, product?.slug, widget],
  )
  if (!product) return editing ? <Placeholder label="محصولات مرتبط — هم‌دسته با محصول صفحه" /> : null
  return <ProductQueryWidget widget={node} />
}

/* ------------------------------------------------------------------ archive */

export function ArchivePartWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const runtime = useBuilderRuntime()
  const params = useSearchParams()
  const catalog = useCatalog(12)
  const slug = params.get("category") || runtime.categorySlug || ""
  const flat = useMemo(() => {
    const out: typeof catalog.categories = []
    const walk = (list: typeof catalog.categories) => {
      for (const c of list) {
        out.push(c)
        if (c.children?.length) walk(c.children)
      }
    }
    walk(catalog.categories)
    return out
  }, [catalog.categories])
  const current = flat.find((c) => c.slug === slug)
  switch (widget.type) {
    case "archive-title": {
      const name = current?.name || (params.get("q") ? `نتایج «${params.get("q")}»` : propStr(widget.props, "fallback", "فروشگاه"))
      return <h1 className="text-xl font-extrabold text-foreground md:text-2xl">{name}</h1>
    }
    case "archive-description": {
      const lines = splitRows(propStr(widget.props, "items", ""))
      const custom = lines.find(([s]) => s === slug)?.[1] ?? (slug ? "" : propStr(widget.props, "shopText", ""))
      return custom ? <p className="text-sm leading-7 text-foreground/75">{custom}</p> : editing ? <Placeholder label="توضیح دسته — نامک|متن در هر خط" /> : null
    }
    case "archive-sort":
      return <ClassicSortTabs editing={editing} total={catalog.total} />
    case "archive-count":
      return <p className="text-xs text-foreground/60">{catalog.total.toLocaleString("fa-IR")} کالا</p>
    case "archive-subcategories": {
      const kids = current?.children?.length ? current.children : current?.id ? flat.filter((c) => c.parentId === current.id) : slug ? [] : catalog.categories.filter((c) => !c.parentId)
      if (!kids.length) return null
      return (
        <div className="flex flex-wrap gap-2">
          {kids.slice(0, propNum(widget.props, "limit", 12)).map((c) => (
            <Link key={c.slug} href={`/shop?category=${encodeURIComponent(c.slug)}`} className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:text-primary">
              {c.name}
            </Link>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

/** Standalone price filter — writes min_price/max_price to the URL (the archive grid reads them). */
export function PriceFilterWidget({ widget }: { widget: WidgetNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [min, setMin] = useState(params.get("min_price") ?? "")
  const [max, setMax] = useState(params.get("max_price") ?? "")
  const title = propStr(widget.props, "title", "محدوده قیمت (تومان)")
  const apply = (lo: string, hi: string) => {
    const next = new URLSearchParams(params.toString())
    const clean = (v: string) => v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "")
    const a = clean(lo)
    const b = clean(hi)
    if (a) next.set("min_price", a)
    else next.delete("min_price")
    if (b) next.set("max_price", b)
    else next.delete("max_price")
    next.delete("page")
    router.push(`/shop?${next.toString()}`)
  }
  return (
    <form
      className="grid gap-2 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        apply(min, max)
      }}
    >
      <strong className="text-sm font-bold text-foreground">{title}</strong>
      <div className="grid grid-cols-2 gap-2">
        <input inputMode="numeric" dir="ltr" value={min} onChange={(e) => setMin(e.target.value)} placeholder="از" aria-label="حداقل قیمت" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
        <input inputMode="numeric" dir="ltr" value={max} onChange={(e) => setMax(e.target.value)} placeholder="تا" aria-label="حداکثر قیمت" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="h-9 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          اعمال
        </button>
        {params.get("min_price") || params.get("max_price") ? (
          <button
            type="button"
            className="h-9 rounded-xl border border-border px-3 text-sm"
            onClick={() => {
              setMin("")
              setMax("")
              apply("", "")
            }}
          >
            حذف
          </button>
        ) : null}
      </div>
    </form>
  )
}

/* --------------------------------------------------------------------- cart */

function useCartSummary() {
  const local = useSyncExternalStore(subscribeCart, cartSnapshot, () => [])
  const { cart, auth } = useServerCart()
  return useMemo(() => {
    if (auth === "auth") {
      const items = cart?.items ?? []
      const subtotal = cart?.pricing?.subtotal_minor ?? items.reduce((sum, l) => sum + l.product.price_minor * l.quantity, 0)
      return { count: items.reduce((s, l) => s + l.quantity, 0), subtotal, auth }
    }
    return { count: local.reduce((s, l) => s + l.qty, 0), subtotal: local.reduce((s, l) => s + l.price * l.qty, 0), auth }
  }, [auth, cart, local])
}

export function CartTotalsWidget({ widget }: { widget: WidgetNode }) {
  const { count, subtotal } = useCartSummary()
  const [discount, setDiscount] = useState(0)
  useEffect(() => {
    const code = readStoredCoupon()
    if (!code || !subtotal) {
      setDiscount(0)
      return
    }
    void previewCoupon(code, subtotal).then((res) => setDiscount(res.ok ? Math.min(res.data.discount_minor, subtotal) : 0))
  }, [subtotal])
  return (
    <section className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <strong className="text-base font-extrabold">{propStr(widget.props, "title", "خلاصه سبد")}</strong>
      <div className="flex justify-between">
        <span>تعداد کالا</span>
        <span>{count.toLocaleString("fa-IR")}</span>
      </div>
      <div className="flex justify-between">
        <span>جمع</span>
        <ClassicAmount value={subtotal} />
      </div>
      {discount ? (
        <div className="flex justify-between text-primary">
          <span>تخفیف</span>
          <ClassicAmount value={discount} />
        </div>
      ) : null}
      <div className="flex justify-between border-t border-border pt-2 font-extrabold">
        <span>قابل پرداخت</span>
        <ClassicAmount value={Math.max(0, subtotal - discount)} />
      </div>
      {count ? (
        <Link href="/checkout" className="mt-2 rounded-xl bg-primary py-2.5 text-center font-bold text-primary-foreground">
          {propStr(widget.props, "button", "ادامه فرایند خرید")}
        </Link>
      ) : null}
    </section>
  )
}

export function CartCouponWidget({ widget }: { widget: WidgetNode }) {
  const { subtotal } = useCartSummary()
  const [code, setCode] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => setCode(readStoredCoupon()), [])
  return (
    <form
      className="grid gap-2 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const v = code.trim()
        if (!v) return
        void previewCoupon(v, subtotal).then((res) => {
          if (res.ok) {
            storeCoupon(res.data.code)
            setMsg({ ok: true, text: "کد تخفیف اعمال شد." })
            window.dispatchEvent(new Event("webino-cart"))
          } else {
            storeCoupon(null)
            setMsg({ ok: false, text: res.message || "کد تخفیف معتبر نیست." })
          }
        })
      }}
    >
      <strong className="text-sm font-bold">{propStr(widget.props, "title", "کد تخفیف")}</strong>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm" aria-label="کد تخفیف" />
        <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
          اعمال
        </button>
      </div>
      {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p> : null}
    </form>
  )
}

export function FreeShippingBarWidget({ widget }: { widget: WidgetNode }) {
  const theme = useClassicThemeSettings()
  const { subtotal } = useCartSummary()
  const threshold = propNum(widget.props, "threshold", 0) || Number(theme.commerce?.free_shipping_threshold ?? 0)
  if (!threshold) return null
  const left = Math.max(0, threshold - subtotal)
  const pct = Math.min(100, (subtotal / threshold) * 100)
  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <span>
        {left > 0 ? (
          <>
            <ClassicAmount value={left} /> {propStr(widget.props, "leftText", "تا ارسال رایگان باقی مانده است")}
          </>
        ) : (
          propStr(widget.props, "doneText", "ارسال این سفارش رایگان است.")
        )}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

/* ----------------------------------------------------------------- header */

export function HeaderPartWidget({ widget }: { widget: WidgetNode }) {
  const runtime = useBuilderRuntime()
  const theme = useClassicThemeSettings()
  const { count } = useCartSummary()
  switch (widget.type) {
    case "site-logo": {
      const height = propNum(widget.props, "height", 40)
      return (
        <Link href="/" className="inline-flex items-center gap-2" aria-label={runtime.siteName || "home"}>
          {runtime.logoUrl ? <Img priority src={runtime.logoUrl} alt={runtime.siteName || ""} style={{ height, width: "auto" }} /> : <strong className="text-lg font-black">{runtime.siteName}</strong>}
        </Link>
      )
    }
    case "nav-menu": {
      const links = parseLinks(widget.props.links, [])
      const vertical = propStr(widget.props, "direction", "row") === "column"
      if (!links.length) return <Placeholder label="منو — برچسب|نشانی در هر خط" />
      return (
        <nav className={`flex gap-4 text-sm font-semibold ${vertical ? "flex-col" : "flex-wrap items-center"}`}>
          {links.map((l) => (
            <Link key={l.label + l.href} href={l.href} className="text-foreground hover:text-primary">
              {l.label}
            </Link>
          ))}
        </nav>
      )
    }
    case "cart-button":
      return (
        <Link href="/cart" className="relative inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold">
          <ShoppingBag size={18} />
          {propBool(widget.props, "showLabel", true) ? <span>{propStr(widget.props, "label", "سبد خرید")}</span> : null}
          {count ? <span className="absolute -end-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{count.toLocaleString("fa-IR")}</span> : null}
        </Link>
      )
    case "account-button":
      return (
        <Link href="/account" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold">
          <UserRound size={18} />
          {propStr(widget.props, "label", "حساب کاربری")}
        </Link>
      )
    case "wishlist-button":
      return theme.commerce?.wishlist_enabled === false ? null : (
        <Link href="/wishlist" className="inline-flex items-center gap-2 text-sm font-semibold" aria-label="علاقه‌مندی‌ها">
          <Heart size={18} />
        </Link>
      )
    case "phone-link": {
      const phone = propStr(widget.props, "phone", "") || String(theme.footer?.support_phone ?? "")
      if (!phone) return <Placeholder label="تلفن — از تنظیمات فوتر یا فیلد ویجت" />
      return (
        <a href={`tel:${phone.replace(/[^\d+۰-۹]/g, "")}`} className="inline-flex items-center gap-2 text-sm font-semibold" dir="ltr">
          <Phone size={16} /> {phone}
        </a>
      )
    }
    default:
      return null
  }
}

/* ----------------------------------------------------------------- footer */

export function FooterPartWidget({ widget }: { widget: WidgetNode }) {
  const runtime = useBuilderRuntime()
  const theme = useClassicThemeSettings()
  const footer = theme.footer ?? {}
  switch (widget.type) {
    case "footer-links": {
      const links = parseLinks(widget.props.links, [])
      return (
        <div>
          {propStr(widget.props, "title", "") ? <strong className="mb-3 block text-sm font-extrabold">{propStr(widget.props, "title", "")}</strong> : null}
          <ul className="grid gap-2 text-sm">
            {links.map((l) => (
              <li key={l.label + l.href}>
                <Link href={l.href} className="text-foreground/75 hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )
    }
    case "contact-info": {
      const phone = propStr(widget.props, "phone", "") || String(footer.support_phone ?? "")
      const email = propStr(widget.props, "email", "") || String(footer.support_email ?? "")
      const address = propStr(widget.props, "address", "") || String(footer.address ?? "")
      if (!phone && !email && !address) return <Placeholder label="اطلاعات تماس — از تنظیمات فوتر" />
      return (
        <ul className="grid gap-2 text-sm text-foreground/80">
          {phone ? <li dir="ltr" className="text-end">{phone}</li> : null}
          {email ? <li dir="ltr" className="text-end">{email}</li> : null}
          {address ? <li>{address}</li> : null}
        </ul>
      )
    }
    case "trust-seals": {
      const html = String(footer.enamad_html ?? "")
      if (!html) return null
      // Admin-entered eNamad snippet (same source the classic footer renders).
      return <div className="sfc-trust-seals" dangerouslySetInnerHTML={{ __html: html }} />
    }
    case "copyright":
      // Fixed wording + Webina credit (platform policy — not editable).
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/70">
          <span>
            تمامی حقوق برای <strong>{runtime.siteName}</strong> محفوظ است.
          </span>
          <WebinaCredit />
        </div>
      )
    default:
      return null
  }
}

/* ---------------------------------------------------------------- blog post */

type PostData = { slug: string; title: string; excerpt?: string | null; body?: string | null; cover_url?: string | null; published_at?: string | null; author?: { name?: string } | string | null; category?: { name?: string; slug?: string } | null }

const postCache = new Map<string, Promise<PostData | null>>()

function usePost(): PostData | null | undefined {
  const runtime = useBuilderRuntime()
  const slug = runtime.postSlug || ""
  const [post, setPost] = useState<PostData | null | undefined>(undefined)
  useEffect(() => {
    let cancel = false
    if (!slug) {
      setPost(null)
      return
    }
    let job = postCache.get(slug)
    if (!job) {
      const base = process.env.NEXT_PUBLIC_API_URL ?? ""
      job = fetch(`${base}/api/v1/public/blog/${encodeURIComponent(slug)}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { data?: PostData } | null) => json?.data ?? null)
        .catch(() => null)
      postCache.set(slug, job)
    }
    void job.then((p) => {
      if (!cancel) setPost(p)
    })
    return () => {
      cancel = true
    }
  }, [slug])
  return post
}

export function PostPartWidget({ widget, editing, locale }: { widget: WidgetNode; editing: boolean; locale: string }) {
  const post = usePost()
  if (post === undefined) return null
  if (!post) return editing ? <Placeholder label="بخش نوشته — در قالب «پست تکی» با نوشتهٔ صفحه پر می‌شود" /> : null
  switch (widget.type) {
    case "post-title":
      return <h1 className="text-2xl font-extrabold text-foreground">{post.title}</h1>
    case "post-cover":
      return post.cover_url ? <Img src={post.cover_url} alt="" className="w-full rounded-2xl object-cover" /> : null
    case "post-meta": {
      const author = typeof post.author === "string" ? post.author : post.author?.name
      return (
        <p className="flex flex-wrap gap-3 text-xs text-foreground/60">
          {post.published_at ? <span>{formatDate(post.published_at, locale)}</span> : null}
          {author ? <span>{author}</span> : null}
          {post.category?.name ? (
            <Link href={`/blog/category/${post.category.slug ?? ""}`} className="hover:text-primary">
              {post.category.name}
            </Link>
          ) : null}
        </p>
      )
    }
    case "post-content":
      return post.body ? <div className="prose max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeBuilderHtml(post.body) }} /> : null
    default:
      return null
  }
}


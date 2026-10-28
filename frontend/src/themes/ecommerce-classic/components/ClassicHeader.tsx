"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"

import { cartCount, cartSnapshot, setQty, subscribeCart, type CartLine } from "@/builder/cart"
import { type ShopCategory, type ShopProduct } from "@/builder/catalog"
import { filterNavItems, useNavMenuItems } from "@/lib/nav-menus"
import { NavDrawerList, NavHeaderItem, NavItemLink, NavMegaPanel } from "./ClassicNavMenu"
import { categoryHref } from "@/kernel/store-slug-href"
import { setServerQty, useServerCart } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"
import { useCatalog } from "@/builder/storefront/use-catalog"

import {
  IconBag,
  IconBook,
  IconChevronLeft,
  IconHeart,
  IconHome,
  IconInfo,
  IconMail,
  IconMenu,
  IconMic,
  IconMinus,
  IconPercent,
  IconPin,
  IconPlus,
  IconQuestion,
  IconSearch,
  IconUser,
} from "./icons"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import {
  dealsCountdownParts,
  getSpeechRecognitionCtor,
  isVoiceExcludedPath,
  parseDealsEnd,
} from "@/themes/ecommerce-classic/lib/classic-chrome"

import { ClassicAmount, useDigits } from "./parts"
import { useClassicText } from "../lib/texts"
import { optImg } from "@/lib/image-url"

export const CLASSIC_NAV = [
  { label: "خانه", href: "/" },
  { label: "فروشگاه", href: "/shop" },
  { label: "مجله", href: "/blog" },
  { label: "سوالات متداول", href: "/faq" },
  { label: "تماس با ما", href: "/contact" },
  { label: "درباره ما", href: "/about" },
]

function navIcon(href: string, label: string): ReactNode {
  const key = `${href} ${label}`
  if (href === "/") return <IconHome size={16} />
  if (/blog|مجله/.test(key)) return <IconBook size={16} />
  if (/faq|سوال/.test(key)) return <IconQuestion size={16} />
  if (/contact|تماس/.test(key)) return <IconMail size={16} />
  if (/about|درباره/.test(key)) return <IconUser size={16} />
  if (/shop|فروشگاه/.test(key)) return <IconBag size={16} />
  return <IconInfo size={16} />
}

/** Hide the category/nav row on scroll-down, reveal on scroll-up (classic sticky header). */
function useNavReveal() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last.current
        setScrolled(y > 8)
        if (y < 120) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        last.current = y
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])
  return { hidden, scrolled }
}

function megaGridStyle(count: number): CSSProperties {
  const columns = Math.min(4, Math.max(1, Math.ceil(count / 8)))
  const rows = Math.min(10, Math.max(1, Math.ceil(count / columns)))
  return {
    ["--megamenu-columns" as string]: String(columns),
    ["--megamenu-rows" as string]: String(rows),
  }
}

function MegaChildList({
  items,
  onNavigate,
}: {
  items: ShopCategory[]
  onNavigate: () => void
}) {
  const flat = useMemo(() => {
    const rows: { key: string; slug: string; name: string; level: 2 | 3 }[] = []
    for (const child of items) {
      rows.push({ key: `l2-${child.slug}`, slug: child.slug, name: child.name, level: 2 })
      for (const g of child.children ?? []) {
        rows.push({ key: `l3-${child.slug}-${g.slug}`, slug: g.slug, name: g.name, level: 3 })
      }
    }
    return rows
  }, [items])

  if (!flat.length) return null
  return (
    <ul className="sfc-mega__level2" style={megaGridStyle(flat.length)}>
      {flat.map((row) => (
        <li key={row.key} className={row.level === 2 ? "sfc-mega__l2" : "sfc-mega__l3"}>
          <Link
            href={categoryHref(row.slug)}
            className={row.level === 2 ? "sfc-mega__l2-link" : "sfc-mega__l3-link"}
            onClick={onNavigate}
          >
            {row.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DeepMegaPanel({
  categories,
  activeCat,
  setActiveCat,
  onClose,
}: {
  categories: ShopCategory[]
  activeCat: number
  setActiveCat: (i: number) => void
  onClose: () => void
}) {
  const tx = useClassicText()
  const active = categories[activeCat] ?? categories[0]
  const children = active?.children ?? []

  if (!categories.length) {
    return (
      <div className="sfc-mega__panel sfc-mega__panel--empty" role="menu" aria-label="دسته‌بندی محصولات">
        <p className="sfc-mega__empty">{tx("header.mega_empty")}</p>
      </div>
    )
  }

  return (
    <div className="sfc-mega__panel" role="menu" aria-label="دسته‌بندی محصولات">
      <ul className="sfc-mega__parents" role="tablist">
        {categories.map((cat, index) => (
          <li key={cat.slug} role="none">
            <Link
              href={categoryHref(cat.slug)}
              role="tab"
              aria-selected={index === activeCat}
              className={index === activeCat ? "is-active" : ""}
              onMouseEnter={() => setActiveCat(index)}
              onFocus={() => setActiveCat(index)}
              onClick={onClose}
            >
              <span className="sfc-mega__parent-label">
                {cat.image ? <img loading="lazy" decoding="async" {...optImg(cat.image)} alt="" width={24} height={24} /> : null}
                <span>{cat.name}</span>
              </span>
              <IconChevronLeft size={14} />
            </Link>
          </li>
        ))}
      </ul>
      <div className="sfc-mega__childs">
        <Link href={active?.slug ? categoryHref(active.slug) : "/shop"} className="sfc-mega__all" onClick={onClose}>
          {tx("header.mega_all_prefix")} {active?.name}
          <IconChevronLeft size={14} />
        </Link>
        {children.length ? (
          <MegaChildList items={children} onNavigate={onClose} />
        ) : (
          <p className="sfc-mega__empty">{tx("header.mega_no_children")}</p>
        )}
      </div>
    </div>
  )
}

type MiniLine = {
  key: string
  name: string
  image?: string | null
  href?: string
  price: number
  qty: number
  onQty: (qty: number) => void
}

function MiniCartPanel({
  lines,
  total,
  auth,
  onClose,
}: {
  lines: MiniLine[]
  total: number
  auth: "loading" | "auth" | "guest"
  onClose: () => void
}) {
  const tx = useClassicText()
  const digits = useDigits()
  const checkoutHref = auth === "auth" ? "/checkout" : `/login?next=${encodeURIComponent("/checkout")}`

  if (auth === "loading") {
    return (
      <div className="sfc-mini-cart" role="dialog" aria-label="سبد خرید">
        <p className="sfc-mini-cart__empty">{tx("header.loading")}</p>
      </div>
    )
  }

  if (!lines.length) {
    return (
      <div className="sfc-mini-cart" role="dialog" aria-label="سبد خرید">
        <p className="sfc-mini-cart__empty">{tx("header.minicart_empty")}</p>
      </div>
    )
  }

  return (
    <div className="sfc-mini-cart" role="dialog" aria-label="سبد خرید">
      <ul className={`sfc-mini-cart__list ${lines.length > 3 ? "is-overflow" : ""}`}>
        {lines.map((line) => (
          <li key={line.key} className="sfc-mini-cart__item">
            <span className="sfc-mini-cart__img">
              {line.image ? <img loading="lazy" decoding="async" {...optImg(line.image)} alt="" /> : <span>{line.name.slice(0, 1)}</span>}
            </span>
            <div className="sfc-mini-cart__detail">
              {line.href ? (
                <Link href={line.href} className="sfc-mini-cart__name" onClick={onClose}>
                  {line.name}
                </Link>
              ) : (
                <span className="sfc-mini-cart__name">{line.name}</span>
              )}
              <div className="sfc-mini-cart__actions">
                <div className="sfc-stepper sfc-stepper--sm">
                  <button type="button" aria-label="افزایش" onClick={() => line.onQty(Math.min(99, line.qty + 1))}>
                    <IconPlus size={12} />
                  </button>
                  <span className="sfc-stepper__value">{digits(line.qty)}</span>
                  <button type="button" aria-label="کاهش" onClick={() => line.onQty(Math.max(0, line.qty - 1))}>
                    <IconMinus size={12} />
                  </button>
                </div>
                <ClassicAmount value={line.price * line.qty} className="sfc-mini-cart__price" />
              </div>
              <button type="button" className="sfc-mini-cart__remove" onClick={() => line.onQty(0)}>
                {tx("header.minicart_remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="sfc-mini-cart__subtotal">
        <p>{tx("header.minicart_subtotal")}</p>
        <ClassicAmount value={total} />
      </div>
      <div className="sfc-mini-cart__buttons">
        <Link href="/cart" className="sfc-mini-cart__btn sfc-mini-cart__btn--view" onClick={onClose}>
          {tx("header.minicart_view")}
        </Link>
        <Link href={checkoutHref} className="sfc-mini-cart__btn sfc-mini-cart__btn--checkout" onClick={onClose}>
          {tx("header.minicart_checkout")}
        </Link>
      </div>
    </div>
  )
}

function AccountMenuPanel({
  auth,
  onClose,
}: {
  auth: "loading" | "auth" | "guest"
  onClose: () => void
}) {
  const wishlistEnabled = useClassicThemeSettings().commerce?.wishlist_enabled !== false
  const tx = useClassicText()
  const logout = async () => {
    await quietApi("/api/v1/auth/logout", { method: "POST" })
    onClose()
    window.location.href = "/"
  }

  if (auth === "loading") {
    return (
      <div className="sfc-account-menu" role="menu" aria-label="حساب کاربری">
        <span className="sfc-account-menu__note">{tx("header.loading")}</span>
      </div>
    )
  }

  if (auth !== "auth") {
    return (
      <div className="sfc-account-menu" role="menu" aria-label="حساب کاربری">
        <Link href="/login?next=%2Faccount" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
          <IconUser size={16} />
          <span>{tx("header.account_login")}</span>
        </Link>
        <Link href="/order-tracking" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
          <IconBag size={16} />
          <span>{tx("header.account_tracking")}</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="sfc-account-menu" role="menu" aria-label="حساب کاربری">
      <Link href="/dashboard/account/orders" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
        <IconBag size={16} />
        <span>{tx("header.account_orders")}</span>
      </Link>
      {wishlistEnabled ? (
        <Link href="/wishlist" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
          <IconHeart size={16} />
          <span>{tx("header.account_wishlist")}</span>
        </Link>
      ) : null}
      <Link href="/dashboard/account/addresses" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
        <IconPin size={16} />
        <span>{tx("header.account_addresses")}</span>
      </Link>
      <Link href="/dashboard/account/profile" className="sfc-account-menu__link" role="menuitem" onClick={onClose}>
        <IconUser size={16} />
        <span>{tx("header.account_profile")}</span>
      </Link>
      <button type="button" className="sfc-account-menu__link sfc-account-menu__logout" role="menuitem" onClick={() => void logout()}>
        <span>{tx("header.account_logout")}</span>
      </button>
    </div>
  )
}

const SEARCH_HISTORY_KEY = "wb_search_history"

function readSearchHistory(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 8)
      : []
  } catch {
    return []
  }
}

function pushSearchHistory(term: string) {
  const cleaned = term.trim()
  if (!cleaned || typeof window === "undefined") return
  const next = [cleaned, ...readSearchHistory().filter((s) => s !== cleaned)].slice(0, 8)
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
}

function LiveSearch({
  query,
  setQuery,
  products,
  onSubmit,
  placeholder,
  ajax,
  ajaxMobile,
  searchSku,
  titleOnly,
  voiceEnabled,
  quickVoice,
  popularKeywords,
  bannerImage,
  bannerLink,
}: {
  query: string
  setQuery: (v: string) => void
  products: ShopProduct[]
  onSubmit: (override?: string) => void
  placeholder?: string
  ajax?: boolean
  ajaxMobile?: boolean
  searchSku?: boolean
  titleOnly?: boolean
  voiceEnabled?: boolean
  quickVoice?: boolean
  popularKeywords?: string[]
  bannerImage?: string
  bannerLink?: string
}) {
  const tx = useClassicText()
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceNote, setVoiceNote] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [isNarrow, setIsNarrow] = useState(false)
  const wrap = useRef<HTMLFormElement>(null)
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null)
  const q = query.trim().toLowerCase()
  const ajaxActive = Boolean(ajax) && (!isNarrow || ajaxMobile !== false)
  const hits = useMemo(() => {
    if (!ajaxActive || q.length < 1) return []
    return products
      .filter((p) => {
        const name = p.name.toLowerCase()
        if (titleOnly) return name.includes(q)
        const sku = String((p as { sku?: string }).sku ?? "").toLowerCase()
        return (
          name.includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (searchSku && sku.includes(q))
        )
      })
      .slice(0, 6)
  }, [products, q, ajaxActive, searchSku, titleOnly])

  const popular = useMemo(
    () => (popularKeywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 12),
    [popularKeywords],
  )
  const showEmptyPanel = open && q.length < 1
  const showHits = open && ajaxActive && q.length >= 1
  const panelOpen = showEmptyPanel || showHits

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 991px)")
    const sync = () => setIsNarrow(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    setHistory(readSearchHistory())
  }, [])

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [])

  const runSubmit = (override?: string) => {
    const term = (override ?? query).trim()
    if (term) {
      pushSearchHistory(term)
      setHistory(readSearchHistory())
    }
    setOpen(false)
    stopVoice()
    onSubmit(override)
  }

  const startVoice = () => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setVoiceNote("جستجوی صوتی در این مرورگر پشتیبانی نمی‌شود.")
      return
    }
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
    const recognition = new Ctor()
    recognition.lang = "fa-IR"
    recognition.continuous = false
    recognition.interimResults = true
    recognitionRef.current = recognition
    setVoiceNote("")
    setListening(true)
    recognition.onresult = (event) => {
      let transcript = ""
      for (let i = 0; i < event.results.length; i++) {
        const row = event.results[i]
        if (row?.[0]?.transcript) transcript = row[0].transcript
      }
      const cleaned = transcript.trim()
      if (!cleaned) return
      setQuery(cleaned)
      setOpen(true)
      const last = event.results[event.results.length - 1]
      if (last?.isFinal && quickVoice) {
        setListening(false)
        runSubmit(cleaned)
      }
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === "not-allowed") {
        setVoiceNote("دسترسی میکروفون مجاز نیست.")
      } else if (event.error && event.error !== "aborted" && event.error !== "no-speech") {
        setVoiceNote("خطا در تشخیص گفتار.")
      }
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    try {
      recognition.start()
    } catch {
      setListening(false)
      setVoiceNote("امکان شروع جستجوی صوتی نبود.")
    }
  }

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }

  return (
    <form
      ref={wrap}
      className="sfc-search"
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        runSubmit()
      }}
    >
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "جستجوی محصولات"}
        aria-label={placeholder || "جستجوی محصولات"}
        aria-autocomplete="list"
        aria-expanded={panelOpen}
      />
      {voiceEnabled ? (
        <button
          type="button"
          className={`sfc-search__voice ${listening ? "is-listening" : ""}`}
          aria-label={listening ? "توقف جستجوی صوتی" : "جستجوی صوتی"}
          aria-pressed={listening}
          title={listening ? "توقف" : "جستجوی صوتی"}
          onClick={() => (listening ? stopVoice() : startVoice())}
        >
          <IconMic size={18} />
        </button>
      ) : null}
      <button type="submit" aria-label="جستجو">
        <IconSearch size={18} />
      </button>
      {voiceNote ? <span className="sfc-search__voice-note">{voiceNote}</span> : null}
      {showEmptyPanel ? (
        <div className="sfc-search__suggest sfc-search__suggest--empty" role="listbox">
          {popular.length ? (
            <div className="sfc-search__block">
              <div className="sfc-search__block-title">{tx("header.search_popular_title")}</div>
              <div className="sfc-search__chips">
                {popular.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    className="sfc-search__chip"
                    onClick={() => {
                      setQuery(kw)
                      runSubmit(kw)
                    }}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="sfc-search__block">
            <div className="sfc-search__block-title">{tx("header.search_recent_title")}</div>
            {history.length ? (
              <div className="sfc-search__chips">
                {history.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="sfc-search__chip sfc-search__chip--muted"
                    onClick={() => {
                      setQuery(term)
                      runSubmit(term)
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : (
              <p className="sfc-search__empty-note">{tx("header.search_none")}</p>
            )}
          </div>
          {bannerImage ? (
            <a
              href={bannerLink || "#"}
              className="sfc-search__banner"
              onClick={() => setOpen(false)}
              target={bannerLink?.startsWith("http") ? "_blank" : undefined}
              rel={bannerLink?.startsWith("http") ? "noreferrer" : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" {...optImg(bannerImage)} alt="" />
            </a>
          ) : null}
        </div>
      ) : null}
      {showHits ? (
        <div className="sfc-search__suggest" role="listbox">
          {hits.length ? (
            hits.map((p) => (
              <Link
                key={p.slug}
                href={`/product/${p.slug}`}
                role="option"
                className="sfc-search__hit"
                onClick={() => setOpen(false)}
              >
                <span className="sfc-search__hit-img">
                  {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>{p.name.slice(0, 1)}</span>}
                </span>
                <span className="sfc-search__hit-body">
                  <strong>{p.name}</strong>
                  <span>{p.brand}</span>
                </span>
                <ClassicAmount value={p.price} />
              </Link>
            ))
          ) : (
            <p className="sfc-search__empty-note">{tx("header.search_no_result")}</p>
          )}
          <button
            type="button"
            className="sfc-search__all"
            onClick={() => {
              runSubmit()
            }}
          >
            {tx("header.search_view_all")}
          </button>
        </div>
      ) : null}
    </form>
  )
}

function DealsCountdown({ end, title }: { end?: string; title?: string }) {
  const digits = useDigits()
  const endMs = useMemo(() => parseDealsEnd(end), [end])
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (endMs == null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [endMs])
  if (endMs == null) return null
  const parts = dealsCountdownParts(endMs, now ?? endMs)
  if (parts.expired) {
    return title ? <span className="sfc-deals__timer sfc-deals__timer--ended">{title}</span> : null
  }
  const cells =
    parts.days > 0
      ? [parts.days, parts.hours, parts.minutes, parts.seconds]
      : [parts.hours, parts.minutes, parts.seconds]
  return (
    <span className="sfc-deals__timer" dir="ltr" aria-label={title || "زمان باقی‌مانده"}>
      {title ? <span className="sfc-deals__timer-title">{title}</span> : null}
      <span className="sfc-deals__timer-digits">
        {cells.map((value, index) => (
          <span key={index} className="sfc-deals__timer-cell">
            {index > 0 ? <i>:</i> : null}
            <b>
              {String(value)
                .padStart(2, "0")
                .split("")
                .map((ch) => digits(Number(ch)))
                .join("")}
            </b>
          </span>
        ))}
      </span>
    </span>
  )
}

export function ClassicHeader({
  siteName,
  logoUrl,
  links,
  menu,
}: {
  siteName: string
  logoUrl?: string | null
  links: { label: string; href: string }[]
  /** «منوها» slug picked in the builder header widget; otherwise the `header_main` location is used. */
  menu?: string
}) {
  const tx = useClassicText()
  const digits = useDigits()
  const router = useRouter()
  const pathname = usePathname() || "/"
  const theme = useClassicThemeSettings()
  const headerCfg = theme.header ?? {}
  const voiceEnabled =
    Boolean(headerCfg.voice_search) &&
    !isVoiceExcludedPath(pathname, (headerCfg as { voice_excluded_paths?: unknown }).voice_excluded_paths)
  const megaEnabled = headerCfg.mega_menu ?? theme.mega_menu ?? true
  const stickyDesktop = headerCfg.sticky_desktop !== false
  // header_style: classic | compact | centered (Theme Settings → عمومی/هدر)
  const headerStyle = ["compact", "centered"].includes(String(theme.header_style ?? "")) ? String(theme.header_style) : "classic"
  const topBarText = theme.show_top_bar !== false ? String(theme.top_bar_text ?? "").trim() : ""
  const bannerType = headerCfg.banner_type === "text" ? "text" : "image"
  const localCount = useSyncExternalStore(subscribeCart, cartCount, () => 0)
  const [localLines, setLocalLines] = useState<CartLine[]>([])
  const { cart, auth } = useServerCart()
  const count = auth === "auth" ? (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0) : localCount
  const catalog = useCatalog(24)
  const { hidden, scrolled } = useNavReveal()
  const [query, setQuery] = useState("")
  const [mega, setMega] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [activeCat, setActiveCat] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null)
  const megaRef = useRef<HTMLDivElement>(null)
  const cartRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const nav = links.length ? links : CLASSIC_NAV
  // «منوها»: assigned menus override the theme defaults; null → current behavior.
  const loggedIn = auth === "auth"
  const mainMenuRaw = useNavMenuItems(menu ? { slug: menu } : { location: "header_main" })
  const topMenuRaw = useNavMenuItems({ location: "top_bar" })
  const mobileMenuRaw = useNavMenuItems({ location: "mobile" })
  const megaMenuRaw = useNavMenuItems({ location: "mega_menu" })
  const mainMenu = mainMenuRaw ? filterNavItems(mainMenuRaw, loggedIn) : null
  const topMenu = topMenuRaw ? filterNavItems(topMenuRaw, loggedIn) : null
  const mobileMenu = mobileMenuRaw ? filterNavItems(mobileMenuRaw, loggedIn) : mainMenu
  const megaMenu = megaMenuRaw ? filterNavItems(megaMenuRaw, loggedIn) : null
  const categories = catalog.categories
  const pricing = cart?.pricing

  const miniLines: MiniLine[] =
    auth === "auth"
      ? (cart?.items ?? []).map((line) => ({
          key: String(line.id),
          name: line.product.name,
          image: line.product.cover_image_url || line.product.image_url,
          price: pricing?.lines?.find((row) => row.id === line.id)?.unit_price_minor ?? line.product.price_minor,
          qty: line.quantity,
          href: line.product.slug ? `/product/${line.product.slug}` : undefined,
          onQty: (qty: number) => void setServerQty(line.product.id, qty),
        }))
      : localLines.map((line) => ({
          key: line.slug,
          name: line.name,
          image: line.image,
          price: line.price,
          qty: line.qty,
          href: `/product/${line.slug}`,
          onQty: (qty: number) => setQty(line.slug, qty),
        }))
  const miniTotal =
    auth === "auth" && pricing?.subtotal_minor != null
      ? pricing.subtotal_minor
      : miniLines.reduce((sum, line) => sum + line.price * line.qty, 0)

  const openCart = () => {
    setAccountOpen(false)
    setCartOpen(true)
  }
  const openAccount = () => {
    setCartOpen(false)
    setAccountOpen(true)
  }

  const submit = (override?: string) => {
    const q = (override ?? query).trim()
    if (override != null) setQuery(override)
    router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop")
  }

  useEffect(() => {
    const sync = () => setLocalLines(cartSnapshot())
    sync()
    return subscribeCart(sync)
  }, [])

  useEffect(() => {
    if (!mega && !cartOpen && !accountOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMega(false)
      setCartOpen(false)
      setAccountOpen(false)
    }
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node
      if (mega && megaRef.current && !megaRef.current.contains(target)) setMega(false)
      if (cartOpen && cartRef.current && !cartRef.current.contains(target)) setCartOpen(false)
      if (accountOpen && accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDoc)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDoc)
    }
  }, [mega, cartOpen, accountOpen])

  const onMegaKey = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setMega((v) => !v)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setMega(true)
    } else if (event.key === "Escape") {
      setMega(false)
    }
  }

  return (
    <>
      {topBarText || topMenu?.length ? (
        <div className="sfc-topbar" role="note">
          <div className="sfc-container sfc-topbar__inner">
            {topBarText ? <span>{topBarText}</span> : null}
            {topMenu?.length ? (
              <nav className="sfc-topbar__menu" aria-label="منوی نوار بالا">
                {topMenu.map((it) => (
                  <NavItemLink key={it.id} item={it} />
                ))}
              </nav>
            ) : null}
          </div>
        </div>
      ) : null}
      <header
        data-header-style={headerStyle}
        className={`sfc-header sfc-header--${headerStyle} ${stickyDesktop ? "is-sticky-desktop" : "is-static-desktop"} ${hidden ? "is-nav-hidden" : ""} ${scrolled ? "is-scrolled" : ""} ${cartOpen || accountOpen ? "is-flyout-open" : ""}`}
      >
        <div className="sfc-header__top">
          <div className="sfc-container sfc-header__top-inner">
            <div className="sfc-header__brand-search">
              <button type="button" className="sfc-header__burger" aria-label="منو" onClick={() => setDrawer(true)}>
                <IconMenu size={22} />
              </button>
              <Link href="/" className="sfc-header__logo" aria-label={siteName}>
                {logoUrl ? <img loading="eager" fetchPriority="high" decoding="async" {...optImg(logoUrl, undefined, true)} alt={siteName} /> : <span className="sfc-header__mark">{siteName.slice(0, 1)}</span>}
                {!logoUrl ? <span className="sfc-header__name">{siteName}</span> : null}
              </Link>
              <LiveSearch
                query={query}
                setQuery={setQuery}
                products={catalog.products}
                onSubmit={submit}
                placeholder={headerCfg.search_placeholder}
                ajax={headerCfg.ajax_search !== false}
                ajaxMobile={headerCfg.ajax_search_mobile !== false}
                searchSku={Boolean(headerCfg.search_sku)}
                titleOnly={Boolean(headerCfg.search_title_only)}
                voiceEnabled={voiceEnabled}
                quickVoice={Boolean(headerCfg.quick_voice_search)}
                popularKeywords={(headerCfg.popular_search_keywords ?? [])
                  .map((row) => (typeof row === "string" ? row : String(row?.label ?? row?.title ?? "")))
                  .filter(Boolean)}
                bannerImage={headerCfg.search_banner_image || undefined}
                bannerLink={headerCfg.search_banner_link || undefined}
              />
            </div>
            <div className="sfc-header__actions">
              <div
                ref={accountRef}
                className={`sfc-login-wrap ${accountOpen ? "is-open" : ""}`}
                onMouseEnter={() => {
                  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) openAccount()
                }}
                onMouseLeave={() => {
                  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setAccountOpen(false)
                }}
              >
                <span className="sfc-login-wrap__shadow" aria-hidden="true" />
                <button
                  type="button"
                  className="sfc-login"
                  aria-expanded={accountOpen}
                  aria-haspopup="true"
                  onClick={() => (accountOpen ? setAccountOpen(false) : openAccount())}
                >
                  <IconUser size={20} />
                  <span className="sfc-login__text">{auth === "auth" ? "حساب کاربری" : tx("header.account_login")}</span>
                </button>
                {accountOpen ? <AccountMenuPanel auth={auth} onClose={() => setAccountOpen(false)} /> : null}
              </div>
              <div
                ref={cartRef}
                className={`sfc-cart-wrap ${cartOpen ? "is-open" : ""}`}
                onMouseEnter={() => {
                  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) openCart()
                }}
                onMouseLeave={() => {
                  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setCartOpen(false)
                }}
              >
                <button
                  type="button"
                  className="sfc-cart-btn"
                  aria-label="سبد خرید"
                  aria-expanded={cartOpen}
                  aria-haspopup="true"
                  onClick={() => (cartOpen ? setCartOpen(false) : openCart())}
                >
                  <span className="sfc-cart-btn__title">{tx("header.cart_label")}</span>
                  <span className="sfc-cart-btn__count">{count > 0 ? digits(count) : ":)"}</span>
                </button>
                {cartOpen ? (
                  <MiniCartPanel
                    lines={miniLines}
                    total={miniTotal}
                    auth={auth}
                    onClose={() => setCartOpen(false)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="sfc-header__nav" aria-hidden={hidden || undefined}>
          <div className="sfc-container sfc-header__nav-inner">
            <div className="sfc-header__nav-main">
              {megaEnabled ? (
                <div
                  ref={megaRef}
                  className={`sfc-mega ${mega ? "is-open" : ""}`}
                  onMouseEnter={() => setMega(true)}
                  onMouseLeave={() => setMega(false)}
                >
                  <button
                    type="button"
                    className="sfc-mega__trigger"
                    aria-expanded={mega}
                    aria-haspopup="true"
                    onClick={() => setMega((v) => !v)}
                    onKeyDown={onMegaKey}
                  >
                    <IconMenu size={20} />
                    <span>{headerCfg.mega_menu_title || "دسته‌بندی محصولات"}</span>
                  </button>
                  {mega && megaMenu?.length ? (
                    <NavMegaPanel items={megaMenu} onClose={() => setMega(false)} />
                  ) : mega ? (
                    <DeepMegaPanel
                      categories={categories}
                      activeCat={activeCat}
                      setActiveCat={setActiveCat}
                      onClose={() => setMega(false)}
                    />
                  ) : null}
                </div>
              ) : null}
              {megaEnabled ? <span className="sfc-header__sep" aria-hidden="true" /> : null}
              <nav className="sfc-header__links" aria-label="منوی اصلی">
                {mainMenu ? mainMenu.map((it) => <NavHeaderItem key={it.id} item={it} icon={navIcon(it.url ?? "", it.label)} />) : nav.map((link) => (
                  <Link key={link.href + link.label} href={link.href}>
                    <span className="sfc-header__link-icon">{navIcon(link.href, link.label)}</span>
                    <span>{link.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
            {headerCfg.deals_enabled !== false ? (
              <div className="sfc-header__deals">
                <span className="sfc-header__sep" aria-hidden="true" />
                <Link href={headerCfg.deals_link || "/amazing-offers"} className="sfc-deals">
                  <span className="sfc-deals__title">{headerCfg.deals_title || "شگفت انگیز"}</span>
                  {headerCfg.deals_subtitle ? (
                    <span className="sfc-deals__sub">{headerCfg.deals_subtitle}</span>
                  ) : null}
                  <DealsCountdown end={headerCfg.deals_timer_end} title={headerCfg.deals_timer_title} />
                  <span className="sfc-deals__badge">
                    <IconPercent size={12} />
                  </span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {cartOpen ? (
        <button
          type="button"
          className="sfc-mini-cart-overlay"
          aria-label="بستن سبد"
          onClick={() => setCartOpen(false)}
        />
      ) : null}
      {headerCfg.banner_enabled ? (
        <div
          className={`sfc-header-banner sfc-header-banner--${bannerType}`}
          style={{
            background: headerCfg.banner_bg || "var(--sfc-topbar-bg)",
            color: headerCfg.banner_text_color || "var(--sfc-topbar-fg)",
          }}
        >
          <div className="sfc-container sfc-header-banner__inner">
            {headerCfg.banner_link ? (
              <a href={headerCfg.banner_link} className="sfc-header-banner__link">
                {bannerType === "image" && headerCfg.banner_image_desktop ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--desktop"
                    src={headerCfg.banner_image_desktop}
                    alt=""
                  />
                ) : null}
                {bannerType === "image" && headerCfg.banner_image_mobile ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--mobile"
                    src={headerCfg.banner_image_mobile}
                    alt=""
                  />
                ) : null}
                {headerCfg.banner_text ? <span>{headerCfg.banner_text}</span> : null}
              </a>
            ) : (
              <>
                {bannerType === "image" && headerCfg.banner_image_desktop ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--desktop"
                    src={headerCfg.banner_image_desktop}
                    alt=""
                  />
                ) : null}
                {headerCfg.banner_text ? <span>{headerCfg.banner_text}</span> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      {drawer ? (
        <div className="sfc-drawer" role="dialog" aria-modal="true">
          <button type="button" className="sfc-drawer__scrim" aria-label="بستن" onClick={() => setDrawer(false)} />
          <div className="sfc-drawer__sheet">
            <div className="sfc-drawer__head">
              <strong>{siteName}</strong>
              <button type="button" onClick={() => setDrawer(false)} aria-label="بستن">
                ×
              </button>
            </div>
            <nav className="sfc-drawer__links">
              {mobileMenu ? (
                <NavDrawerList items={mobileMenu} onNavigate={() => setDrawer(false)} />
              ) : (
                nav.map((link) => (
                  <Link key={link.href + link.label} href={link.href} onClick={() => setDrawer(false)}>
                    {navIcon(link.href, link.label)}
                    {link.label}
                  </Link>
                ))
              )}
            </nav>
            <p className="sfc-drawer__label">{tx("header.drawer_categories")}</p>
            <nav className="sfc-drawer__links sfc-drawer__cats">
              {categories.map((cat) => {
                const open = drawerOpen === cat.slug
                const kids = cat.children ?? []
                return (
                  <div key={cat.slug} className="sfc-drawer__cat">
                    <div className="sfc-drawer__cat-row">
                      <Link href={categoryHref(cat.slug)} onClick={() => setDrawer(false)}>
                        {cat.name}
                      </Link>
                      {kids.length ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label="زیرمجموعه‌ها"
                          onClick={() => setDrawerOpen(open ? null : cat.slug)}
                        >
                          {open ? "−" : "+"}
                        </button>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="sfc-drawer__sub">
                        {kids.map((child) => (
                          <Link key={child.slug} href={categoryHref(child.slug)} onClick={() => setDrawer(false)}>
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  )
}

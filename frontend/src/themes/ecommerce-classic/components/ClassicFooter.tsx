"use client"
import { AfterLoadHtml } from "@/components/perf/AfterLoadHtml"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react"

import { useCatalog, useFeaturedProducts } from "@/builder/storefront/use-catalog"
import type { ShopProduct } from "@/builder/catalog"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import {
  IconBadge,
  IconCard,
  IconChevronLeft,
  IconClock,
  IconMail,
  IconPhone,
  IconPin,
  IconShield,
  IconTruck,
} from "./icons"
import { WebinaCredit } from "@/components/brand/WebinaCredit"
import { ClassicAmount } from "./parts"
import { useClassicText } from "../lib/texts"
import { optImg } from "@/lib/image-url"

const FALLBACK_GUIDE = {
  title: "راهنمای مشتریان",
  links: [
    { label: "حساب کاربری من", href: "/account" },
    { label: "سبد خرید", href: "/cart" },
    { label: "سوالات متداول", href: "/pages/faq" },
    { label: "تماس با ما", href: "/pages/contact" },
    { label: "درباره ما", href: "/pages/about" },
    { label: "شرایط و قوانین", href: "/pages/terms" },
  ],
}

const DEFAULT_SERVICES = [
  { title: "ارسال سریع", text: "تحویل اکسپرس", icon: "truck" },
  { title: "پرداخت امن", text: "امکان پرداخت اقساطی", icon: "card" },
  { title: "ضمانت بازگشت", text: "۷ روز ضمانت بازگشت کالا", icon: "shield" },
  { title: "اصالت کالا", text: "تضمین اصالت و اورجینال بودن", icon: "badge" },
]

const SOCIAL_DEFS = [
  { key: "social_instagram", label: "اینستاگرام", icon: "/brand/connect/instagram.svg" },
  { key: "social_whatsapp", label: "واتساپ", icon: "/brand/connect/whatsapp.svg" },
  { key: "social_telegram", label: "تلگرام", icon: "/brand/connect/telegram.svg" },
  { key: "social_bale", label: "بله", icon: "/brand/connect/bale.png" },
  { key: "social_eitaa", label: "ایتا", icon: "/brand/connect/eitaa.png" },
  { key: "social_rubika", label: "روبیکا", icon: "/brand/connect/rubika.png" },
  { key: "social_igap", label: "آیگپ", icon: "/brand/connect/igap.png" },
  { key: "social_facebook", label: "فیسبوک", icon: "" },
  { key: "social_twitter", label: "ایکس", icon: "" },
  { key: "social_soroush", label: "سروش", icon: "" },
] as const


function parseLinkColumns(
  raw: unknown,
): { title: string; links: { label: string; href: string }[] }[] {
  if (!Array.isArray(raw) || !raw.length) return [FALLBACK_GUIDE]
  return raw.map((col) => {
    const row = col && typeof col === "object" ? (col as Record<string, unknown>) : {}
    const links = Array.isArray(row.links)
      ? row.links.map((l) => {
          const item = l && typeof l === "object" ? (l as Record<string, unknown>) : {}
          return { label: String(item.label ?? ""), href: String(item.href ?? "/") }
        })
      : []
    return { title: String(row.title ?? ""), links }
  })
}

function serviceIcon(icon: string): ReactNode {
  const key = icon.trim().toLowerCase()
  if (key === "truck") return <IconTruck size={26} />
  if (key === "card") return <IconCard size={26} />
  if (key === "shield") return <IconShield size={26} />
  if (key === "badge") return <IconBadge size={26} />
  if (/^https?:\/\//i.test(icon) || icon.startsWith("/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img loading="lazy" decoding="async" {...optImg(icon)} alt="" width={26} height={26} />
    )
  }
  return <IconBadge size={26} />
}

function ProductSlideList({
  title,
  products,
  pageSize = 4,
}: {
  title: string
  products: ShopProduct[]
  pageSize?: number
}) {
  const [slide, setSlide] = useState(0)
  const maxSlide = Math.max(0, Math.ceil(products.length / pageSize) - 1)
  const visible = useMemo(() => {
    const start = slide * pageSize
    return products.slice(start, start + pageSize)
  }, [products, slide, pageSize])

  if (!products.length) return null

  return (
    <div className="sfc-footer__bestsellers">
      <div className="sfc-footer__bestsellers-head">
        <button
          type="button"
          className="sfc-footer__nav-btn"
          aria-label="قبلی"
          disabled={slide <= 0}
          onClick={() => setSlide((s) => Math.max(0, s - 1))}
        >
          <IconChevronLeft size={14} />
        </button>
        <h3 className="sfc-footer__title sfc-footer__title--center">{title}</h3>
        <button
          type="button"
          className="sfc-footer__nav-btn"
          aria-label="بعدی"
          disabled={slide >= maxSlide}
          onClick={() => setSlide((s) => Math.min(maxSlide, s + 1))}
        >
          <span className="sfc-footer__nav-flip">
            <IconChevronLeft size={14} />
          </span>
        </button>
      </div>
      <div className="sfc-footer__bestsellers-list">
        {visible.map((p) => (
          <Link key={p.slug} href={`/product/${p.slug}`} className="sfc-footer__best-item">
            <span className="sfc-footer__best-name">{p.name}</span>
            <ClassicAmount value={p.price} className="sfc-footer__best-price" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function useRecentlyViewedProducts(): ShopProduct[] {
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
  return slugs
    .map((slug) => catalog.products.find((p) => p.slug === slug))
    .filter((p): p is ShopProduct => Boolean(p))
}

export function ClassicFooter({
  siteName,
  phone,
  email,
  about,
  address,
}: {
  siteName: string
  phone?: string
  email?: string
  about?: string
  address?: string
}) {
  const tx = useClassicText()
  const theme = useClassicThemeSettings()
  const cfg = theme.footer ?? {}
  const limit = Math.max(1, Math.min(20, Number(cfg.bestsellers_limit ?? 6) || 6))
  const products = useFeaturedProducts(limit)
  const recent = useRecentlyViewedProducts()

  const linkColumns = parseLinkColumns(cfg.footer_links)
  const brandsTitle = String(cfg.brands_title || "برندهای مطرح")
  const brandLinks = Array.isArray(cfg.brand_links)
    ? cfg.brand_links.map((l) => ({
        label: String(l.label ?? ""),
        href: String(l.href ?? "/"),
      }))
    : []

  const services =
    Array.isArray(cfg.service_badges) && cfg.service_badges.length
      ? cfg.service_badges.map((s) => ({
          title: String(s.title ?? ""),
          text: String(s.text ?? ""),
          icon: String(s.icon ?? s.image ?? "badge"),
        }))
      : DEFAULT_SERVICES

  const bestsellersTitle = String(cfg.bestsellers_title || "پرفروش‌ترین محصولات")
  const recentTitle = String(cfg.recently_viewed_title || "آخرین محصولاتی که بازدید کردید")
  const showRecent = cfg.show_recently_viewed !== false
  const trustTitle = String(cfg.trust_title || "چگونه به ما اعتماد کنید")
  const trustText = String(cfg.trust_text || "")
  const socialTitle = String(cfg.social_title || "ما در شبکه‌های اجتماعی")
  const contactTitle = String(cfg.contact_title || "مرکز تماس مشتریان")
  const tagline1 = String(cfg.contact_tagline_1 || "")
  const tagline2 = String(cfg.contact_tagline_2 || "")
  const supportPhone = String(cfg.support_phone || phone || "")
  const supportEmail = String(cfg.support_email || email || "")
  const supportHours = String(cfg.support_hours || "")
  const addressText = String(cfg.address || address || "")
  const aboutText = String(cfg.about || about || "")
  const footerLogo = String(cfg.footer_logo || "")
  const copyrightYears = String(cfg.copyright_years || "").trim()
  const emailTitle = String(cfg.support_email_title || "").trim()
  const addressTitle = String(cfg.address_title || "").trim()
  const footerCols = Math.max(1, Math.min(6, Number(theme.footer_columns ?? 0) || 0))

  const socials = SOCIAL_DEFS.map((def) => ({
    ...def,
    href: String((cfg as Record<string, unknown>)[def.key] ?? ""),
  })).filter((s) => s.href)

  const badges = Array.isArray(cfg.payment_methods) ? cfg.payment_methods : []
  const hasNamad = Boolean(cfg.enamad_html || cfg.samandehi_html || cfg.ecommerce_badge_html)

  return (
    <footer className="sfc-footer">
      <div className="sfc-container">
        {services.length ? (
          <div className="sfc-footer__services">
            {services.map((s, i) => (
              <div key={`${s.title}-${i}`} className="sfc-footer__service">
                <span className="sfc-footer__service-icon">{serviceIcon(s.icon)}</span>
                <div>
                  <strong>{s.title}</strong>
                  {s.text ? <span>{s.text}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="sfc-footer__board" style={footerCols ? ({ "--sfc-footer-cols": String(footerCols) } as CSSProperties) : undefined} data-cols={footerCols || undefined}>
          {linkColumns.map((col, idx) => (
            <nav key={`${col.title}-${idx}`} className="sfc-footer__col" aria-label={col.title}>
              <h3 className="sfc-footer__title">{col.title || FALLBACK_GUIDE.title}</h3>
              <div className="sfc-footer__link-grid">
                {col.links.map((link) => (
                  <Link key={`${link.href}-${link.label}`} href={link.href || "/"}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}

          {brandLinks.length ? (
            <nav className="sfc-footer__col" aria-label={brandsTitle}>
              <h3 className="sfc-footer__title">{brandsTitle}</h3>
              <div className="sfc-footer__link-grid">
                {brandLinks.map((link) => (
                  <Link key={`${link.href}-${link.label}`} href={link.href || "/"}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ) : null}

          <ProductSlideList title={bestsellersTitle} products={products} />

          {showRecent ? <ProductSlideList title={recentTitle} products={recent} /> : null}

          <div className="sfc-footer__trust-social">
            {hasNamad || trustText ? (
            <div className="sfc-footer__trust">
              <h3 className="sfc-footer__title">
                {trustTitle}
                <span className="sfc-footer__help" aria-hidden="true">
                  ؟
                </span>
              </h3>
              {trustText ? <p className="sfc-footer__trust-text">{trustText}</p> : null}
              <div className="sfc-footer__namad" aria-label="نمادهای اعتماد">
                {cfg.enamad_html ? (
                  <AfterLoadHtml className="sfc-footer__namad-item" html={String(cfg.enamad_html)} />
                ) : null}
                {cfg.samandehi_html ? (
                  <AfterLoadHtml className="sfc-footer__namad-item" html={String(cfg.samandehi_html)} />
                ) : null}
                {cfg.ecommerce_badge_html ? (
                  <AfterLoadHtml className="sfc-footer__namad-item" html={String(cfg.ecommerce_badge_html)} />
                ) : null}
                
              </div>
            </div>
            ) : null}

            {socials.length ? (
              <div className="sfc-footer__social-block">
                <h3 className="sfc-footer__title sfc-footer__title--muted">{socialTitle}</h3>
                <div className="sfc-footer__social">
                  {socials.map((s) => (
                    <a
                      key={s.key}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="sfc-footer__social-link"
                      aria-label={s.label}
                      title={s.label}
                    >
                      {s.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" {...optImg(s.icon)} alt="" width={20} height={20} />
                      ) : (
                        <i aria-hidden="true">{s.label.slice(0, 1)}</i>
                      )}
                      <span>{s.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="sfc-footer__contact-bar">
          <div className="sfc-footer__contact-copy">
            <h3 className="sfc-footer__title">{contactTitle}</h3>
            {tagline1 ? <p>{tagline1}</p> : null}
            {tagline2 ? <p>{tagline2}</p> : null}
          </div>
          <div className="sfc-footer__contact-meta">
            {supportPhone ? (
              <a href={`tel:${supportPhone}`} className="sfc-footer__row">
                <IconPhone size={16} />
                <bdi>{supportPhone}</bdi>
              </a>
            ) : null}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`} className="sfc-footer__row">
                <IconMail size={16} />
                {emailTitle ? <span className="sfc-footer__row-label">{emailTitle}:</span> : null}
                <span dir="ltr">{supportEmail}</span>
              </a>
            ) : null}
            {addressText ? (
              <div className="sfc-footer__row">
                <IconPin size={16} />
                {addressTitle ? <span className="sfc-footer__row-label">{addressTitle}:</span> : null}
                <span>{addressText}</span>
              </div>
            ) : null}
            {supportHours ? (
              <div className="sfc-footer__row">
                <IconClock size={16} />
                <span>{supportHours}</span>
              </div>
            ) : null}
          </div>
        </div>

        {(aboutText || footerLogo) && (
          <div className="sfc-footer__about">
            {footerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" {...optImg(footerLogo, undefined, true)} alt={siteName} className="sfc-footer__about-logo" />
            ) : null}
            {aboutText ? <p>{aboutText}</p> : null}
          </div>
        )}

        <div className="sfc-footer__totop">
          <span className="sfc-footer__totop-line" aria-hidden="true" />
          <button
            type="button"
            className="sfc-footer__totop-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <i className="sfc-chip-arrow sfc-chip-arrow--up" aria-hidden="true">
              <IconChevronLeft size={14} />
            </i>
            <span>{tx("footer.back_to_top")}</span>
          </button>
          <span className="sfc-footer__totop-line" aria-hidden="true" />
        </div>

        {badges.length ? (
          <div className="sfc-footer__badges">
            {badges.map((pm, i) => {
              const title = String(pm.title ?? "")
              const image = String(pm.image ?? "")
              const href = String(pm.href ?? "").trim()
              const inner = (
                <>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" {...optImg(image)} alt="" />
                  ) : null}
                  <span>{title}</span>
                </>
              )
              return href ? (
                <a key={i} href={href} className="sfc-footer__badge" target="_blank" rel="noreferrer">
                  {inner}
                </a>
              ) : (
                <span key={i} className="sfc-footer__badge">
                  {inner}
                </span>
              )
            })}
          </div>
        ) : null}

        {/* Copyright wording and the Webina credit are fixed platform-wide (see settings hint). */}
        <div className="sfc-footer__copy">
          <div className="sfc-footer__copy-main">
            <span>
              تمامی حقوق برای <strong>{siteName}</strong> محفوظ است.
            </span>
            {copyrightYears ? <span className="sfc-footer__copy-years">{copyrightYears}</span> : null}
          </div>
          <WebinaCredit />
        </div>
      </div>
    </footer>
  )
}

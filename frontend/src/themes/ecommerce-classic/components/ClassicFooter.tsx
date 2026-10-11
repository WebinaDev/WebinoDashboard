"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { useFeaturedProducts } from "@/builder/storefront/use-catalog"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { IconChevronLeft, IconClock, IconMail, IconPhone, IconPin } from "./icons"
import { ClassicAmount } from "./parts"

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

const WEBINA_CREDIT_HREF = "https://webina.dev"
const WEBINA_CREDIT_TITLE = "طراحی و توسعه توسط"
const WEBINA_CREDIT_NAME = "توسعه کسب و کار وبینا"

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
  const theme = useClassicThemeSettings()
  const cfg = theme.footer ?? {}
  const limit = Math.max(1, Math.min(20, Number(cfg.bestsellers_limit ?? 6) || 6))
  const products = useFeaturedProducts(limit)
  const [slide, setSlide] = useState(0)
  const pageSize = 4
  const maxSlide = Math.max(0, Math.ceil(products.length / pageSize) - 1)
  const visibleProducts = useMemo(() => {
    const start = slide * pageSize
    return products.slice(start, start + pageSize)
  }, [products, slide])

  const guideColumns = parseLinkColumns(cfg.footer_links)
  const brandsTitle = String(cfg.brands_title || "برندهای مطرح")
  const brandLinks = Array.isArray(cfg.brand_links)
    ? cfg.brand_links.map((l) => ({
        label: String(l.label ?? ""),
        href: String(l.href ?? "/"),
      }))
    : []

  const bestsellersTitle = String(cfg.bestsellers_title || "پرفروش‌ترین محصولات")
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

  const socials = SOCIAL_DEFS.map((def) => ({
    ...def,
    href: String((cfg as Record<string, unknown>)[def.key] ?? ""),
  })).filter((s) => s.href)

  const badges = Array.isArray(cfg.payment_methods) ? cfg.payment_methods : []

  return (
    <footer className="sfc-footer">
      <div className="sfc-container">
        <div className="sfc-footer__board">
          {guideColumns.map((col) => (
            <nav key={col.title || "guide"} className="sfc-footer__col" aria-label={col.title}>
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
              <h3 className="sfc-footer__title sfc-footer__title--center">{bestsellersTitle}</h3>
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
              {visibleProducts.map((p) => (
                <Link key={p.slug} href={`/product/${p.slug}`} className="sfc-footer__best-item">
                  <span className="sfc-footer__best-name">{p.name}</span>
                  <ClassicAmount value={p.price} className="sfc-footer__best-price" />
                </Link>
              ))}
            </div>
          </div>

          <div className="sfc-footer__trust-social">
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
                  <div className="sfc-footer__namad-item" dangerouslySetInnerHTML={{ __html: cfg.enamad_html }} />
                ) : (
                  <span className="sfc-footer__namad-item">نماد اعتماد</span>
                )}
                {cfg.samandehi_html ? (
                  <div className="sfc-footer__namad-item" dangerouslySetInnerHTML={{ __html: cfg.samandehi_html }} />
                ) : null}
                {cfg.ecommerce_badge_html ? (
                  <div
                    className="sfc-footer__namad-item"
                    dangerouslySetInnerHTML={{ __html: cfg.ecommerce_badge_html }}
                  />
                ) : null}
              </div>
            </div>

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
                        <img src={s.icon} alt="" width={22} height={22} />
                      ) : (
                        <span>{s.label.slice(0, 1)}</span>
                      )}
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
                <span dir="ltr">{supportEmail}</span>
              </a>
            ) : null}
            {addressText ? (
              <div className="sfc-footer__row">
                <IconPin size={16} />
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
              <img src={footerLogo} alt={siteName} className="sfc-footer__about-logo" />
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
            <span>برگشت به بالا</span>
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
                    <img src={image} alt="" />
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

        <div className="sfc-footer__copy">
          <div className="sfc-footer__copy-main">
            <span>
              تمامی حقوق برای <strong>{siteName}</strong> محفوظ است.
            </span>
            {copyrightYears ? <span className="sfc-footer__copy-years">{copyrightYears}</span> : null}
          </div>
          <a
            href={WEBINA_CREDIT_HREF}
            target="_blank"
            rel="noreferrer"
            className="sfc-footer__made"
          >
            <span className="sfc-footer__made-mark" aria-hidden="true">
              W
            </span>
            <span className="sfc-footer__made-text">
              <span>{WEBINA_CREDIT_TITLE}</span>
              <strong>{WEBINA_CREDIT_NAME}</strong>
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}

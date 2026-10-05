"use client"

import Link from "next/link"
import { useState } from "react"

import { useCatalog } from "@/builder/storefront/use-catalog"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { IconCard, IconChevronLeft, IconClock, IconMail, IconPhone, IconPin, IconShield, IconTruck, IconBadge } from "./icons"
import { ClassicAmount } from "./parts"

const FALLBACK_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "راهنمای خرید",
    links: [
      { label: "نحوه ثبت سفارش", href: "/pages/how-to-order" },
      { label: "شیوه‌های پرداخت", href: "/pages/payment" },
      { label: "رویه ارسال سفارش", href: "/pages/shipping" },
      { label: "رویه بازگرداندن کالا", href: "/pages/returns" },
      { label: "سوالات متداول", href: "/pages/faq" },
    ],
  },
  {
    title: "دسترسی سریع",
    links: [
      { label: "فروشگاه", href: "/shop" },
      { label: "پیشنهاد شگفت‌انگیز", href: "/amazing-offers" },
      { label: "مجله", href: "/blog" },
      { label: "مقایسه محصولات", href: "/compare" },
      { label: "حساب کاربری", href: "/account" },
    ],
  },
  {
    title: "درباره ما",
    links: [
      { label: "درباره ما", href: "/pages/about" },
      { label: "تماس با ما", href: "/pages/contact" },
      { label: "قوانین و مقررات", href: "/pages/terms" },
      { label: "حریم خصوصی", href: "/pages/privacy" },
    ],
  },
]

const SOCIAL_KEYS = [
  ["social_telegram", "تلگرام"],
  ["social_twitter", "ایکس"],
  ["social_whatsapp", "واتساپ"],
  ["social_facebook", "فیسبوک"],
  ["social_igap", "آیگپ"],
  ["social_rubika", "روبیکا"],
  ["social_soroush", "سروش"],
  ["social_bale", "بله"],
  ["social_eitaa", "ایتا"],
] as const

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
  const catalog = useCatalog(4)
  const theme = useClassicThemeSettings()
  const cfg = theme.footer ?? {}
  const [expanded, setExpanded] = useState(false)
  const latest = catalog.products.slice(0, 3)

  const supportPhone = cfg.support_phone || phone || ""
  const supportEmail = cfg.support_email || email || ""
  const aboutText = cfg.about || about || ""
  const addressText = cfg.address || address || ""
  const trust = cfg.trust_text || ""

  const columns =
    Array.isArray(cfg.footer_links) && cfg.footer_links.length
      ? cfg.footer_links.map((col) => ({
          title: String(col.title ?? ""),
          links: Array.isArray(col.links)
            ? col.links.map((l) => ({ label: String(l.label ?? ""), href: String(l.href ?? "/") }))
            : [],
        }))
      : FALLBACK_COLUMNS

  const socials = SOCIAL_KEYS.map(([key, label]) => ({
    key,
    label,
    href: String((cfg as Record<string, unknown>)[key] ?? ""),
  })).filter((s) => s.href)

  return (
    <footer className="sfc-footer">
      <div className="sfc-container">
        <div className="sfc-footer__totop">
          <span className="sfc-footer__totop-line" aria-hidden="true" />
          <button
            type="button"
            className="sfc-footer__totop-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <span>بازگشت به بالا</span>
            <i className="sfc-chip-arrow sfc-chip-arrow--up" aria-hidden="true">
              <IconChevronLeft size={14} />
            </i>
          </button>
          <span className="sfc-footer__totop-line" aria-hidden="true" />
        </div>

        <div className="sfc-footer__services">
          {[
            { icon: <IconTruck size={26} />, title: "ارسال سریع", text: "تحویل اکسپرس" },
            { icon: <IconCard size={26} />, title: "پرداخت امن", text: "امکان پرداخت اقساطی" },
            { icon: <IconShield size={26} />, title: "ضمانت بازگشت", text: "۷ روز ضمانت بازگشت کالا" },
            { icon: <IconBadge size={26} />, title: "اصالت کالا", text: "تضمین اصالت و اورجینال بودن" },
          ].map((s) => (
            <div key={s.title} className="sfc-footer__service">
              <span className="sfc-footer__service-icon">{s.icon}</span>
              <div>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sfc-footer__grid">
          <div className="sfc-footer__contact">
            <h3 className="sfc-footer__title">{siteName}</h3>
            {supportPhone ? (
              <a href={`tel:${supportPhone}`} className="sfc-footer__row">
                <IconPhone size={16} />
                <span>
                  تلفن پشتیبانی: <bdi>{supportPhone}</bdi>
                </span>
              </a>
            ) : null}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`} className="sfc-footer__row">
                <IconMail size={16} />
                <span dir="ltr">{supportEmail}</span>
              </a>
            ) : null}
            <div className="sfc-footer__row">
              <IconClock size={16} />
              <span>شنبه تا پنجشنبه، ۹ تا ۱۸</span>
            </div>
            {addressText ? (
              <div className="sfc-footer__row">
                <IconPin size={16} />
                <span>{addressText}</span>
              </div>
            ) : null}
            {socials.length ? (
              <div className="sfc-footer__social">
                {socials.map((s) => (
                  <a key={s.key} href={s.href} target="_blank" rel="noreferrer" className="sfc-footer__social-link">
                    {s.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          {columns.map((col) => (
            <nav key={col.title} className="sfc-footer__col" aria-label={col.title}>
              <h3 className="sfc-footer__title">{col.title}</h3>
              {col.links.map((link) => (
                <Link key={link.href + link.label} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
          <div className="sfc-footer__latest">
            <h3 className="sfc-footer__title">جدیدترین محصولات</h3>
            {latest.map((p) => (
              <Link key={p.slug} href={`/product/${p.slug}`} className="sfc-footer__latest-item">
                <span className="sfc-footer__latest-img">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</span>
                <span className="sfc-footer__latest-body">
                  <span className="sfc-footer__latest-name">{p.name}</span>
                  <ClassicAmount value={p.price} className="sfc-footer__latest-price" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="sfc-footer__trust">
          {trust ? (
            <div className="sfc-footer__installment">
              <strong>چگونه به ما اعتماد کنید</strong>
              <span>{trust}</span>
            </div>
          ) : (
            <div className="sfc-footer__installment">
              <strong>خرید اقساطی</strong>
              <span>امکان خرید اقساطی بدون چک و ضامن از طریق درگاه‌های معتبر</span>
            </div>
          )}
          <div className="sfc-footer__namad" aria-label="نمادهای اعتماد">
            {cfg.enamad_html ? (
              <div className="sfc-footer__namad-item" dangerouslySetInnerHTML={{ __html: cfg.enamad_html }} />
            ) : (
              <span className="sfc-footer__namad-item">نماد اعتماد</span>
            )}
            {cfg.samandehi_html ? (
              <div className="sfc-footer__namad-item" dangerouslySetInnerHTML={{ __html: cfg.samandehi_html }} />
            ) : (
              <span className="sfc-footer__namad-item">ساماندهی</span>
            )}
            {cfg.ecommerce_badge_html ? (
              <div className="sfc-footer__namad-item" dangerouslySetInnerHTML={{ __html: cfg.ecommerce_badge_html }} />
            ) : null}
          </div>
        </div>

        {Array.isArray(cfg.payment_methods) && cfg.payment_methods.length ? (
          <div className="sfc-footer__payments">
            {cfg.payment_methods.map((pm, i) => (
              <span key={i} className="sfc-footer__payment">
                {pm.image ? <img src={String(pm.image)} alt={String(pm.title ?? "")} /> : <span>{pm.title}</span>}
              </span>
            ))}
          </div>
        ) : null}

        {aboutText ? (
          <div className={`sfc-footer__seo ${expanded ? "is-open" : ""}`}>
            <h3 className="sfc-footer__title">فروشگاه اینترنتی {siteName}</h3>
            <p>{aboutText}</p>
            <button type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "بستن" : "مشاهده بیشتر"}
            </button>
          </div>
        ) : null}

        <div className="sfc-footer__copy">
          <span>
            {cfg.copyright
              ? cfg.copyright
              : (
                <>
                  کلیه حقوق مادی و معنوی این سایت متعلق به <strong>{siteName}</strong> است.
                </>
              )}
          </span>
          {cfg.copyright_sub ? <span className="sfc-footer__copy-sub">{cfg.copyright_sub}</span> : null}
          {cfg.show_developer_credit !== false ? (
            <span className="sfc-footer__made">
              {cfg.developer_link ? (
                <a href={cfg.developer_link} target="_blank" rel="noreferrer">
                  {cfg.developer_title || "طراحی و توسعه"} {cfg.developer_name || "وبینو"}
                </a>
              ) : (
                <>
                  {cfg.developer_title || "ساخته‌شده با"} {cfg.developer_name || "وبینو"}
                </>
              )}
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  )
}

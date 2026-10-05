"use client"

import Link from "next/link"
import { useState } from "react"

import { useCatalog } from "@/builder/storefront/use-catalog"

import { IconCard, IconChevronLeft, IconClock, IconMail, IconPhone, IconPin, IconShield, IconTruck, IconBadge } from "./icons"
import { ClassicAmount } from "./parts"

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
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
  const [expanded, setExpanded] = useState(false)
  const latest = catalog.products.slice(0, 3)

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
            {phone ? (
              <a href={`tel:${phone}`} className="sfc-footer__row">
                <IconPhone size={16} />
                <span>
                  تلفن پشتیبانی: <bdi>{phone}</bdi>
                </span>
              </a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} className="sfc-footer__row">
                <IconMail size={16} />
                <span dir="ltr">{email}</span>
              </a>
            ) : null}
            <div className="sfc-footer__row">
              <IconClock size={16} />
              <span>شنبه تا پنجشنبه، ۹ تا ۱۸</span>
            </div>
            {address ? (
              <div className="sfc-footer__row">
                <IconPin size={16} />
                <span>{address}</span>
              </div>
            ) : null}
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} className="sfc-footer__col" aria-label={col.title}>
              <h3 className="sfc-footer__title">{col.title}</h3>
              {col.links.map((link) => (
                <Link key={link.href} href={link.href}>
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
          <div className="sfc-footer__installment">
            <strong>خرید اقساطی</strong>
            <span>امکان خرید اقساطی بدون چک و ضامن از طریق درگاه‌های معتبر</span>
          </div>
          <div className="sfc-footer__namad" aria-label="نمادهای اعتماد">
            <span className="sfc-footer__namad-item">نماد اعتماد</span>
            <span className="sfc-footer__namad-item">ساماندهی</span>
          </div>
        </div>

        {about ? (
          <div className={`sfc-footer__seo ${expanded ? "is-open" : ""}`}>
            <h3 className="sfc-footer__title">فروشگاه اینترنتی {siteName}</h3>
            <p>{about}</p>
            <button type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "بستن" : "مشاهده بیشتر"}
            </button>
          </div>
        ) : null}

        <div className="sfc-footer__copy">
          <span>
            کلیه حقوق مادی و معنوی این سایت متعلق به <strong>{siteName}</strong> است.
          </span>
          <span className="sfc-footer__made">ساخته‌شده با وبینو</span>
        </div>
      </div>
    </footer>
  )
}

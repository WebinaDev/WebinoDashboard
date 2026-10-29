"use client"

import { useEffect, useId, useRef } from "react"
import Link from "next/link"

export type CartAddedPayload = {
  name: string
  image?: string | null
  priceLabel: string
  quantity: number
}

type Props = {
  open: boolean
  item: CartAddedPayload | null
  error?: string | null
  onClose: () => void
  cartHref?: string
}

/**
 * Success popup after add-to-cart confirms (server or guest local).
 * Generic storefront UI: RTL, theme tokens (Parisma pink/navy via --sfc-* / --color-primary).
 */
export function CartAddedModal({ open, item, error = null, onClose, cartHref = "/cart" }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const isError = Boolean(error)

  return (
    <div
      className="sfc-atc-modal"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`sfc-atc-modal__dialog${isError ? " is-error" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
      >
        <button
          ref={closeRef}
          type="button"
          className="sfc-atc-modal__close"
          aria-label="بستن"
          onClick={onClose}
        >
          ×
        </button>

        {isError ? (
          <>
            <h2 id={titleId} className="sfc-atc-modal__title">
              افزودن به سبد ناموفق بود
            </h2>
            <p className="sfc-atc-modal__error" role="alert">
              {error}
            </p>
            <div className="sfc-atc-modal__actions">
              <button type="button" className="sfc-atc-modal__btn sfc-atc-modal__btn--primary" onClick={onClose}>
                بستن
              </button>
            </div>
          </>
        ) : item ? (
          <>
            <div className="sfc-atc-modal__badge" aria-hidden="true">
              ✓
            </div>
            <h2 id={titleId} className="sfc-atc-modal__title">
              به سبد خرید افزوده شد
            </h2>
            <div className="sfc-atc-modal__product">
              <div className="sfc-atc-modal__thumb">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" />
                ) : (
                  <span className="sfc-atc-modal__thumb-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="sfc-atc-modal__meta">
                <p className="sfc-atc-modal__name">{item.name}</p>
                <p className="sfc-atc-modal__price">{item.priceLabel}</p>
                <p className="sfc-atc-modal__qty">تعداد: {item.quantity.toLocaleString("fa-IR")}</p>
              </div>
            </div>
            <div className="sfc-atc-modal__actions">
              <Link href={cartHref} className="sfc-atc-modal__btn sfc-atc-modal__btn--primary" onClick={onClose}>
                مشاهده سبد خرید
              </Link>
              <button type="button" className="sfc-atc-modal__btn sfc-atc-modal__btn--ghost" onClick={onClose}>
                ادامه خرید
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

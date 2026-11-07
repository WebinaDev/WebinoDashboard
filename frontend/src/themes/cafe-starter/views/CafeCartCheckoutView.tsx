"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, type CSSProperties } from "react"

import type { ShopCurrencyDisplay } from "@/lib/format"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { resolveCafeSkin } from "../skin"
import type { CafeOrderingStatus, CafeVenuePayload } from "../types"
import { useSkinScheme } from "../lib/useSkinScheme"

import "../menu.css"

type Props = {
  venue: CafeVenuePayload | null
  mode: "cart" | "checkout"
  tableNumber?: string | null
  branchSlug?: string | null
  activeThemeSlug?: string | null
  currencyDisplay?: ShopCurrencyDisplay | null
}

/**
 * Full-page cafe cart + checkout. Drawer on the menu stays for quick orders;
 * /cart and /checkout must not fall through to the empty ecommerce shells.
 */
export function CafeCartCheckoutView({
  venue,
  mode,
  tableNumber,
  branchSlug,
  activeThemeSlug,
  currencyDisplay,
}: Props) {
  const t = useTranslations("cafe_starter.cart")
  const tMenu = useTranslations("cafe_starter")
  const locale = useLocale()
  const skin = resolveCafeSkin(activeThemeSlug || venue?.tenant?.active_theme_slug)
  const scheme = useSkinScheme(skin)
  const ordering = (venue?.ordering ?? null) as CafeOrderingStatus | null
  const currency = "IRT"
  const title = mode === "checkout" ? t("checkout_page_title") : t("cart_page_title")
  const accent = useMemo(() => venue?.menu?.accent_color || undefined, [venue?.menu?.accent_color])

  return (
    <div
      className="cafe-shell cafe-cart-page"
      data-skin={skin}
      data-scheme={scheme}
      data-layout="signature"
      style={accent ? ({ ["--cafe-accent"]: accent } as CSSProperties) : undefined}
    >
      <div className="cafe-frame cafe-cart-page-frame">
        <header className="cafe-cart-page-head">
          <div>
            <p className="cafe-cart-page-kicker">{venue?.tenant?.name || tMenu("catalogue_title")}</p>
            <h1>{title}</h1>
            <p className="cafe-hint">{t("page_hint")}</p>
          </div>
          <Link href="/menu" className="cafe-chip cafe-cart-page-back">
            {t("back_to_menu")}
          </Link>
        </header>

        <CafeCartDrawer
          mode="page"
          tableNumber={tableNumber}
          branchSlug={branchSlug}
          ordering={ordering}
          currency={currency}
          currencyDisplay={currencyDisplay}
          skin={skin}
          scheme={scheme}
        />

        <p className="cafe-cart-page-foot" dir={locale === "fa" ? "rtl" : "ltr"}>
          <Link href="/menu">{t("continue_shopping")}</Link>
          {mode === "cart" ? (
            <>
              <span aria-hidden="true"> · </span>
              <Link href="/checkout">{t("go_checkout")}</Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}

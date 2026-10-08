"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { digits, keepQuery, localizedField, menuKind } from "../../lib/helpers"
import {
  CafeShell,
  CartButton,
  EmptyMenu,
  ItemMedia,
  MenuGlyphs,
  SchemeCartTools,
  ViewModeSwitch,
  pickProps,
  soldLabel,
} from "../shared"
import "./menew.css"

type Props = Parameters<typeof useCatalogueController>[0]

export function MenewCatalogue(props: Props) {
  const ctrl = useCatalogueController({ ...props, defaultDark: false })
  const [searchOpen, setSearchOpen] = useState(false)
  const [heroGone, setHeroGone] = useState(false)

  useEffect(() => {
    const onScroll = () => setHeroGone(window.scrollY > window.innerHeight * 0.55)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const tagline = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.tagline_fa, ctrl.venue.venue.tagline_en) : null
  const menus = ctrl.catalog.menus ?? []
  const tagged = ctrl.filteredItems.some((item) => item.menu_id != null)

  function scrollToMenu() {
    document.getElementById("me-stage")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <CafeShell ctrl={ctrl}>
      <div className="me-frame">
        <header className={cn("me-chrome", heroGone && "is-solid")}>
          <Link href="/about" className="me-about">
            {ctrl.t("nav_about")}
          </Link>
          <strong>{ctrl.venueName || ctrl.t("catalogue_title")}</strong>
          <div className="me-chrome-tools">
            {tagline ? <span className="me-pill">{tagline}</span> : null}
            <SchemeCartTools ctrl={ctrl} cart="pill" />
          </div>
        </header>

        <section className="me-cine" style={ctrl.heroImage ? { backgroundImage: `url(${ctrl.heroImage})` } : undefined}>
          <div className="me-cine-shade">
            <div className="me-blob" aria-hidden="true" />
            <p className="me-kicker">{ctrl.t("menu_kicker")}</p>
            <h1>{ctrl.venueName || ctrl.t("catalogue_title")}</h1>
            {tagline ? <p className="me-cine-tag">{tagline}</p> : null}
            <button type="button" className="me-scroll-cue" onClick={scrollToMenu}>
              <ChevronUp className="size-5" />
              <span>{ctrl.t("scroll_to_menu")}</span>
              <small>{ctrl.t("scroll_to_menu_hint")}</small>
            </button>
          </div>
        </section>

        <section id="me-stage" className="me-stage">
          <div className="me-stage-tools">
            <h2>{ctrl.t("categories_heading")}</h2>
            <div className="me-tools">
              <button type="button" className="me-icon" onClick={() => setSearchOpen((v) => !v)} aria-label={ctrl.t("search_placeholder")}>
                <Search className="size-4" />
              </button>
              <CartButton ctrl={ctrl} variant="pill" />
            </div>
          </div>

          {searchOpen ? (
            <input
              className="me-search"
              autoFocus
              value={ctrl.query}
              onChange={(e) => ctrl.setQuery(e.target.value)}
              placeholder={ctrl.t("search_placeholder")}
              aria-label={ctrl.t("search_placeholder")}
            />
          ) : null}

          {(ctrl.catalog.branches?.length ?? 0) > 1 ? (
            <div className="me-branches">
              <Link className="me-chip" data-on={ctrl.branchSlug ? "false" : "true"} href={`/catalogue${keepQuery({ ...ctrl.qs, branch: null })}`}>
                {ctrl.t("all_branches")}
              </Link>
              {ctrl.catalog.branches!.map((b) => (
                <Link
                  key={b.id}
                  className="me-chip"
                  data-on={ctrl.branchSlug === b.slug ? "true" : "false"}
                  href={`/catalogue${keepQuery({ ...ctrl.qs, branch: b.slug })}`}
                >
                  {localizedField(ctrl.locale, b.name_fa, b.name_en)}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="me-view-wrap">
            <span>{ctrl.t("view_modes")}</span>
            <ViewModeSwitch ctrl={ctrl} />
          </div>

          {menus.length > 0 ? (
            <div className="me-acc">
              {menus.map((entry) => {
                const kind = menuKind(entry)
                const scoped = ctrl.filteredItems.filter((item) => item.menu_id === entry.id)
                const rows = scoped.length > 0 ? scoped : !tagged && menus[0]?.id === entry.id ? ctrl.filteredItems : []
                const open = ctrl.openMenuId === entry.id
                const blurb =
                  entry.description ||
                  ctrl.t(kind === "bar" ? "menu_blurb_bar" : kind === "cafe" ? "menu_blurb_cafe" : "menu_blurb_restaurant")
                return (
                  <section key={entry.id} className={cn("me-acc-panel", open && "is-open")}>
                    <button type="button" className="me-acc-head" aria-expanded={open} onClick={() => ctrl.setOpenMenuId(open ? null : entry.id)}>
                      <span className="me-acc-copy">
                        <strong>{entry.name}</strong>
                        <small>{blurb}</small>
                      </span>
                      <MenuGlyphs kind={kind} />
                      <ChevronDown className={cn("size-5 shrink-0 transition", open && "rotate-180")} />
                    </button>
                    {open ? (
                      <div className="me-acc-body">
                        {rows.length === 0 ? (
                          <EmptyMenu t={ctrl.t} />
                        ) : (
                          <MenewSections ctrl={ctrl} items={rows} />
                        )}
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          ) : (
            <MenewSections ctrl={ctrl} items={ctrl.filteredItems} />
          )}

        </section>
      </div>
    </CafeShell>
  )
}

function MenewSections({ ctrl, items }: { ctrl: CatalogueController; items: CatalogItem[] }) {
  const groups = ctrl.catalog.categories
    .map((cat) => ({ cat, rows: items.filter((i) => i.category?.id === cat.id) }))
    .filter((g) => g.rows.length > 0)
  const loose = items.filter((i) => !i.category)
  if (!groups.length && !loose.length) return <EmptyMenu t={ctrl.t} />
  return (
    <div className="me-sections">
      {groups.map(({ cat, rows }) => (
        <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug}>
          <header>
            <h3>{cat.name}</h3>
            {cat.description ? <p>{cat.description}</p> : null}
          </header>
          <div className={cn("me-grid", `is-${ctrl.view}`)}>
            {rows.map((item) => (
              <MenewCard key={item.id} item={item} ctrl={ctrl} />
            ))}
          </div>
        </section>
      ))}
      {loose.length ? (
        <div className={cn("me-grid", `is-${ctrl.view}`)}>
          {loose.map((item) => (
            <MenewCard key={item.id} item={item} ctrl={ctrl} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MenewCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const sold = soldLabel(ctrl, item)
  const was = ctrl.wasOf(item)
  return (
    <Link {...pickProps(ctrl, item)} className={cn("me-card", item.is_sold_out && "is-sold", `is-${ctrl.view}`)} data-reveal>
      <ItemMedia item={item} className="me-card-media" stamp={sold} sizes="(max-width: 900px) 50vw, 360px" />
      <div className="me-card-body">
        <h4>{item.name}</h4>
        {item.description ? <p>{item.description}</p> : null}
        <div className="me-card-foot">
          <span className="me-price">
            {was ? <s>{was}</s> : null}
            {ctrl.priceOf(item)}
          </span>
          <span className="me-cta">{sold || ctrl.t("select_cta")}</span>
        </div>
      </div>
    </Link>
  )
}

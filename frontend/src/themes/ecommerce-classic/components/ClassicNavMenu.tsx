"use client"

import Link from "next/link"
import { useState } from "react"

import { navItemHref, navVisibilityClass, type NavMenuItem } from "@/lib/nav-menus"

/** Storefront renderers for «منوها» items (header links, dropdowns, mega panel, drawer, footer). */
export function NavItemIcon({ icon }: { icon?: string }) {
  if (!icon) return null
  if (/^(https?:)?\/|^data:image\//.test(icon)) return <img src={icon} alt="" width={18} height={18} loading="lazy" decoding="async" className="sfc-navmenu__icon" />
  return <span className="sfc-navmenu__icon" aria-hidden="true">{icon.length <= 3 ? icon : null}</span>
}

export function NavItemBadge({ item }: { item: NavMenuItem }) {
  if (!item.badge) return null
  return (
    <span className="sfc-navmenu__badge" style={{ background: item.badge_color || "#ef4444" }}>
      {item.badge}
    </span>
  )
}

export function NavItemLink({ item, className, onNavigate, children }: { item: NavMenuItem; className?: string; onNavigate?: () => void; children?: React.ReactNode }) {
  const href = navItemHref(item)
  const ext = item.new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {}
  return (
    <Link href={href} className={[className, navVisibilityClass(item.visibility)].filter(Boolean).join(" ")} onClick={onNavigate} {...ext}>
      {children ?? (
        <>
          <NavItemIcon icon={item.icon} />
          <span>{item.label}</span>
          <NavItemBadge item={item} />
        </>
      )}
    </Link>
  )
}

/** Desktop header link with a hover dropdown for sub-items. */
export function NavHeaderItem({ item, icon }: { item: NavMenuItem; icon?: React.ReactNode }) {
  const kids = item.children ?? []
  if (!kids.length) {
    return (
      <NavItemLink item={item}>
        {item.icon ? <NavItemIcon icon={item.icon} /> : icon ? <span className="sfc-header__link-icon">{icon}</span> : null}
        <span>{item.label}</span>
        <NavItemBadge item={item} />
      </NavItemLink>
    )
  }
  return (
    <div className={`sfc-navmenu__drop group relative ${navVisibilityClass(item.visibility)}`}>
      <NavItemLink item={item}>
        {item.icon ? <NavItemIcon icon={item.icon} /> : icon ? <span className="sfc-header__link-icon">{icon}</span> : null}
        <span>{item.label}</span>
        <NavItemBadge item={item} />
        <span aria-hidden="true" className="text-[10px] opacity-60">▾</span>
      </NavItemLink>
      <div className="invisible absolute start-0 top-full z-50 min-w-48 rounded-xl border bg-white p-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {kids.map((c) => (
          <div key={c.id}>
            <NavItemLink item={c} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-black/5" />
            {(c.children ?? []).map((g) => (
              <NavItemLink key={g.id} item={g} className="flex items-center gap-1.5 rounded-lg px-6 py-1.5 text-xs text-black/60 hover:bg-black/5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mega panel driven by a menu (same look as the category mega menu). */
export function NavMegaPanel({ items, onClose }: { items: NavMenuItem[]; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const cur = items[active] ?? items[0]
  const rows: { key: string; item: NavMenuItem; level: 2 | 3 }[] = []
  for (const c of cur?.children ?? []) {
    rows.push({ key: `l2-${c.id}`, item: c, level: 2 })
    for (const g of c.children ?? []) rows.push({ key: `l3-${g.id}`, item: g, level: 3 })
  }
  return (
    <div className="sfc-mega__panel" role="menu" aria-label="منو">
      <ul className="sfc-mega__parents" role="tablist">
        {items.map((it, i) => (
          <li key={it.id} role="none" onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
            <NavItemLink item={it} className={i === active ? "is-active" : ""} onNavigate={onClose}>
              <span className="sfc-mega__parent-label">
                <NavItemIcon icon={it.icon} />
                <span>{it.label}</span>
                <NavItemBadge item={it} />
              </span>
            </NavItemLink>
          </li>
        ))}
      </ul>
      <div className="sfc-mega__childs">
        {cur ? (
          <NavItemLink item={cur} className="sfc-mega__all" onNavigate={onClose}>
            همه {cur.label}
          </NavItemLink>
        ) : null}
        {rows.length ? (
          <ul className="sfc-mega__level2">
            {rows.map((r) => (
              <li key={r.key} className={r.level === 2 ? "sfc-mega__l2" : "sfc-mega__l3"}>
                <NavItemLink item={r.item} className={r.level === 2 ? "sfc-mega__l2-link" : "sfc-mega__l3-link"} onNavigate={onClose} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

/** Mobile drawer list with expandable sub-menus. */
export function NavDrawerList({ items, onNavigate }: { items: NavMenuItem[]; onNavigate: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      {items.map((it) => {
        const kids = it.children ?? []
        const isOpen = open === it.id
        return (
          <div key={it.id} className={`sfc-drawer__cat ${navVisibilityClass(it.visibility)}`}>
            <div className="sfc-drawer__cat-row">
              <NavItemLink item={it} onNavigate={onNavigate} />
              {kids.length ? (
                <button type="button" aria-expanded={isOpen} aria-label="زیرمنو" onClick={() => setOpen(isOpen ? null : it.id)}>
                  {isOpen ? "−" : "+"}
                </button>
              ) : null}
            </div>
            {isOpen ? (
              <div className="sfc-drawer__sub">
                {kids.map((c) => (
                  <NavItemLink key={c.id} item={c} onNavigate={onNavigate} />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

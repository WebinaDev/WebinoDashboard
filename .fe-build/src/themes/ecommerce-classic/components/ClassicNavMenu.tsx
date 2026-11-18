"use client"

import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import * as Base from "@webina/ui/nav-menus"

import { NAV_HREF_OPTIONS } from "@/lib/nav-menus"

/** Storefront «منوها» renderers (shared in @webina/ui/nav-menus) bound to next/link and the store's permalinks. */
function Bind({ children }: { children: ReactNode }) {
  return (
    <Base.NavRenderProvider Link={Link as Base.NavLinkComponent} hrefOptions={NAV_HREF_OPTIONS}>
      {children}
    </Base.NavRenderProvider>
  )
}

export const NavItemIcon = Base.NavItemIcon
export const NavItemBadge = Base.NavItemBadge
export const NavItemLink = (p: ComponentProps<typeof Base.NavItemLink>) => <Bind><Base.NavItemLink {...p} /></Bind>
export const NavHeaderItem = (p: ComponentProps<typeof Base.NavHeaderItem>) => <Bind><Base.NavHeaderItem {...p} /></Bind>
export const NavMegaPanel = (p: ComponentProps<typeof Base.NavMegaPanel>) => <Bind><Base.NavMegaPanel {...p} /></Bind>
export const NavDrawerList = (p: ComponentProps<typeof Base.NavDrawerList>) => <Bind><Base.NavDrawerList {...p} /></Bind>

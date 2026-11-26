"use client"

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale } from "next-intl"
import { memo, useEffect, useMemo, useState } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { pathIsActive } from "@/lib/path-active"

export type NavMainSubItem = {
  id?: string
  title: string
  url: string
  icon?: LucideIcon
  items?: NavMainSubItem[]
}

export type NavMainItem = {
  id?: string
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  items?: NavMainSubItem[]
}

function itemId(item: { id?: string; title: string; url: string }): string {
  return item.id ?? `${item.title}:${item.url}`
}

function subItemIsActive(item: NavMainSubItem, pathname: string): boolean {
  if (item.items?.length) {
    return item.items.some((child) => subItemIsActive(child, pathname))
  }
  return pathIsActive(pathname, item.url)
}

function activeGroupId(items: NavMainItem[], pathname: string): string | null {
  for (const item of items) {
    if (!item.items?.length) continue
    if (item.items.some((sub) => subItemIsActive(sub, pathname))) {
      return itemId(item)
    }
  }
  return null
}

function activeNestedGroupId(items: NavMainSubItem[], pathname: string): string | null {
  for (const item of items) {
    if (!item.items?.length) continue
    if (item.items.some((sub) => subItemIsActive(sub, pathname))) {
      return itemId(item)
    }
  }
  return null
}

function NavSubMenu({
  items,
  pathname,
}: {
  items: NavMainSubItem[]
  pathname: string
}) {
  const locale = useLocale()
  const Chevron = locale === "fa" ? ChevronLeft : ChevronRight
  const routeOpenId = useMemo(() => activeNestedGroupId(items, pathname), [items, pathname])
  const [openId, setOpenId] = useState<string | null>(() => routeOpenId)

  useEffect(() => {
    setOpenId(routeOpenId)
  }, [routeOpenId])

  return (
    <>
      {items.map((subItem) => {
        const nested = subItem.items
        const id = itemId(subItem)
        if (nested?.length) {
          return (
            <SidebarMenuSubItem key={id}>
              <Collapsible
                open={openId === id}
                onOpenChange={(open) => {
                  setOpenId(open ? id : null)
                }}
                className="group/collapsible"
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuSubButton size="md" isActive={subItemIsActive(subItem, pathname)}>
                    <span>{subItem.title}</span>
                    <Chevron className="ms-auto size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuSubButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <NavSubMenu items={nested} pathname={pathname} />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          )
        }

        const subActive = pathIsActive(pathname, subItem.url)
        return (
          <SidebarMenuSubItem key={id}>
            <SidebarMenuSubButton asChild isActive={subActive} size="md">
              <Link href={subItem.url} data-testid={subActive ? "nav-active" : undefined}>
                {subItem.icon ? <subItem.icon className="size-3.5" aria-hidden /> : null}
                <span>{subItem.title}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )
      })}
    </>
  )
}

function NavMainComponent({
  items,
  groupLabel,
  groupKey,
  defaultOpenFirst = false,
}: {
  items: NavMainItem[]
  groupLabel: string
  /** Blueprint group key — stable React key and the a11y/test hook. */
  groupKey?: string
  /**
   * Start the first collapsible in this section expanded. The blueprint sets it for the
   * groups a shift begins in, so a cashier lands on the till rather than on a closed row.
   */
  defaultOpenFirst?: boolean
}) {
  const pathname = usePathname() ?? ""
  const locale = useLocale()
  const Chevron = locale === "fa" ? ChevronLeft : ChevronRight

  const routeOpenId = useMemo(() => activeGroupId(items, pathname), [items, pathname])
  const [openId, setOpenId] = useState<string | null>(
    () => routeOpenId ?? (defaultOpenFirst && items[0]?.items?.length ? itemId(items[0]) : null),
  )

  useEffect(() => {
    setOpenId(routeOpenId)
  }, [routeOpenId])

  return (
    <SidebarGroup data-nav-group={groupKey}>
      {/*
        The heading is a label, not a control. It exists to say which drawer the links below
        belong to; making it clickable added a control that either duplicated the first link
        or hid the whole group behind a click nobody asked for.
      */}
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarMenu data-testid="admin-nav-main">
        {items.map((item) => {
          const id = itemId(item)
          const subItems = item.items
          const Icon = item.icon

          if (!subItems?.length) {
            const active = pathIsActive(pathname, item.url)
            return (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  data-testid={active ? "nav-active" : `nav-item-${item.url}`}
                >
                  <Link href={item.url}>
                    {Icon ? <Icon /> : null}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          const groupActive = subItems.some((sub) => subItemIsActive(sub, pathname))
          return (
            <SidebarMenuItem key={id}>
              <Collapsible
                open={openId === id}
                onOpenChange={(open) => {
                  setOpenId(open ? id : null)
                }}
                className="group/collapsible"
                data-testid={`nav-group-${groupKey ?? groupLabel}`}
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={groupActive}>
                    {Icon ? <Icon /> : null}
                    <span>{item.title}</span>
                    <Chevron className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <NavSubMenu items={subItems} pathname={pathname} />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export const NavMain = memo(NavMainComponent)

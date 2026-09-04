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
}: {
  items: NavMainItem[]
  groupLabel: string
}) {
  const pathname = usePathname() ?? ""
  const locale = useLocale()
  const Chevron = locale === "fa" ? ChevronLeft : ChevronRight
  const routeOpenId = useMemo(() => activeGroupId(items, pathname), [items, pathname])
  const [openId, setOpenId] = useState<string | null>(() => routeOpenId)

  useEffect(() => {
    setOpenId(routeOpenId)
  }, [routeOpenId])

  return (
    <SidebarGroup>
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

          return (
            <SidebarMenuItem key={id}>
              <Collapsible
                open={openId === id}
                onOpenChange={(open) => {
                  setOpenId(open ? id : null)
                }}
                className="group/collapsible"
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
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

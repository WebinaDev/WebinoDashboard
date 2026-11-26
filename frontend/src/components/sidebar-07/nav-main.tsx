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
  icon: GroupIcon,
  collapsible = true,
  defaultOpen = false,
}: {
  items: NavMainItem[]
  groupLabel: string
  /** Blueprint group key — stable React key and the anchor for the collapsed state. */
  groupKey?: string
  icon?: LucideIcon
  collapsible?: boolean
  /** Start expanded. The blueprint sets this for the groups a shift begins in. */
  defaultOpen?: boolean
}) {
  const pathname = usePathname() ?? ""
  const locale = useLocale()
  const Chevron = locale === "fa" ? ChevronLeft : ChevronRight
  const routeOpenId = useMemo(() => activeGroupId(items, pathname), [items, pathname])
  const [openId, setOpenId] = useState<string | null>(() => routeOpenId)

  useEffect(() => {
    setOpenId(routeOpenId)
  }, [routeOpenId])

  // Walking into any page of a group must reveal it, even if the user collapsed it.
  const containsActive = useMemo(
    () =>
      items.some(
        (item) =>
          pathIsActive(pathname, item.url) ||
          Boolean(item.items?.some((sub) => subItemIsActive(sub, pathname))),
      ),
    [items, pathname],
  )
  const [sectionOpen, setSectionOpen] = useState<boolean>(() => defaultOpen || containsActive)

  // Reveal the group during the same render the route lands in it, rather than in an
  // effect — an effect would paint the collapsed group for one frame and then spring it
  // open, and it is the pattern the react-hooks lint rule exists to prevent.
  const [wasActive, setWasActive] = useState(containsActive)
  if (containsActive !== wasActive) {
    setWasActive(containsActive)
    if (containsActive) setSectionOpen(true)
  }

  const menu = (
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
  )

  // "پیشخوان" is a single permanent link, not a drawer — collapsing it would only add a
  // click to the one destination everybody needs.
  if (!collapsible) {
    return (
      <SidebarGroup data-nav-group={groupKey}>
        <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
        {menu}
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup data-nav-group={groupKey}>
      <Collapsible
        open={sectionOpen}
        onOpenChange={setSectionOpen}
        className="group/section"
        data-testid={`nav-section-${groupKey ?? groupLabel}`}
      >
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="w-full cursor-pointer select-none rounded-md px-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <button type="button" className="flex w-full items-center gap-2 text-start">
              {GroupIcon ? <GroupIcon className="size-4 shrink-0" aria-hidden /> : null}
              <span className="truncate">{groupLabel}</span>
              <Chevron className="ms-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/section:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>{menu}</CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}

export const NavMain = memo(NavMainComponent)

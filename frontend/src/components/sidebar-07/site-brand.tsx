"use client"

import Image from "next/image"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/** Tenant site brand in the sidebar header (name + logo). */
export function SiteBrand({
  name,
  logoSrc,
  subtitle,
}: {
  name: string
  logoSrc?: string | null
  subtitle?: string
}) {
  const src = logoSrc && logoSrc.trim() !== "" ? logoSrc : "/brand/logo.png"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none">
          <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Image
              src={src}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-sm object-contain"
            />
          </div>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-semibold">{name}</span>
            {subtitle ? <span className="truncate text-xs">{subtitle}</span> : null}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

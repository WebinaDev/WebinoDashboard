"use client"

import * as React from "react"
import Image from "next/image"
import { ChevronsUpDown, Plus } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

function TeamLogo({
  logoSrc,
  logo: Logo,
  className,
}: {
  logoSrc?: string
  logo?: React.ElementType
  className?: string
}) {
  if (logoSrc) {
    return (
      <Image
        src={logoSrc}
        alt=""
        width={16}
        height={16}
        className={className ?? "size-4 shrink-0 rounded-sm object-contain"}
      />
    )
  }

  if (Logo) {
    return <Logo className={className ?? "size-4 shrink-0"} />
  }

  return null
}

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string
    logo?: React.ElementType
    logoSrc?: string
    plan: string
  }[]
}) {
  const { isMobile } = useSidebar()
  const locale = useLocale()
  const t = useTranslations("sidebar")
  const showKbShortcuts = locale.startsWith("en")
  const [activeTeam, setActiveTeam] = React.useState(teams[0])

  if (!activeTeam) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <TeamLogo
                  logoSrc={activeTeam.logoSrc}
                  logo={activeTeam.logo}
                  className="size-6 rounded-sm object-contain"
                />
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeTeam.name}
                </span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <ChevronsUpDown className="ms-auto shrink-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("teams_heading")}
            </DropdownMenuLabel>
            {teams.map((team, index) => (
              <DropdownMenuItem
                key={team.name}
                onClick={() => setActiveTeam(team)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center overflow-hidden rounded-sm border">
                  <TeamLogo logoSrc={team.logoSrc} logo={team.logo} />
                </div>
                {team.name}
                {showKbShortcuts ? (
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                {t("add_team")}
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

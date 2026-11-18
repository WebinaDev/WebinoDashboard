"use client"

import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type OrderSidebarPanelProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function OrderSidebarPanel({
  title,
  defaultOpen = true,
  children,
  className,
  actions,
}: OrderSidebarPanelProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className={cn("min-w-0 overflow-hidden shadow-sm", className)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex cursor-pointer flex-row items-center justify-between space-y-0 p-4 pb-3 text-start">
            <CardTitle className="min-w-0 break-words text-sm font-semibold">{title}</CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              {actions ? (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="contents"
                >
                  {actions}
                </span>
              ) : null}
              <ChevronDown
                className="text-muted-foreground size-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180"
                aria-hidden
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="min-w-0 break-words px-4 pb-4 pt-0 text-start">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

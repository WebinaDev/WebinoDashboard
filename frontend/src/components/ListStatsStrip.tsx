"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ListStatItem = {
  id: string
  label: string
  value: number | string
}

export function ListStatsStrip({
  items,
  className,
}: {
  items: ListStatItem[]
  className?: string
}) {
  if (!items.length) return null
  const cols =
    items.length <= 3 ? "md:grid-cols-3" : items.length <= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-6"

  return (
    <div className={cn("flex gap-2.5 overflow-x-auto pb-1 md:grid md:overflow-visible md:pb-0", cols, className)}>
      {items.map((item) => (
        <Card key={item.id} className="wd-card-stat min-w-[9.5rem] shrink-0 overflow-hidden md:min-w-0">
          <CardContent className="space-y-1 pt-3.5 pb-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{item.label}</p>
            <p className="text-base font-semibold tracking-tight sm:text-lg">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

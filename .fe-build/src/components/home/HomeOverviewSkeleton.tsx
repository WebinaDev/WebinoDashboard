"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function HomeOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[5.25rem] w-36 shrink-0 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
      </div>
    </div>
  )
}

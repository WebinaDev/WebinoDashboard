"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function TableListSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function FormSettingsSkeleton({ cards = 2, fieldsPerCard = 3 }: { cards?: number; fieldsPerCard?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border p-4">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: fieldsPerCard }).map((__, j) => (
            <Skeleton key={j} className="h-9 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Horizontal scroll wrapper for wide admin tables. */
export function ScrollTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="scroll-table" className={cn("min-w-0 overflow-x-auto rounded-xl", className)}>
      {children}
    </div>
  )
}

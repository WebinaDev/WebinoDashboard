import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function PageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("wd-page-shell space-y-5 text-start", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:font-bold">{title}</h1>
          {description ? (
            <p className="text-muted-foreground max-w-2xl text-sm font-normal leading-relaxed">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

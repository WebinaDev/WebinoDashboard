import type { ReactNode } from "react"

export function PageShell({
  title,
  description,
  eyebrow,
  actions,
  children,
}: {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

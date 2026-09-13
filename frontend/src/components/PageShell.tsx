import type { ReactNode } from "react"

export function PageShell({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string
  description?: string
  eyebrow?: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-5">
      <header className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{description}</p> : null}
      </header>
      {children}
    </div>
  )
}

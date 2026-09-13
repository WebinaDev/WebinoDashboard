import Link from "next/link"

import { Button } from "@/components/ui/button"

type Props = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}

export function SiteEmptyState({ title, description, actionHref, actionLabel }: Props) {
  return (
    <div className="container mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
      {actionHref && actionLabel ? (
        <Button asChild variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  )
}

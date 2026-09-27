"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

export function EmptyListCta({
  message,
  actionLabel,
  actionHref,
}: {
  message: string
  actionLabel: string
  actionHref: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      <Button asChild>
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  )
}

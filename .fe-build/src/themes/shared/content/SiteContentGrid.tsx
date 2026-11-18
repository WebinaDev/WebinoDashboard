import Link from "next/link"
import Image from "next/image"

import { SiteEmptyState } from "./SiteEmptyState"

export type ContentCardItem = {
  slug?: string
  href: string
  title: string
  excerpt?: string | null
  imageUrl?: string | null
  meta?: string | null
}

type Props = {
  title: string
  emptyLabel: string
  emptyActionLabel: string
  items: ContentCardItem[]
  columns?: 1 | 2 | 3
}

export function SiteContentGrid({ title, emptyLabel, emptyActionLabel, items, columns = 3 }: Props) {
  if (items.length === 0) {
    return (
      <SiteEmptyState
        title={title}
        description={emptyLabel}
        actionHref="/"
        actionLabel={emptyActionLabel}
      />
    )
  }

  const gridClass =
    columns === 1
      ? "grid gap-6"
      : columns === 2
        ? "grid gap-6 sm:grid-cols-2"
        : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">{title}</h1>
      <div className={gridClass}>
        {items.map((item) => {
          const body = (
            <>
              {item.imageUrl ? (
                <div className="bg-muted relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="text-lg font-medium leading-snug">{item.title}</h2>
                {item.excerpt ? (
                  <p className="text-muted-foreground line-clamp-3 text-sm">{item.excerpt}</p>
                ) : null}
                {item.meta ? (
                  <p className="text-muted-foreground mt-auto pt-2 text-xs">{item.meta}</p>
                ) : null}
              </div>
            </>
          )

          if (!item.href || item.href === "#") {
            return (
              <div
                key={`${item.title}-${item.meta ?? ""}`}
                className="border-border bg-card flex flex-col overflow-hidden rounded-xl border"
              >
                {body}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="group border-border bg-card hover:border-foreground/20 flex flex-col overflow-hidden rounded-xl border transition"
            >
              {body}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

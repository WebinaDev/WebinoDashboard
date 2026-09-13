import Link from "next/link"
import Image from "next/image"

import { Button } from "@/components/ui/button"

type Props = {
  title: string
  subtitle?: string | null
  body?: string | null
  imageUrl?: string | null
  backHref: string
  backLabel: string
  children?: React.ReactNode
}

export function SiteContentDetail({
  title,
  subtitle,
  body,
  imageUrl,
  backHref,
  backLabel,
  children,
}: Props) {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ms-2">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p> : null}
      {imageUrl ? (
        <div className="bg-muted relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl">
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            unoptimized
          />
        </div>
      ) : null}
      {body ? (
        <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none whitespace-pre-wrap text-sm leading-7">
          {body}
        </div>
      ) : null}
      {children}
    </article>
  )
}

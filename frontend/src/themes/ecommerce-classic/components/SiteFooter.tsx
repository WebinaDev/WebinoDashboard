import { PublishedDocument } from "@/builder/public-document"
import { classicFooterDocument } from "@/builder/templates/classic"

export async function SiteFooter({ siteName }: { siteName: string }) {
  return <PublishedDocument document={classicFooterDocument(siteName)} runtime={{ siteName }} />
}

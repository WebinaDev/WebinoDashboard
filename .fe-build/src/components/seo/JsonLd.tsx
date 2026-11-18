export function JsonLd({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (!data) return null
  return (
    <script
      type="application/ld+json"
      // JSON-LD must be raw JSON; escape < to avoid breaking out of the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}

export function SitePageSkeleton() {
  // Reserve a full viewport while the page body streams in, so the footer never paints above the fold and jumps down (CLS).
  return (
    <div className="container mx-auto flex min-h-svh flex-col gap-4 px-4 py-16" aria-busy="true">
      <div className="bg-muted mx-auto h-10 w-64 animate-pulse rounded" />
      <div className="bg-muted mx-auto h-24 w-full max-w-2xl animate-pulse rounded" />
    </div>
  )
}

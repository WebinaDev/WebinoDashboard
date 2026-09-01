export function SitePageSkeleton() {
  return (
    <div className="container mx-auto flex flex-col gap-4 px-4 py-16">
      <div className="bg-muted mx-auto h-10 w-64 animate-pulse rounded" />
      <div className="bg-muted mx-auto h-24 w-full max-w-2xl animate-pulse rounded" />
    </div>
  )
}

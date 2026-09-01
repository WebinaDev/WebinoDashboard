export function AdminPageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="bg-muted h-8 w-48 animate-pulse rounded" />
      <div className="bg-muted h-32 w-full max-w-3xl animate-pulse rounded" />
    </div>
  )
}

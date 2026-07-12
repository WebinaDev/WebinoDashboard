import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full max-w-3xl" />
      <Skeleton className="h-40 w-full max-w-3xl" />
    </div>
  )
}

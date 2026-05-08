import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

export function ProfesionalCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Shimmer className="h-48 w-full rounded-none" />
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Shimmer className="size-10 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Shimmer className="h-4 w-32" />
            <Shimmer className="h-3 w-24" />
          </div>
        </div>
        <Shimmer className="h-5 w-3/4" />
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-5/6" />
        <div className="flex justify-between pt-2 border-t">
          <Shimmer className="h-3 w-12" />
          <Shimmer className="h-5 w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export function ProfesionalCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProfesionalCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ListItemSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Shimmer className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/3" />
          <Shimmer className="h-3 w-2/3" />
        </div>
        <Shimmer className="h-8 w-20" />
      </CardContent>
    </Card>
  )
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <Shimmer key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <Shimmer className="h-4 w-24" />
        <Shimmer className="h-8 w-20" />
        <Shimmer className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

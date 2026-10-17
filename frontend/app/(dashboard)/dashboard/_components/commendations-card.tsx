import type { Commendation } from "@/lib/api/queries/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr))
}

export function CommendationsCard({ commendations }: { commendations: Commendation[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Recognition</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {commendations.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center">
            <p className="text-muted-foreground text-sm">No commendations yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {commendations.map((item) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-foreground italic">
                  &ldquo;{item.reason}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  from {item.given_by_name} · {item.team_name} · {formatDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
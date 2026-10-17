import type { Strike } from "@/lib/api/queries/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr))
}

const STRIKE_STATUS_LABELS: Record<Strike["status"], string> = {
  confirmed: "Confirmed",
  appealed: "Appealed",
  pending_agent_review: "Pending Review",
  dismissed: "Dismissed",
}

export function PersonalStrikesCard({ strikes }: { strikes: Strike[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold">Strikes</CardTitle>
          <Badge variant="outline" className="text-xs">
            {strikes.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {strikes.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center">
            <p className="text-muted-foreground text-sm">No strikes.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {strikes.map((strike) => (
              <div key={strike.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{strike.reason}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {strike.team_name} · given by {strike.given_by_name} · {formatDate(strike.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {strike.escalated && (
                    <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                      Escalated
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                    {STRIKE_STATUS_LABELS[strike.status] || strike.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
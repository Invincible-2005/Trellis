import Link from "next/link"
import type { TeamOverview, OrgOverview } from "@/lib/api/queries/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function TeamCards({ teams }: { teams: TeamOverview[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Teams</h2>
      {teams.length === 0 ? (
        <Card className="p-6">
          <p className="text-muted-foreground text-sm">You&apos;re not on any team yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const openTasks =
              team.task_summary.todo +
              team.task_summary.in_progress +
              team.task_summary.blocked

            return (
              <Card key={team.team_id} className="transition-colors hover:border-foreground/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      <Link
                        href={`/teams/${team.team_id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {team.team_name}
                      </Link>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {team.member_count} {team.member_count === 1 ? "member" : "members"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Open tasks:</span>
                    <span className="font-medium text-foreground">{openTasks}</span>
                  </div>

                  {team.task_summary.overdue > 0 && (
                    <div className="flex items-center justify-between text-destructive">
                      <span>Overdue tasks:</span>
                      <span className="font-semibold">{team.task_summary.overdue}</span>
                    </div>
                  )}

                  {/* Active strikes shown ONLY when not null (D24) */}
                  {team.active_strikes !== null && team.active_strikes !== undefined && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span>Active strikes:</span>
                      <span className="font-medium text-foreground">{team.active_strikes}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function OrgOverviewCards({ overview }: { overview: OrgOverview | null | undefined }) {
  if (!overview) return null

  const stats = [
    { label: "Total Members", value: overview.total_users },
    { label: "Total Teams", value: overview.total_teams },
    { label: "Total Roles", value: overview.total_roles },
    { label: "Total Documents", value: overview.total_documents },
    { label: "Active Strikes", value: overview.active_strikes },
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Organization Overview</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
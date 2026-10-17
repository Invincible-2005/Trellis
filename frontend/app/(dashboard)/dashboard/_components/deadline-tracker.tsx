import Link from "next/link"
import type { Dashboard } from "@/lib/api/queries/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type UpcomingTask = Dashboard["upcoming_tasks"][number]

const STATUS_LABELS: Record<UpcomingTask["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  todo: { label: "To do", variant: "outline" },
  in_progress: { label: "In progress", variant: "secondary" },
  blocked: { label: "Blocked", variant: "destructive" },
  done: { label: "Done", variant: "default" },
}

function formatDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return "No deadline"
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date)
}

export function DeadlineTracker({ tasks }: { tasks: UpcomingTask[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Upcoming Deadlines</CardTitle>
        <Link
          href="/tasks"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all tasks &rarr;
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {tasks.length === 0 ? (
          <div className="flex h-full min-h-[160px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Nothing due. You&apos;re all caught up.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => {
              const statusInfo = STATUS_LABELS[task.status] || {
                label: task.status,
                variant: "outline" as const,
              }

              return (
                <div
                  key={task.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.team_name} · {formatDeadline(task.deadline)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.overdue && (
                      <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                        Overdue
                      </Badge>
                    )}
                    <Badge variant={statusInfo.variant} className="text-[11px] px-2 py-0">
                      {statusInfo.label}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
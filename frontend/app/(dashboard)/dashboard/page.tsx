import { redirect } from "next/navigation"
import { getDashboard } from "@/lib/api/queries/dashboard"
import { getAuthContext } from "@/lib/api/queries/auth"

import { TaskStatusChart } from "./_components/task-status-chart"
import { DeadlineTracker } from "./_components/deadline-tracker"
import { PersonalStrikesCard } from "./_components/personal-strikes-card"
import { CommendationsCard } from "./_components/commendations-card"
import { TeamCards, OrgOverviewCards } from "./_components/role-metrics-cards"

export default async function DashboardPage() {
  const [dashboard, context] = await Promise.all([
    getDashboard(),
    getAuthContext(),
  ])

  if (!context.active_org) {
    redirect("/onboarding")
  }

  const org = context.organizations.find((o) => o.id === context.active_org?.org_id)

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* 1. Header Line */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Trellis</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Organization: <span className="font-medium text-foreground">{org?.name}</span>
          {context.active_org.org_role_name && (
            <> · Your role: <span className="font-medium text-foreground">{context.active_org.org_role_name}</span></>
          )}
        </p>
      </div>

      {/* 2. My Work Row: Bar Chart + Deadline Tracker */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TaskStatusChart summary={dashboard.my_tasks} />
        <DeadlineTracker tasks={dashboard.upcoming_tasks} />
      </div>

      {/* 3. Strikes and Recognition Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PersonalStrikesCard strikes={dashboard.my_strikes} />
        <CommendationsCard commendations={dashboard.recent_commendations} />
      </div>

      {/* 4. Teams Section */}
      <TeamCards teams={dashboard.teams} />

      {/* 5. Organization Overview (Only rendered if user has permissions, otherwise null) */}
      <OrgOverviewCards overview={dashboard.org_overview} />
    </div>
  )
}
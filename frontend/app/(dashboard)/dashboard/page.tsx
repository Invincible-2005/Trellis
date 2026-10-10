import { redirect } from "next/navigation"
import { getAuthContext } from "@/lib/api/queries/auth"

export default async function DashboardPage() {
  const context = await getAuthContext()

  if (!context.active_org) {
    redirect("/onboarding")
  }

  const org = context.organizations.find((o) => o.id === context.active_org?.org_id)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Trellis</h1>
        <p className="text-muted-foreground text-sm">
          Organization: <span className="font-medium text-foreground">{org?.name}</span>
          {context.active_org.org_role_name && (
            <> · Your role: {context.active_org.org_role_name}</>
          )}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-muted-foreground text-sm">
          Full role-scoped metrics dashboard will be implemented in ticket 08.
        </p>
      </div>
    </div>
  )
}
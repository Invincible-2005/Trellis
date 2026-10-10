import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getAuthContext } from "@/lib/api/queries/auth"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"

import { AppSidebar } from "./_components/app-sidebar"
import { AppHeader } from "./_components/app-header"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context = await getAuthContext()

  // If the active org isn't set up yet, send the user to onboarding
  if (!context.active_org) {
    redirect("/onboarding")
  }

  const { active_org } = context
  const orgRoleName = active_org.org_role_name ?? null
  const canOpenAdmin = active_org.can_open_admin
  const adminHref =
    active_org.admin_tabs && active_org.admin_tabs.length > 0
      ? `/admin/${active_org.admin_tabs[0]}`
      : null

  // Restore sidebar persisted state
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar canOpenAdmin={canOpenAdmin} adminHref={adminHref} />
      <SidebarInset>
        <AppHeader orgRoleName={orgRoleName} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getAuthContext } from "@/lib/api/queries/auth"
import { QueryProvider } from "@/lib/query/provider"
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
  // Admin sections this user may open (backend decides, D4); empty = no Admin link
  const adminTabs = active_org.admin_tabs ?? []
  // Feedback shows when the user can give a strike, commend someone or review appeals (D54)
  const showFeedback = (active_org.feedback_tabs ?? []).length > 0

  // Restore sidebar persisted state; open on a first visit (no cookie yet)
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    // Keyed by org: switching org starts a fresh TanStack cache, so one org's data never shows in another
    <QueryProvider key={active_org.org_id}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar adminTabs={adminTabs} showFeedback={showFeedback} />
        <SidebarInset>
          <AppHeader orgRoleName={orgRoleName} />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </QueryProvider>
  )
}
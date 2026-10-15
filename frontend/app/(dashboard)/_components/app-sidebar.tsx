"use client"

import { OrganizationSwitcher } from "@clerk/nextjs"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavItems, type AdminTab } from "./nav-items"
import { UserNav } from "./user-nav"

interface AppSidebarProps {
  adminTabs: AdminTab[]
  showFeedback: boolean
}

export function AppSidebar({ adminTabs, showFeedback }: AppSidebarProps) {
  const { state, isMobile } = useSidebar()
  // Icon-only mode (desktop). On phones the sidebar is a full-width drawer.
  const compact = state === "collapsed" && !isMobile

  return (
    <Sidebar collapsible="icon">
      {/* Collapse button stays in the top-left corner. Height matches AppHeader (h-14) so the lines align. */}
      <SidebarHeader className="flex h-14 shrink-0 flex-row items-center gap-1 border-b px-2 group-data-[collapsible=icon]:justify-center">
        <SidebarTrigger className="shrink-0" />
        {!compact && <OrgSwitcher compact={false} />}
      </SidebarHeader>

      <SidebarContent className="px-2 pt-3">
        {/* Not enough room next to the button when collapsed: the org logo sits just below it */}
        {compact && (
          <div className="flex justify-center pb-1">
            <OrgSwitcher compact />
          </div>
        )}
        <NavItems adminTabs={adminTabs} showFeedback={showFeedback} />
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <UserNav />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

/** Clerk org switcher; `compact` shows only the org logo. */
function OrgSwitcher({ compact }: { compact: boolean }) {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterCreateOrganizationUrl="/onboarding"
      afterSelectOrganizationUrl="/dashboard"
      appearance={{
        elements: {
          rootBox: compact ? "flex" : "min-w-0 flex-1 overflow-hidden",
          organizationSwitcherTrigger: compact
            ? "size-8 justify-center p-0 rounded-md hover:bg-sidebar-accent [&_.cl-organizationPreviewTextContainer]:!hidden [&_.cl-organizationSwitcherTriggerIcon]:!hidden"
            : "w-full max-w-full flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors overflow-hidden",
          organizationPreview: "min-w-0 flex-1 flex items-center gap-2 overflow-hidden",
          organizationPreviewAvatarBox: "size-7 shrink-0",
          // Text remains visible inside the switcher's popup
          organizationPreviewTextContainer: "min-w-0 flex-1 overflow-hidden text-left leading-tight",
          organizationPreviewMainIdentifier: "truncate text-sm font-medium block max-w-full",
          organizationSwitcherTriggerIcon: "size-4 shrink-0 text-muted-foreground mr-1",
        },
      }}
    />
  )
}

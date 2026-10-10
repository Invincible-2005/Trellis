"use client"

import { OrganizationSwitcher } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavItems } from "./nav-items"
import { UserNav } from "./user-nav"

interface AppSidebarProps {
  canOpenAdmin: boolean
  adminHref: string | null
}

export function AppSidebar({ canOpenAdmin, adminHref }: AppSidebarProps) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon">
      {/* 1. Header height matches AppHeader (h-14) so the horizontal lines align seamlessly */}
      <SidebarHeader className="flex h-14 shrink-0 items-center justify-center border-b px-3 overflow-hidden group-data-[collapsible=icon]:px-0">
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/onboarding"
          afterSelectOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full max-w-full flex items-center justify-center overflow-hidden",
              // Scopes hiding of the text and arrow strictly to the trigger button when collapsed
              organizationSwitcherTrigger: cn(
                "w-full max-w-full flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors overflow-hidden",
                isCollapsed &&
                  "justify-center p-0 size-8 [&_.cl-organizationPreviewTextContainer]:!hidden [&_.cl-organizationSwitcherTriggerIcon]:!hidden"
              ),
              organizationPreview:
                "min-w-0 flex-1 flex items-center gap-2 overflow-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
              organizationPreviewAvatarBox: "size-7 shrink-0",
              // Text remains visible inside popups/dropdowns
              organizationPreviewTextContainer:
                "min-w-0 flex-1 overflow-hidden text-left leading-tight",
              organizationPreviewMainIdentifier:
                "truncate text-sm font-medium block max-w-full",
              organizationSwitcherTriggerIcon:
                "size-4 shrink-0 text-muted-foreground mr-1",
            },
          }}
        />
      </SidebarHeader>

      {/* 2. pt-3 moves the navigation items down so they have clean breathing room */}
      <SidebarContent className="px-2 pt-3">
        <NavItems canOpenAdmin={canOpenAdmin} adminHref={adminHref} />
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        <UserNav />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
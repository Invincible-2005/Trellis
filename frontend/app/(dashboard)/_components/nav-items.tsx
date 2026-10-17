"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bot,
  LayoutDashboard,
  Users,
  ShieldCheck,
  ChevronRight,
  Network,
  UserPlus,
  FileText,
  ClipboardList,
  type LucideIcon,
} from "lucide-react"

import type { components } from "@/lib/api/v1"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type AdminTab = NonNullable<
  components["schemas"]["ActiveOrgPermissions"]["admin_tabs"]
>[number]

const ADMIN_TABS: Record<AdminTab, { label: string; icon: LucideIcon }> = {
  roles: { label: "Roles", icon: Network },
  members: { label: "Members", icon: UserPlus },
  documents: { label: "Documents", icon: FileText },
}

const ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Teams", href: "/teams", icon: Users },
  { label: "Tasks", href: "/tasks", icon: ClipboardList },
  { label: "Chat", href: "/chat", icon: Bot },
]

// Strikes, commendations and appeals (trellis/12 D54); only for people with a Feedback tab
const FEEDBACK_ITEM = { label: "Feedback", href: "/feedback", icon: MessageSquareText }

interface NavItemsProps {
  /** Admin sections this user may open; the Admin entry is hidden when empty. */
  adminTabs: AdminTab[]
  /** The user has at least one Feedback tab (auth/context `feedback_tabs`). */
  showFeedback: boolean
}

export function NavItems({ adminTabs, showFeedback }: NavItemsProps) {
  const pathname = usePathname()
  const { setOpenMobile, isMobile, state } = useSidebar()
  const compact = state === "collapsed" && !isMobile

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const items = showFeedback ? [...ITEMS, FEEDBACK_ITEM] : ITEMS
  const adminLinks = adminTabs.map((tab) => ({ href: `/admin/${tab}`, ...ADMIN_TABS[tab] }))
  const adminActive = pathname.startsWith("/admin")

  return (
    <SidebarMenu className="gap-1.5">
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
            <Link href={item.href} onClick={closeOnMobile}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}

      {adminLinks.length > 0 &&
        (compact ? (
          // Icons only: the shield opens a small menu to the right
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton isActive={adminActive} tooltip="Admin">
                  <ShieldCheck />
                  <span>Admin</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="min-w-40">
                <DropdownMenuLabel>Admin</DropdownMenuLabel>
                {adminLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href}>
                      <link.icon />
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ) : (
          // Full width: Admin opens a list underneath (already open on /admin pages)
          <Collapsible asChild defaultOpen={adminActive} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton isActive={adminActive} tooltip="Admin">
                  <ShieldCheck />
                  <span>Admin</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {adminLinks.map((link) => (
                    <SidebarMenuSubItem key={link.href}>
                      <SidebarMenuSubButton asChild isActive={isActive(link.href)}>
                        <Link href={link.href} onClick={closeOnMobile}>
                          <link.icon />
                          <span>{link.label}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ))}
    </SidebarMenu>
  )
}

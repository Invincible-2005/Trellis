"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import { ChevronsUpDown, LogOut, UserCog } from "lucide-react"

import { ModeToggle } from "@/components/ui/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserNav() {
  const { user } = useUser()
  const { openUserProfile, signOut } = useClerk()
  const { isMobile } = useSidebar()

  const displayEmail = user?.primaryEmailAddress?.emailAddress
  const displayName =
    user?.fullName || user?.firstName || displayEmail?.split("@")[0] || "User"
  const initials = displayName.slice(0, 2).toUpperCase()

  // Avatar + name + email; shared by the row and the menu's header
  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user?.imageUrl} alt={displayName} />
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{displayName}</span>
        {displayEmail && (
          <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
        )}
      </div>
    </>
  )

  return (
    <SidebarMenu className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
      <SidebarMenuItem className="min-w-0 flex-1">
        <DropdownMenu>
          {/* The whole row (avatar, name, email) opens the account menu */}
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={displayName}>
              {identity}
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="min-w-56"
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              {identity}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openUserProfile()}>
              <UserCog />
              Manage account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/" })}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {/* Theme toggle stays separate so clicking it doesn't open the menu */}
      <SidebarMenuItem className="shrink-0">
        <ModeToggle />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

"use client"

import { UserButton, useUser } from "@clerk/nextjs"
import { ModeToggle } from "@/components/ui/theme-toggle"

export function UserNav() {
  const { user } = useUser()

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "User"

  const displayEmail = user?.primaryEmailAddress?.emailAddress

  return (
    <div className="flex items-center justify-between gap-2 p-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-3">
      {/* Avatar + Name / Email */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "size-8 shrink-0",
            },
          }}
        />
        <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
          <span className="truncate text-sm font-medium leading-tight text-sidebar-foreground">
            {displayName}
          </span>
          {displayEmail && (
            <span className="truncate text-xs text-muted-foreground leading-tight mt-0.5">
              {displayEmail}
            </span>
          )}
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="shrink-0">
        <ModeToggle />
      </div>
    </div>
  )
}
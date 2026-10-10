"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const LABEL_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  teams: "Teams",
  tasks: "Tasks",
  chat: "Chat",
  documents: "Documents",
  admin: "Admin",
  roles: "Roles",
  members: "Members",
  strikes: "Strikes",
}

function isId(segment: string) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-zA-Z_-]{20,}$/.test(segment)
  )
}

interface AppHeaderProps {
  orgRoleName: string | null
}

export function AppHeader({ orgRoleName }: AppHeaderProps) {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear">
      {/* Left: Trigger + Separator + Breadcrumbs */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1
              const path = `/${segments.slice(0, index + 1).join("/")}`

              const label = isId(segment)
                ? "Details"
                : LABEL_MAP[segment] ||
                  segment.charAt(0).toUpperCase() + segment.slice(1)

              return (
                <React.Fragment key={path}>
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{label}</BreadcrumbPage>
                    ) : segment === "admin" ? (
                      // "Admin" is plain text since /admin itself has no page
                      <span className="text-muted-foreground">{label}</span>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={path}>{label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right: Role badge */}
      {orgRoleName && (
        <div>
          <Badge variant="secondary" className="font-normal">
            {orgRoleName}
          </Badge>
        </div>
      )}
    </header>
  )
}
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, ShieldCheck } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"

interface NavItemsProps {
  canOpenAdmin: boolean
  adminHref: string | null
}

export function NavItems({ canOpenAdmin, adminHref }: NavItemsProps) {
  const pathname = usePathname()
  const { setOpenMobile, isMobile } = useSidebar()

  const items = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      show: true,
    },
    {
      label: "Teams",
      href: "/teams",
      icon: Users,
      show: true,
    },
    {
      label: "Admin",
      href: adminHref ?? "/admin",
      icon: ShieldCheck,
      show: canOpenAdmin && Boolean(adminHref),
    },
  ].filter((item) => item.show)

  const isItemActive = (href: string) => {
    if (href.startsWith("/admin")) {
      return pathname.startsWith("/admin")
    }
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <SidebarMenu className="gap-1.5">
      {items.map((item) => {
        const active = isItemActive(item.href)
        return (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
            >
              <Link
                href={item.href}
                onClick={() => {
                  if (isMobile) setOpenMobile(false)
                }}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
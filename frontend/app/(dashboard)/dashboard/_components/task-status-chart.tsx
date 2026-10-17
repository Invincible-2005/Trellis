"use client"

import { AlertCircle } from "lucide-react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import type { TaskSummary } from "@/lib/api/queries/dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
  count: { label: "Tasks" },
  todo: { label: "To do", color: "var(--chart-1, #3b82f6)" },
  in_progress: { label: "In progress", color: "var(--chart-2, #f59e0b)" },
  blocked: { label: "Blocked", color: "var(--chart-3, #ef4444)" },
  done: { label: "Done", color: "var(--chart-4, #10b981)" },
} satisfies ChartConfig

export function TaskStatusChart({ summary }: { summary: TaskSummary }) {
  const total =
    summary.todo + summary.in_progress + summary.blocked + summary.done

  if (total === 0) {
    return (
      <Card className="h-full flex flex-col justify-between">
        <CardHeader>
          <CardTitle className="text-base font-semibold">My Tasks by Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center py-10">
          <p className="text-muted-foreground text-sm">No tasks assigned to you.</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = [
    { status: "To do", count: summary.todo, fill: "var(--color-todo, #3b82f6)" },
    { status: "In progress", count: summary.in_progress, fill: "var(--color-in_progress, #f59e0b)" },
    { status: "Blocked", count: summary.blocked, fill: "var(--color-blocked, #ef4444)" },
    { status: "Done", count: summary.done, fill: "var(--color-done, #10b981)" },
  ]

  return (
    <Card className="h-full flex flex-col justify-between">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">My Tasks by Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between pb-4">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>

        {summary.overdue > 0 && (
          <p className="text-destructive text-xs font-medium mt-3 flex items-center gap-1.5">
            <AlertCircle className="size-3.5" />
            {summary.overdue} overdue
          </p>
        )}
      </CardContent>
    </Card>
  )
}
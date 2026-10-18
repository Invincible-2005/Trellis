import { Card } from '@/components/ui/card'
import { ArrowLeftRight, Bell, LineChart, Users } from 'lucide-react'

export default function Features() {
    return (
        <section id="security" className="scroll-mt-20 py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight lg:text-5xl">
                    <span className="text-foreground">Structural Access Control.</span> <br /> Security enforced at retrieval, not prompt suggestions.
                </h2>
                <div className="*:bg-background mt-8 grid gap-3 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="p-8">
                        <p className="text-muted-foreground max-w-xs text-lg font-medium">
                            <span className="text-foreground">Hierarchical Access Control (RBAC).</span> Security is enforced deep within SQL & pgvector queries (resolve_scope), ensuring zero cross-team data leakage.
                        </p>

                        <div className="my-8 space-y-2 text-sm font-mono">
                            <div className="text-foreground font-semibold">Admin</div>
                            <div className="pl-4 border-l border-muted-foreground/30 text-muted-foreground">HR</div>
                            <div className="pl-8 border-l border-muted-foreground/20 text-muted-foreground">Manager</div>
                            <div className="pl-12 border-l border-muted-foreground/10 text-muted-foreground">Employee</div>
                        </div>
                    </Card>
                    <Card className="lg:col-span-2">
                        <div className="p-8">
                            <p className="text-muted-foreground max-w-xs text-lg font-medium">
                                <span className="text-foreground">Role-Scoped Agentic RAG Assistant.</span> Query organization SOPs, policies, and tasks via LangGraph with grounded answers and inline citation badges.
                            </p>
                        </div>

                        <div className="mt-6 space-y-3 text-sm">
                            <div className="bg-muted rounded-lg px-4 py-2 max-w-xs">Who submitted tasks late last week?</div>
                            <div className="bg-primary/10 rounded-lg px-4 py-2 max-w-sm ml-auto text-right">
                                Based on authorized records, 2 members of Team Alpha missed the Friday deadline...
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="max-sm:*:not-last:border-b max-sm:*:not-last:pb-3 mt-12 grid gap-3 *:max-w-xs sm:grid-cols-2 md:mt-16 md:gap-y-6 lg:mt-24 lg:grid-cols-4 lg:gap-6">
                    <p className="text-muted-foreground text-balance">
                        <span className="text-foreground font-medium">
                            <ArrowLeftRight /> Permission Enforcement — Database-level scoping for vector & relational queries.
                        </span>{' '}
                        Scope is injected server-side the LLM never sees or controls the access filter.
                    </p>

                    <p className="text-muted-foreground text-balance">
                        <span className="text-foreground font-medium">
                            <Bell /> Policy Workflows — Automated actions like strikes, validated against company SOPs.
                        </span>{' '}
                        Strikes, task queries, and document retrieval are all logged to the immutable audit log.
                    </p>

                    <p className="text-muted-foreground text-balance">
                        <span className="text-foreground font-medium">
                            <Users /> Role Dashboards — Tailored metrics for Employees, Managers, HR, and Admins.
                        </span>{' '}
                        Managers see team rollups. Employees see only their own work. Scope is resolved at every query.
                    </p>

                    <p className="text-muted-foreground text-balance">
                        <span className="text-foreground font-medium">
                            <LineChart /> Audit Logging — Immutable log of all queries, retrieved chunks, and denied access attempts.
                        </span>{' '}
                        Permission changes explicitly invalidate the Redis scope cache no stale access windows
                    </p>
                </div>
            </div>
        </section>
    )
}

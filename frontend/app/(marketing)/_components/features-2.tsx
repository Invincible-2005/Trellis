import { Card } from '@/components/ui/card'
import { AlertTriangle, Clock, Network, Database, FileSearch, RefreshCw, Shield } from 'lucide-react'

export default function Features() {
    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight lg:text-5xl">
                    <span className="text-foreground">Built for every level of your org.</span> <br /> Role-scoped views from Employee to Admin — one platform, one enforcement engine.
                </h2>

                <div className="mt-8 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
                    {/* Card 1: Strike System */}
                    <Card className="p-8">
                        <div className="bg-primary/10 text-primary mb-5 flex size-10 items-center justify-center rounded-lg">
                            <AlertTriangle className="size-5" />
                        </div>
                        <h3 className="text-foreground text-lg font-semibold tracking-tight">
                            Policy-Validated Strike System
                        </h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            Managers issue strikes through the AI chat. The agent validates the reason against company policy docs via RAG before writing to the database. Three strikes trigger automatic escalation to the next role up.
                        </p>
                    </Card>

                    {/* Card 2: Task Management */}
                    <Card className="p-8">
                        <div className="bg-primary/10 text-primary mb-5 flex size-10 items-center justify-center rounded-lg">
                            <Clock className="size-5" />
                        </div>
                        <h3 className="text-foreground text-lg font-semibold tracking-tight">
                            Deadline Visibility by Role
                        </h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            Employees see their own tasks and deadlines. Managers see their team&apos;s aggregate progress. HR sees cross-team summaries — all resolved dynamically from the same permission engine, with no manual filters.
                        </p>
                    </Card>

                    {/* Card 3: Admin Console */}
                    <Card className="p-8">
                        <div className="bg-primary/10 text-primary mb-5 flex size-10 items-center justify-center rounded-lg">
                            <Network className="size-5" />
                        </div>
                        <h3 className="text-foreground text-lg font-semibold tracking-tight">
                            Visual Role Hierarchy Builder
                        </h3>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            Build your org&apos;s role tree with an interactive drag-and-drop editor. Create teams, invite members by email, and upload SOPs tagged to a specific role or team — no code required.
                        </p>
                    </Card>
                </div>

                {/* 4-Column Bottom List */}
                <div className="max-sm:*:not-last:border-b max-sm:*:not-last:pb-3 mt-12 grid gap-3 *:max-w-xs sm:grid-cols-2 md:mt-16 md:gap-y-6 lg:mt-24 lg:grid-cols-4 lg:gap-6">
                    <p className="text-muted-foreground text-balance text-sm leading-relaxed">
                        <span className="text-foreground mb-1.5 flex items-center gap-1.5 font-medium">
                            <Shield className="size-4" /> Dynamic Access Scoping
                        </span>
                        Every query resolves the caller's exact role hierarchy before retrieval — preventing unauthorized document and task access at the source.
                    </p>

                    <p className="text-muted-foreground text-balance text-sm leading-relaxed">
                        <span className="text-foreground mb-1.5 flex items-center gap-1.5 font-medium">
                            <FileSearch className="size-4" /> Grounded Answers Only
                        </span>
                        Every claim must trace to a retrieved, authorized chunk. Ungrounded claims are removed before the answer is returned.
                    </p>

                    <p className="text-muted-foreground text-balance text-sm leading-relaxed">
                        <span className="text-foreground mb-1.5 flex items-center gap-1.5 font-medium">
                            <RefreshCw className="size-4" /> Auto Query Rewrite
                        </span>
                        If retrieval fails relevancy grading, the query is automatically rewritten and retried (max 2 attempts).
                    </p>

                    <p className="text-muted-foreground text-balance text-sm leading-relaxed">
                        <span className="text-foreground mb-1.5 flex items-center gap-1.5 font-medium">
                            <Database className="size-4" /> Honest Zero-Results
                        </span>
                        When scope filtering leaves nothing, the agent says so — it never hallucinates data outside the user&apos;s scope.
                    </p>
                </div>
            </div>
        </section>
    )
}
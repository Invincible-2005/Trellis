// export default function StatsSection() {
//     return (
//         <section className="py-16 md:py-20">
//             <div className="mx-auto max-w-7xl px-6">
//                 <div className="grid gap-4 md:grid-cols-2 md:gap-6">
//                     <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight lg:text-5xl">
//                         <span className="text-foreground">Close more deals.</span> <br /> Know every customer signal.
//                     </h2>
//                     <div className="flex flex-col gap-32 md:mx-auto xl:gap-44">
//                         <p className="text-muted-foreground text-balance text-lg">Modern sales teams move faster when every account, conversation, and next step lives in one place. Trellis brings pipeline, outreach, and customer history into a focused CRM workspace where reps can spot momentum, prioritize follow-up, and turn relationships into revenue. </p>

//                         {/* <div className="grid gap-12 md:grid-cols-3 md:gap-12">
//                             <div className="space-y-3 border-t pt-6">
//                                 <div className="text-4xl font-semibold tracking-tight">21k</div>
//                                 <p className="text-muted-foreground">Deals tracked</p>
//                             </div>
//                             <div className="space-y-3 border-t pt-6">
//                                 <div className="text-4xl font-semibold tracking-tight">22m</div>
//                                 <p className="text-muted-foreground">Customer signals</p>
//                             </div>
//                             <div className="space-y-3 border-t pt-6">
//                                 <div className="text-4xl font-semibold tracking-tight">+500</div>
//                                 <p className="text-muted-foreground">Sales teams</p>
//                             </div>
//                         </div> */}
//                     </div>
//                 </div>
//             </div>
//         </section>
//     )
// }



export default function StatsSection() {
    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid gap-8 md:grid-cols-2 md:gap-12">
                    <div>
                        <h2 className="text-muted-foreground max-w-xl text-balance text-4xl font-medium tracking-tight lg:text-5xl">
                            <span className="text-foreground">One enforcement layer.</span> <br /> Zero data leakage.
                        </h2>
                    </div>
                    <div className="flex flex-col gap-10">
                        <p className="text-muted-foreground text-balance text-lg">
                            Trellis resolves every user&apos;s access scope dynamically at query time — not at login. Every document retrieval, tool call, and agent action passes through the same permission engine before returning a single result.
                        </p>

                        <div className="grid gap-8 border-t pt-8 sm:grid-cols-3">
                            <div className="space-y-2">
                                <div className="text-lg font-semibold tracking-tight text-foreground">
                                    Hierarchical RBAC
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    Arbitrarily deep role trees, Admin-configurable, not hardcoded.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="text-lg font-semibold tracking-tight text-foreground">
                                    Scoped Vector Search
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    pgvector + SQL permission filter in one query — LLM never sees unauthorized chunks.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="text-lg font-semibold tracking-tight text-foreground">
                                    Immutable Audit Trail
                                </div>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    Every query logs resolved scope, chunks retrieved, and access denials.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
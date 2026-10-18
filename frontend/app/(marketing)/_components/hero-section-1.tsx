import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { HeroHeader } from '@/app/(marketing)/_components/hero-section-1-header'

export default function HeroSection() {
    return (
        <>
            <HeroHeader />
            <main className="overflow-hidden">
                <section className="pb-8 md:pb-16">
                    <div className="relative pt-24 md:pt-36">
                        <div className="mx-auto max-w-7xl">
                            <div className="px-6 text-center sm:mx-auto lg:mr-auto lg:mt-0">
                                <Link
                                    href="#security"
                                    className="group mx-auto flex w-fit items-center gap-3 rounded-full p-1 pl-4 transition-colors duration-300">
                                    <span className="text-sm font-medium">New:</span>
                                    <span className="text-muted-foreground text-sm">Role-Aware AI Workspace for Organizations</span>

                                    <div className="size-6 overflow-hidden rounded-full duration-500">
                                        <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                                            <span className="flex size-6">
                                                <ArrowRight className="m-auto size-3" />
                                            </span>
                                            <span className="flex size-6">
                                                <ArrowRight className="m-auto size-3" />
                                            </span>
                                        </div>
                                    </div>
                                </Link>

                                <h1 className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-medium tracking-tight md:text-6xl lg:mt-12 xl:text-7xl">
                                    Role-aware intelligence for every level of your organization.
                                </h1>
                                <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-balance md:text-lg">
                                    Trellis is an intelligent organization workspace powered by strict hierarchical access control. Dynamically scope knowledge retrieval, team tasks, and AI assistance to each member&apos;s exact role tree with zero cross-team data leakage.
                                </p>

                                <div className="mt-6 flex flex-col items-center justify-center gap-2 md:flex-row">
                                    <Button key={1} asChild>
                                        <Link href="#security"><span className="text-nowrap">Explore Architecture</span></Link>
                                    </Button>
                                    <Button key={2} variant="ghost" asChild>
                                        <Link href="#features">
                                            <span className="text-nowrap">See how it works</span>
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            <div className="relative mt-8 overflow-hidden p-6 max-sm:-mr-56 sm:mt-16">
                                <div className="rounded-4xl mask-t-from-25% mask-t-to-65% bg-linear-to-b absolute inset-0 border to-zinc-600"></div>
                                <div className="bg-background ring-foreground/6.5 before:mask-radial-at-top-left before:mask-radial-from-65% before:mask-radial-[100%_60%] before:ring-foreground before:border-foreground/10 relative rounded-2xl p-2 shadow-xl shadow-black/50 ring before:absolute before:-inset-px before:z-10 before:size-56 before:rounded-tl-2xl before:border-l before:border-t">
                                    <div className="bg-foreground/2 z-1 absolute inset-0 rounded-2xl"></div>
                                    <Image
                                        className="bg-background relative h-auto w-full rounded-2xl"
                                        src="/hero-preview.png"
                                        alt="Trellis role hierarchy screen"
                                        width={1918}
                                        height={946}
                                        priority
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}

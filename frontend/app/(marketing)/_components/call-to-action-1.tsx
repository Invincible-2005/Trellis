import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Show, SignInButton } from '@clerk/nextjs'

export default function CallToAction() {
    return (
        <section id="get-started" className="scroll-mt-20 py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="mx-auto max-w-4xl text-center">
                    <h2 className="text-balance text-4xl font-semibold tracking-tight lg:text-5xl xl:text-6xl">Ready to bring role-aware AI intelligence to your organization?</h2>

                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Show when="signed-out">
                            <Button
                                size="lg"
                                asChild
                            ><Link href="/sign-up">Get Started</Link></Button>

                            <SignInButton forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                                <Button size="lg" variant="outline">Sign in</Button>
                            </SignInButton>
                        </Show>
                        <Show when="signed-in">
                            <Button
                                size="lg"
                                asChild
                            ><Link href="/dashboard">Go to Dashboard</Link></Button>
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    )
}

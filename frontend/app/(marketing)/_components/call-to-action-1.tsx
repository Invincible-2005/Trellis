import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function CallToAction() {
    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="mx-auto max-w-4xl text-center">
                    <h2 className="text-balance text-4xl font-semibold tracking-tight lg:text-5xl xl:text-6xl">Ready to bring role-aware AI intelligence to your organization?</h2>

                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Button
                            size="lg"
                            asChild
                        ><Link href="/sign-up">Get Started</Link></Button>

                        <Button
                            size="lg"
                            variant="outline"
                            asChild>
                            <Link href="#">Get a Demo</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}

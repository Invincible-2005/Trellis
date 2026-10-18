import Link from 'next/link'
import { Show, SignInButton } from '@clerk/nextjs'
import { Logo } from '@/app/(marketing)/_components/logo'
import { Button } from '@/components/ui/button'

// Only links that lead somewhere real: sections of the landing page
const productLinks = [
    { href: '#security', label: 'Security' },
    { href: '#features', label: 'Features' },
    { href: '#get-started', label: 'Get started' },
]

export default function Footer() {
    return (
        <footer className="border-t">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-xs space-y-3">
                        <Link href="/" aria-label="go home" className="inline-block">
                            <Logo />
                        </Link>
                        <p className="text-muted-foreground text-sm">
                            Role-aware AI workspace for organizations.
                        </p>
                    </div>

                    <div>
                        <span className="text-sm font-medium">Product</span>
                        <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3 md:flex-col md:gap-y-3">
                            {productLinks.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="hover:text-primary text-muted-foreground text-sm duration-150"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground text-sm">&copy; Trellis 2026 - Present</span>

                    <Show when="signed-out">
                        <SignInButton forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                            <Button variant="outline" size="sm" className="max-sm:w-full">Sign in</Button>
                        </SignInButton>
                    </Show>
                    <Show when="signed-in">
                        <Button asChild variant="outline" size="sm" className="max-sm:w-full">
                            <Link href="/dashboard">Go to Dashboard</Link>
                        </Button>
                    </Show>
                </div>
            </div>
        </footer>
    )
}

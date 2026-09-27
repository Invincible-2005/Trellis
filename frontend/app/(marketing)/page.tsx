
import FeaturesOne from '@/app/(marketing)/_components/features-1'
import FeaturesTwo from '@/app/(marketing)/_components/features-2'
import Stats from '@/app/(marketing)/_components/stats-1'
import Testimonials from '@/app/(marketing)/_components/testimonials-1'
import CallToAction from '@/app/(marketing)/_components/call-to-action-1'
import Footer from '@/app/(marketing)/_components/footer-1'

import HeroSection from './_components/hero-section-1'

export default function DuskLandingPage() {
    return (
        <>
            <HeroSection />
            <FeaturesOne />
            <Stats />
            <FeaturesTwo />
            <CallToAction />
            <Footer />
        </>
    )
}

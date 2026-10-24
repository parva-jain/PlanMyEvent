import { AiTeaser } from '@/components/home/ai-teaser';
import { Faq } from '@/components/home/faq';
import { Features } from '@/components/home/features';
import { FinalCta } from '@/components/home/final-cta';
import { GuestExperience } from '@/components/home/guest-experience';
import { Hero } from '@/components/home/hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { Pricing } from '@/components/home/pricing';
import { ProblemSolution } from '@/components/home/problem-solution';
import { SiteFooter } from '@/components/home/site-footer';
import { SiteHeader } from '@/components/home/site-header';
import { UseCases } from '@/components/home/use-cases';

// Marketing home page (docs/MOTION.md 6.2), section order from the Stitch design.
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <ProblemSolution />
        <HowItWorks />
        <Features />
        <UseCases />
        <GuestExperience />
        <AiTeaser />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

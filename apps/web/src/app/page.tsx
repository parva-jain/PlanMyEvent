import { Hero } from '@/components/home/hero';
import { ProblemSolution } from '@/components/home/problem-solution';
import { SiteHeader } from '@/components/home/site-header';

// Marketing home page (docs/MOTION.md 6.2). Sections are added one per commit.
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <ProblemSolution />
      </main>
    </>
  );
}

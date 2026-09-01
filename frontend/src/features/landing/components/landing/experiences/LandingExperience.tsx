import { CapabilitiesSection } from "../CapabilitiesSection";
import { CTASection } from "../CTASection";
import { HeroSection } from "../HeroSection";
import { LandingHeader } from "../LandingHeader";
import { StatSection } from "../StatSection";
import { WorkflowSection } from "../WorkflowSection";

interface LandingExperienceProps {
  animated?: boolean;
  logoAvailable?: boolean;
  showShield?: boolean;
}

export function LandingExperience({
  animated = true,
  logoAvailable = true,
  showShield = true,
}: LandingExperienceProps) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader logoAvailable={logoAvailable} />
      <main>
        <HeroSection animated={animated} showShield={showShield} />
        <CapabilitiesSection />
        <WorkflowSection />
        <StatSection />
        <CTASection />
      </main>
    </div>
  );
}

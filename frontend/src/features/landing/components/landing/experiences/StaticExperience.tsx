import { LandingExperience } from "./LandingExperience";

interface StaticExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}
export function StaticExperience({
  logoAvailable = true,
  showShield = true,
}: StaticExperienceProps) {
  return (
    <LandingExperience
      animated={false}
      logoAvailable={logoAvailable}
      showShield={showShield}
    />
  );
}

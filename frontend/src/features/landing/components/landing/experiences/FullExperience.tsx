import { LandingExperience } from "./LandingExperience";

interface FullExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}

export function FullExperience({
  logoAvailable = true,
  showShield = true,
}: FullExperienceProps) {
  return (
    <LandingExperience
      animated
      logoAvailable={logoAvailable}
      showShield={showShield}
    />
  );
}

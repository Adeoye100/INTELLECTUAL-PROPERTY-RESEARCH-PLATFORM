import { LandingExperience } from "./LandingExperience";

interface LiteExperienceProps {
  logoAvailable?: boolean;
  showShield?: boolean;
}

export function LiteExperience({
  logoAvailable = true,
  showShield = true,
}: LiteExperienceProps) {
  return (
    <LandingExperience
      animated
      logoAvailable={logoAvailable}
      showShield={showShield}
    />
  );
}

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { BrowserRouter } from "react-router-dom";
import { LandingHeader } from "./LandingHeader";
import { HeroSection } from "./HeroSection";

function renderHero(props: ComponentProps<typeof HeroSection> = {}) {
  return render(
    <BrowserRouter>
      <HeroSection {...props} />
    </BrowserRouter>,
  );
}

describe("Landing Page Visual Regressions", () => {
  describe("LandingHeader", () => {
    it("uses nowrap for Sign in text", () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>,
      );
      const signInLink = screen.getByText(/Sign in/i);
      expect(signInLink).toHaveClass("whitespace-nowrap");
    });

    it("uses white color for Sign in link", () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>,
      );
      const signInLink = screen.getByText(/Sign in/i);
      expect(signInLink).toHaveClass("text-white");
    });

    it("has the primary organization action with a minimum touch target", () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>,
      );
      const organizationLink = screen.getByText(/Create organization/i);
      expect(organizationLink.closest("a")).toHaveClass("min-h-[44px]");
    });
  });

  describe("HeroSection", () => {
    it("uses the approved near-white text token for the hero paragraph", () => {
      renderHero({ animated: false });
      const paragraph = screen.getByText(
        /Search registries, examine confusion risk/i,
      );
      expect(paragraph).toHaveClass("text-[#F7FAFC]");
    });

    it("uses the semantic brand hero surface", () => {
      renderHero({ animated: false });
      expect(screen.getByTestId("landing-hero")).toHaveClass(
        "bg-[color:var(--landing-hero)]",
      );
    });

    it("renders the shield when showShield is true", () => {
      renderHero({ animated: false, showShield: true });
      expect(
        screen.getByRole("img", { name: /Forge Global shield mark/i }),
      ).toBeInTheDocument();
    });

    it("hides the shield when showShield is false", () => {
      renderHero({ animated: false, showShield: false });
      expect(
        screen.queryByRole("img", { name: /Forge Global shield mark/i }),
      ).not.toBeInTheDocument();
    });
  });
});

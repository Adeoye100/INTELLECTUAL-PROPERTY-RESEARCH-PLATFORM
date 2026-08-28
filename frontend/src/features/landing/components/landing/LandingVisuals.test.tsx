import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingHeader } from './LandingHeader';
import { HeroSection } from './HeroSection';

describe('Landing Page Visual Regressions', () => {
  describe('LandingHeader', () => {
    it('uses nowrap for Sign in text', () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>
      );
      const signInLink = screen.getByText(/Sign in/i);
      expect(signInLink).toHaveClass('whitespace-nowrap');
    });

    it('uses white color for Sign in link', () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>
      );
      const signInLink = screen.getByText(/Sign in/i);
      expect(signInLink).toHaveClass('text-white');
    });

    it('has Request Access button with minimum height', () => {
      render(
        <BrowserRouter>
          <LandingHeader />
        </BrowserRouter>
      );
      const requestAccessLink = screen.getByText(/Request Access/i);
      expect(requestAccessLink).toHaveClass('min-h-[44px]');
    });
  });

  describe('HeroSection', () => {
    it('uses the approved near-white text token for the paragraph', () => {
      render(<HeroSection animated={false} />);
      const paragraph = screen.getByText(/One shield, six capabilities/i);
      expect(paragraph).toHaveClass('text-[#F7FAFC]');
    });

    it('contains a dark backing panel behind the hero paragraph', () => {
      render(<HeroSection animated={false} />);
      const paragraph = screen.getByText(/One shield, six capabilities/i);
      const backingPanel = paragraph.previousElementSibling;
      expect(backingPanel).toHaveClass('bg-[rgba(10,20,40,0.78)]');
    });

    it('renders the shield when showShield is true', () => {
      render(<HeroSection animated={false} showShield={true} />);
      expect(screen.getByRole('img', { name: /Forge Global shield mark/i })).toBeInTheDocument();
    });

    it('hides the shield when showShield is false', () => {
      render(<HeroSection animated={false} showShield={false} />);
      expect(screen.queryByRole('img', { name: /Forge Global shield mark/i })).not.toBeInTheDocument();
    });
  });
});

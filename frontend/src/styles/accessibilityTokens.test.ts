import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

const colours = tailwindConfig.theme.extend.colors;

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left: string, right: string) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('accessible colour tokens', () => {
  it('keeps risk badges at WCAG 2.1 AA normal-text contrast against white', () => {
    expect(contrast(colours['risk-low'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colours['risk-medium'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colours['risk-high'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps secondary text readable on working and brand surfaces', () => {
    expect(contrast(colours['text-secondary'], colours['surface-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colours['forge-subtext-onDark'], '#0A1428')).toBeGreaterThanOrEqual(4.5);
  });
});

/** Central semantic tokens for charts and dense evidence surfaces. */
export const visualTokens = {
  navy: '#0A1428',
  teal: '#146575',
  chrome: '#8B939E',
  neutralSurface: '#FFFFFF',
  neutralBorder: '#B9C1CA',
  risk: { low: '#166B46', medium: '#765400', high: '#B3261E' },
  status: { responded: '#146575', pending: '#5B6470', unavailable: '#7A4E00', renewal: '#4A5568' },
} as const;

export type RiskRating = keyof typeof visualTokens.risk;


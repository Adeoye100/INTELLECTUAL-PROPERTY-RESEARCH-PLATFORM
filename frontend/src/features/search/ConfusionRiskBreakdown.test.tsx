import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfusionRiskBreakdown } from './ConfusionRiskBreakdown';

describe('ConfusionRiskBreakdown', () => {
  it('keeps the three component scores and evidence visible', () => {
    render(<ConfusionRiskBreakdown score={{ id: 'r', phoneticScore: 61, visualScore: 42, classOverlapScore: 18, compositeScore: 44, conceptualScore: null, classOverlap: false, compositeRating: 'medium', matchedMarkRefs: [{ type: 'Visual', score: 42, evidence: 'Visual evidence' }, { type: 'Phonetic', score: 61, evidence: 'Phonetic evidence' }, { type: 'Class', score: 18, evidence: 'No overlapping classes.' }], methodology: { version: 'v2', description: 'Bounded method', sourceAttribution: ['USPTO'] } }} />);
    expect(screen.getByRole('heading', { name: 'Confusion-risk components' })).toBeInTheDocument();
    expect(screen.getByText('Phonetic similarity')).toBeInTheDocument();
    expect(screen.getByText('Visual similarity')).toBeInTheDocument();
    expect(screen.getByText('Nice-class overlap score')).toBeInTheDocument();
    expect(screen.getByText('Not supported')).toBeInTheDocument();
    expect(screen.getByText('Visual evidence')).toBeInTheDocument();
  });

  it('renders chart/evidence labels as text rather than markup', () => {
    render(<ConfusionRiskBreakdown score={{ id: 'r', phoneticScore: 61, visualScore: 42, classOverlapScore: 18, compositeScore: 44, conceptualScore: null, classOverlap: false, compositeRating: 'medium', matchedMarkRefs: [{ type: 'Visual', score: 42, evidence: '<chart-evidence>' }], methodology: { version: 'v2', description: '<chart-methodology>', sourceAttribution: ['<chart-source>'] } }} />);
    expect(screen.getByText('<chart-evidence>')).toBeInTheDocument();
    expect(screen.getByText('<chart-source>')).toBeInTheDocument();
    expect(document.querySelector('chart-evidence')).toBeNull();
    expect(document.querySelector('chart-source')).toBeNull();
  });
});

import type { RiskAnalysis, RiskScore } from '../../types';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { AccessibleDataTable, ChartCard } from '../../components/visualization/ChartPrimitives';

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

function legalResearchAssessment(score: RiskAnalysis | RiskScore) {
  const rating = score.compositeRating;
  const overlappingClass = score.classOverlap === true || finite(score.classOverlapScore) > 0;
  if (rating === 'high') {
    return {
      conflict: 'Potential live-registry conflict detected',
      opinion: overlappingClass
        ? 'The available USPTO registry evidence indicates a high likelihood-of-confusion research signal because the marks are materially similar and overlap in Nice-class coverage. Escalate for attorney review before filing or relying on clearance.'
        : 'The available USPTO registry evidence indicates a high similarity signal even without confirmed Nice-class overlap. Attorney review is recommended before filing or relying on clearance.',
    };
  }
  if (rating === 'medium') {
    return {
      conflict: 'Potential live-registry conflict requires review',
      opinion: overlappingClass
        ? 'The available USPTO registry evidence indicates a moderate likelihood-of-confusion research signal with relevant class overlap. The result should be reviewed in context before a filing or clearance decision.'
        : 'The available USPTO registry evidence indicates a moderate similarity signal. Review the cited registration/application record and goods or services before a filing or clearance decision.',
    };
  }
  return {
    conflict: 'No material conflict signal detected by this methodology',
    opinion: 'The available USPTO registry evidence produces a low likelihood-of-confusion research signal. This does not rule out unscored legal, factual, common-law, or marketplace conflicts.',
  };
}

export function ConfusionRiskBreakdown({ score }: { score: RiskAnalysis | RiskScore }) {
  const data = [
    { name: 'Phonetic similarity', value: finite(score.phoneticScore) },
    { name: 'Visual similarity', value: finite(score.visualScore) },
    { name: 'Nice-class overlap', value: finite(score.classOverlapScore ?? (score.classOverlap ? 100 : 0)) },
  ];
  const evidence = score.matchedMarkRefs ?? [];
  const classEvidence = evidence.find((entry) => entry.type === 'Class');
  const assessment = legalResearchAssessment(score);

  return <ChartCard title="Confusion-risk components" description="Each component is scored from 0 to 100 using persisted USPTO registry evidence.">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="h-56 min-h-56" role="img" aria-label={`Confusion-risk components. ${data.map((entry) => `${entry.name}: ${entry.value} out of 100`).join('. ')}`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit=" / 100" /><YAxis type="category" dataKey="name" width={142} tick={{ fontSize: 12 }} /><Tooltip formatter={(value: unknown) => [`${value} / 100`, 'Score']} /><Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]} />
          </BarChart></ResponsiveContainer>
        </div>
        <AccessibleDataTable caption="Confusion-risk component scores" rows={data.map((entry) => ({ label: `${entry.name.replace(' similarity', '')} score`, value: `${entry.value} / 100` }))} />
      </div>
      <aside className="space-y-3 rounded border border-border bg-muted p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Composite summary</p><p className="text-lg font-bold text-foreground">Composite rating: {score.compositeRating[0].toUpperCase() + score.compositeRating.slice(1)} · {finite(score.compositeScore ?? 0)} / 100</p><p className="text-sm text-muted-foreground">Methodology: <strong className="text-foreground">{score.methodology?.version ?? 'Not supplied'}</strong></p><p className="text-sm text-muted-foreground">Conceptual score: <strong className="text-foreground">{score.conceptualScore === null ? 'Not supported' : `${score.conceptualScore} / 100`}</strong></p><p className="text-sm text-muted-foreground">Source attribution: <strong className="break-words text-foreground">{score.methodology?.sourceAttribution?.join(', ') || 'Source attribution unavailable'}</strong></p></aside>
    </div>

    <section className="mt-6 rounded border border-border bg-card p-4" aria-labelledby="legal-research-assessment-heading">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Live-registry conflict result</p>
      <h3 id="legal-research-assessment-heading" className="mt-1 text-base font-semibold text-foreground">{assessment.conflict}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{assessment.opinion}</p>
      <p className="mt-3 text-xs text-muted-foreground"><strong className="text-foreground">Preliminary legal research assessment:</strong> this is an evidence-based research aid, not an attorney-client legal opinion or a substitute for qualified legal advice.</p>
    </section>

    <section className="mt-6 border-t border-border pt-4" aria-labelledby="risk-evidence-heading"><h3 id="risk-evidence-heading" className="text-base font-semibold text-foreground">Evidence</h3><div className="mt-3 grid gap-3 md:grid-cols-3">{['Visual', 'Phonetic', 'Class'].map((kind) => { const item = evidence.find((entry) => entry.type === kind); return <article key={kind} className="rounded border border-border bg-muted p-3"><h4 className="font-semibold text-foreground">{kind} similarity</h4><p className="mt-1 text-sm text-muted-foreground">{item?.evidence ?? (kind === 'Class' ? 'No overlapping classes.' : 'Evidence unavailable.')}</p>{kind === 'Class' && !item && <p className="mt-1 text-xs text-muted-foreground">{classEvidence ? classEvidence.evidence : 'No overlapping classes.'}</p>}</article>; })}</div>{score.conceptualScore === null && <p className="mt-3 rounded border border-border bg-muted p-3 text-sm text-muted-foreground"><strong>Conceptual similarity</strong> — Not supported by this source or methodology.</p>}</section>
  </ChartCard>;
}

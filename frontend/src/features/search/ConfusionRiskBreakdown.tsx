import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RiskScore } from '../../types';
import { AccessibleDataTable, ChartCard } from '../../components/visualization/ChartPrimitives';

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

export function ConfusionRiskBreakdown({ score }: { score: RiskScore }) {
  const data = [
    { name: 'Phonetic similarity', value: finite(score.phoneticScore) },
    { name: 'Visual similarity', value: finite(score.visualScore) },
    { name: 'Nice-class overlap', value: finite(score.classOverlapScore ?? (score.classOverlap ? 100 : 0)) },
  ];
  const evidence = score.matchedMarkRefs ?? [];
  const classEvidence = evidence.find((entry) => entry.type === 'Class');
  return <ChartCard title="Confusion-risk components" description="Each component is scored from 0 to 100; this research aid does not make a legal conclusion.">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="h-56 min-h-56" role="img" aria-label={`Confusion-risk components. ${data.map((entry) => `${entry.name}: ${entry.value} out of 100`).join('. ')}`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7EAEE" /><XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit=" / 100" /><YAxis type="category" dataKey="name" width={142} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => [`${value} / 100`, 'Score']} /><Bar dataKey="value" fill="#146575" isAnimationActive={false} radius={[0, 3, 3, 0]} />
          </BarChart></ResponsiveContainer>
        </div>
        <AccessibleDataTable caption="Confusion-risk component scores" rows={data.map((entry) => ({ label: `${entry.name.replace(' similarity', '')} score`, value: `${entry.value} / 100` }))} />
      </div>
      <aside className="space-y-3 rounded border border-forge-silver-300 bg-surface-base p-4"><p className="text-xs font-bold uppercase text-text-secondary">Composite summary</p><p className="text-lg font-bold text-text-primary">Composite rating: {score.compositeRating[0].toUpperCase() + score.compositeRating.slice(1)} · {finite(score.compositeScore ?? 0)} / 100</p><p className="text-sm text-text-secondary">Methodology: <strong className="text-text-primary">{score.methodology?.version ?? 'Not supplied'}</strong></p><p className="text-sm text-text-secondary">Status: provisional research signal.</p><p className="text-sm text-text-secondary">Conceptual score: <strong className="text-text-primary">{score.conceptualScore === null ? 'Not supported' : `${score.conceptualScore} / 100`}</strong></p><p className="text-sm text-text-secondary">Source attribution: <strong className="break-words text-text-primary">{score.methodology?.sourceAttribution?.join(', ') || 'Source attribution unavailable'}</strong></p></aside>
    </div>
    <section className="mt-6 border-t border-forge-silver-200 pt-4" aria-labelledby="risk-evidence-heading"><h3 id="risk-evidence-heading" className="text-base font-semibold text-text-primary">Evidence</h3><div className="mt-3 grid gap-3 md:grid-cols-3">{['Visual', 'Phonetic', 'Class'].map((kind) => { const item = evidence.find((entry) => entry.type === kind); return <article key={kind} className="rounded border border-forge-silver-300 bg-surface-base p-3"><h4 className="font-semibold text-text-primary">{kind} similarity</h4><p className="mt-1 text-sm text-text-secondary">{item?.evidence ?? (kind === 'Class' ? 'No overlapping classes.' : 'Evidence unavailable.')}</p>{kind === 'Class' && !item && <p className="mt-1 text-xs text-text-secondary">{classEvidence ? classEvidence.evidence : 'No overlapping classes.'}</p>}</article>; })}</div>{score.conceptualScore === null && <p className="mt-3 rounded border border-forge-silver-300 bg-surface-base p-3 text-sm text-text-secondary"><strong>Conceptual similarity</strong> — Not supported by this source or methodology.</p>}</section>
  </ChartCard>;
}

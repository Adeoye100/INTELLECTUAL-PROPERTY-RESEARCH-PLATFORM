import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { listPortfolioMarks } from '../portfolio/portfolioApi';

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Mark}/gu, '').toUpperCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function distance(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cached = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = cached;
    }
  }
  return row[b.length];
}

function visualSimilarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  const maximum = Math.max(a.length, b.length);
  if (!maximum) return 0;
  return Math.max(0, Math.min(100, 100 - Math.round((distance(left, right) / maximum) * 100)));
}

const SOUNDEX_GROUPS: Readonly<Record<string, string>> = Object.freeze({
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3', L: '4', M: '5', N: '5', R: '6',
});

function soundex(token: string) {
  const normalized = normalize(token);
  if (!normalized) return '';
  const first = normalized[0];
  let code = '';
  let previous = SOUNDEX_GROUPS[first] ?? '';
  for (const letter of normalized.slice(1)) {
    const digit = SOUNDEX_GROUPS[letter];
    if (digit) {
      if (digit !== previous) code += digit;
      previous = digit;
    } else if (letter !== 'H' && letter !== 'W') previous = '';
    if (code.length >= 3) break;
  }
  return (first + code).padEnd(4, '0').slice(0, 4);
}

function phoneticSimilarity(left: string, right: string) {
  const leftCodes = normalize(left).split(' ').filter(Boolean).map(soundex);
  const rightCodes = normalize(right).split(' ').filter(Boolean).map(soundex);
  const available = [...rightCodes];
  let matches = 0;
  leftCodes.forEach((code) => {
    const index = available.indexOf(code);
    if (index >= 0) { matches += 1; available.splice(index, 1); }
  });
  return Math.max(leftCodes.length, rightCodes.length) ? Math.round((matches / Math.max(leftCodes.length, rightCodes.length)) * 100) : 0;
}

function classOverlap(left: number[], right: number[]) {
  const union = [...new Set([...left, ...right])];
  const rightSet = new Set(right);
  const intersection = [...new Set(left)].filter((item) => rightSet.has(item));
  return { score: union.length ? Math.round((intersection.length / union.length) * 100) : 0, intersection };
}

export function PreliminaryRiskAnalysisScreen() {
  const portfolio = useQuery({ queryKey: ['portfolio', 'preliminary-risk'], queryFn: () => listPortfolioMarks({ pageSize: 100 }).then((response) => response.items), retry: false });
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const analysis = useMemo(() => {
    if (!submitted || !portfolio.data) return null;
    const left = portfolio.data.find((mark) => mark.id === leftId);
    const right = portfolio.data.find((mark) => mark.id === rightId);
    if (!left || !right || left.id === right.id) return null;
    const visual = visualSimilarity(left.markText, right.markText);
    const phonetic = phoneticSimilarity(left.markText, right.markText);
    const overlap = classOverlap(left.niceClasses, right.niceClasses);
    const composite = Math.round((visual * 0.4) + (phonetic * 0.4) + (overlap.score * 0.2));
    const rating = composite >= 75 ? 'High' : composite >= 50 ? 'Medium' : 'Low';
    return { left, right, visual, phonetic, overlap, composite, rating };
  }, [leftId, rightId, submitted, portfolio.data]);

  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted(true); };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-forge-teal-700">Preliminary engineering signal</p><h1 className="mt-2 text-3xl font-bold text-foreground">Risk Analysis</h1><p className="mt-2 max-w-3xl text-muted-foreground">Compare two saved portfolio marks using the platform&apos;s provisional visual, phonetic and Nice-class methodology.</p></header>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4" role="note"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="font-semibold text-foreground">Preliminary only — not a legal opinion and not a live-registry conflict result.</p><p className="mt-1 text-sm text-muted-foreground">This compares records already stored by your firm. Live Search remains a separate production activation.</p></div></div></div>

      <Card title="Compare saved marks">
        {portfolio.isLoading ? <p role="status">Loading portfolio marks…</p> : portfolio.isError ? <p role="alert" className="text-risk-high">Portfolio marks could not be loaded.</p> : (
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="text-sm font-semibold text-foreground">Protected mark<select required value={leftId} onChange={(event) => { setLeftId(event.target.value); setSubmitted(false); }} className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-foreground"><option value="">Choose a mark</option>{portfolio.data?.map((mark) => <option key={mark.id} value={mark.id}>{mark.markText} · {mark.jurisdiction}</option>)}</select></label>
            <label className="text-sm font-semibold text-foreground">Candidate mark<select required value={rightId} onChange={(event) => { setRightId(event.target.value); setSubmitted(false); }} className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-foreground"><option value="">Choose a different mark</option>{portfolio.data?.filter((mark) => mark.id !== leftId).map((mark) => <option key={mark.id} value={mark.id}>{mark.markText} · {mark.jurisdiction}</option>)}</select></label>
            <Button type="submit" disabled={!leftId || !rightId || leftId === rightId}><Activity className="mr-2 h-4 w-4" aria-hidden="true" />Analyse</Button>
          </form>
        )}
      </Card>

      {analysis && (
        <section className="space-y-4" aria-label="Preliminary risk result">
          <div className="grid gap-4 md:grid-cols-4">
            <Card title="Composite"><p className="text-3xl font-black text-foreground">{analysis.composite}/100</p><p className="mt-1 text-sm font-semibold text-muted-foreground">{analysis.rating} preliminary risk</p></Card>
            <Card title="Visual"><p className="text-3xl font-black text-foreground">{analysis.visual}</p><p className="mt-1 text-xs text-muted-foreground">Normalized edit-distance similarity</p></Card>
            <Card title="Phonetic"><p className="text-3xl font-black text-foreground">{analysis.phonetic}</p><p className="mt-1 text-xs text-muted-foreground">Soundex token similarity</p></Card>
            <Card title="Class overlap"><p className="text-3xl font-black text-foreground">{analysis.overlap.score}</p><p className="mt-1 text-xs text-muted-foreground">Shared: {analysis.overlap.intersection.length ? analysis.overlap.intersection.join(', ') : 'none'}</p></Card>
          </div>
          <Card title="Comparison evidence"><dl className="grid gap-3 text-sm md:grid-cols-2"><div><dt className="font-semibold text-muted-foreground">Protected</dt><dd className="font-mono font-bold uppercase text-foreground">{analysis.left.markText}</dd></div><div><dt className="font-semibold text-muted-foreground">Candidate</dt><dd className="font-mono font-bold uppercase text-foreground">{analysis.right.markText}</dd></div><div><dt className="font-semibold text-muted-foreground">Protected classes</dt><dd>{analysis.left.niceClasses.join(', ') || 'Not recorded'}</dd></div><div><dt className="font-semibold text-muted-foreground">Candidate classes</dt><dd>{analysis.right.niceClasses.join(', ') || 'Not recorded'}</dd></div></dl></Card>
        </section>
      )}
    </div>
  );
}

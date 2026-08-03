import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Scale, FileText, AlertCircle, Shield } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { SearchResult } from '../../types';
import { cn } from '../../lib/utils';
import { 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

export const RiskDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // In a real app, we'd fetch by ID. Here we just get all and find the one.
  const { data: results, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['search'], // reuse cache
    queryFn: async () => {
        const response = await fetch(`/api/search?q=FORGE`);
        return response.json();
    }
  });

  const result = results?.find(r => r.id === id);

  if (isLoading) return <div className="p-8 text-center animate-pulse">Analyzing risk vectors...</div>;
  if (!result || !result.riskScore) return <div className="p-8 text-center">Result not found or source unavailable.</div>;

  const scoreData = [
    { subject: 'Phonetic', A: result.riskScore.phoneticScore, fullMark: 100 },
    { subject: 'Visual', A: result.riskScore.visualScore, fullMark: 100 },
    { subject: 'Class', A: result.riskScore.classOverlap ? 100 : 0, fullMark: 100 },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Confusion Risk Analysis</h1>
          <p className="text-text-secondary text-sm">Detailed comparison and evidence breakdown</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Comparison Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Mark Comparison">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 py-4">
              <div className="text-center md:text-left">
                <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Your Protected Mark</div>
                <div className="text-3xl font-black text-forge-navy-950 uppercase font-mono tracking-tighter">
                  FORGE GLOBAL
                </div>
                <div className="text-xs text-text-secondary mt-1 italic">Jurisdiction: US | Classes: 9, 35, 42</div>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-forge-silver-100 flex items-center justify-center text-forge-navy-950 font-bold">VS</div>
                <div className="h-8 w-px bg-forge-silver-300 mt-2"></div>
              </div>

              <div className="text-center md:text-right">
                <div className="text-[10px] text-text-secondary uppercase font-bold mb-1">Candidate Match</div>
                <div className="text-3xl font-black text-risk-high uppercase font-mono tracking-tighter">
                  {result.candidateMarkText}
                </div>
                <div className="text-xs text-text-secondary mt-1 italic">
                  Source: {result.candidateSource} | Ref: {result.candidateRef}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Supporting Evidence">
            <div className="space-y-4">
              {result.riskScore.matchedMarkRefs.map((ref, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 rounded bg-surface-base border border-forge-silver-300">
                  <div className={cn(
                    "mt-1 p-2 rounded",
                    ref.type === 'Phonetic' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  )}>
                    {ref.type === 'Phonetic' ? <Scale className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-text-primary">{ref.type} Similarity Match</h4>
                    <p className="text-sm text-text-secondary">{ref.evidence}</p>
                    <div className="mt-2 text-xs font-bold uppercase text-forge-teal-700">
                      Confidence Score: {ref.score}%
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/office-actions')}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View Office Action Research (linked precedents)
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Risk Score Summary */}
        <div className="lg:col-span-1 space-y-6">
          <Card title="Risk Summary">
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-8 border-risk-high text-risk-high mb-4">
                <span className="text-2xl font-black">HIGH</span>
              </div>
              <h3 className="text-lg font-bold text-text-primary uppercase tracking-wide">Likelihood of Confusion</h3>
              <p className="text-sm text-text-secondary px-4">
                Based on phonetic similarity and Nice Class overlap, this filing poses a significant threat to your trademark.
              </p>
            </div>
            
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={scoreData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar
                    name="Risk"
                    dataKey="A"
                    stroke="#B3261E"
                    fill="#B3261E"
                    fillOpacity={0.6}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Recommended Actions" className="bg-forge-navy-950 text-white border-none">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded">
                  <AlertCircle className="w-5 h-5 text-forge-subtext-onDark" />
                </div>
                <div>
                  <h4 className="font-bold">File Opposition</h4>
                  <p className="text-xs text-forge-subtext-onDark">Deadline: Sep 12, 2026</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded">
                  <Shield className="w-5 h-5 text-forge-subtext-onDark" />
                </div>
                <div>
                  <h4 className="font-bold">Convert to Watch</h4>
                  <p className="text-xs text-forge-subtext-onDark">Monitor status changes</p>
                </div>
              </div>
              <Button className="w-full bg-forge-teal-600 hover:bg-forge-teal-700">Initiate Legal Review</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
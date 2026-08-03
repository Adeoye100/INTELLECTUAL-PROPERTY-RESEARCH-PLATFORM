import React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Search as SearchIcon, Filter } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { SourceStatusIndicator } from '../../components/SourceStatusIndicator';
import { useQuery } from '@tanstack/react-query';
import type { SearchResponse, SearchResult } from '../../types';
import { Link } from 'react-router-dom';

interface SearchFilters {
  query: string;
  jurisdictions: string[];
  classes: string;
}

export const SearchScreen: React.FC = () => {
  const { register, handleSubmit, control } = useForm<SearchFilters>({
    defaultValues: {
      query: '',
      jurisdictions: ['US'],
      classes: '',
    },
  });

  const queryText = useWatch({ control, name: 'query' });

  const { data: searchResponse, isLoading, isError } = useQuery<SearchResponse>({
    queryKey: ['search', queryText],
    queryFn: async () => {
      if (!queryText) return { results: [], sourceStatuses: [] };
      const response = await fetch(`/api/search?q=${encodeURIComponent(queryText)}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: queryText.length > 2,
  });

  const results = searchResponse?.results;

  const onSubmit = (data: SearchFilters) => {
    console.log('Search filters:', data);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trademark Search</h1>
          <p className="text-text-secondary text-sm">Cross-registry phonetic and visual similarity analysis</p>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Saved Searches
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Search Filters" className="sticky top-24">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Mark Text</label>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-forge-silver-500" />
                  <input
                    {...register('query')}
                    className="w-full pl-9 pr-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-accent outline-none"
                    placeholder="Search mark name..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Jurisdiction</label>
                <div className="space-y-2">
                  {['US', 'EU', 'GB', 'CA', 'AU'].map((j) => (
                    <label key={j} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        value={j}
                        {...register('jurisdictions')}
                        className="rounded text-accent focus:ring-accent"
                      />
                      {j === 'US' ? 'United States (USPTO)' : 
                       j === 'EU' ? 'European Union (EUIPO)' :
                       j === 'GB' ? 'United Kingdom (UKIPO)' :
                       j === 'CA' ? 'Canada (CIPO)' : 'Australia (IP Australia)'}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Nice Classes</label>
                <input
                  {...register('classes')}
                  className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-accent outline-none"
                  placeholder="e.g. 9, 35, 42"
                />
              </div>

              <Button type="submit" className="w-full">Apply Filters</Button>
            </form>
          </Card>
        </div>

        {/* Results Main Area */}
        <div className="lg:col-span-3 space-y-4">
          {!queryText || queryText.length <= 2 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-forge-silver-300 rounded-lg bg-surface-card">
              <SearchIcon className="w-12 h-12 text-forge-silver-300 mb-4" />
              <h3 className="text-lg font-semibold text-text-primary">Ready to Search</h3>
              <p className="text-text-secondary max-w-xs">
                Enter at least 3 characters to begin analyzing trademarks across international registries.
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-forge-silver-100 animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-risk-high bg-risk-high/10 rounded-lg">
              Search encountered an error. Please try again.
            </div>
          ) : (
            <div className="space-y-4">
              <SourceStatusIndicator statuses={searchResponse?.sourceStatuses ?? []} />

              {results?.length === 0 ? (
                <div className="p-12 text-center bg-surface-card rounded-lg border border-forge-silver-300">
                  No direct matches found. Try broadening your filters.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm text-text-secondary px-2">
                    <span>Showing {results?.length} matches for "{queryText}"</span>
                    <span>Sorted by composite risk score</span>
                  </div>

                  {results?.map((result) => (
                    <SearchResultCard key={result.id} result={result} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SearchResultCard: React.FC<{ result: SearchResult }> = ({ result }) => {
  return (
    <Card className="relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-xl font-black tracking-tight text-text-primary uppercase font-mono">
              {result.candidateMarkText}
            </h3>
            {result.riskScore && (
              <Badge risk={result.riskScore.compositeRating}>
                {result.riskScore.compositeRating} RISK
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-text-secondary uppercase">
            <span>{result.candidateSource}</span>
            <span>Ref: <span className="font-mono">{result.candidateRef}</span></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right mr-4 hidden sm:block">
            <div className="text-[10px] text-text-secondary uppercase font-bold">Similarity</div>
            <div className="text-lg font-bold text-text-primary">
              {result.riskScore ? Math.max(result.riskScore.phoneticScore, result.riskScore.visualScore) : 0}%
            </div>
          </div>
          <Link to={`/search/risk/${result.id}`}>
            <Button variant="outline" size="sm">Review Risk</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
};

export interface Facet {
  id: string;
  index: number;
  title: string;
  description: string;
}

// Content contract — six facets, exact capabilities from the PRD.
// Do not add, remove, or rename facets here.
export const FACETS: Facet[] = [
{
  id: 'instant-search',
  index: 0,
  title: 'Instant Search',
  description:
  'Federated search across multiple trademark registries and jurisdictions in one query.'
},
{
  id: 'confusion-risk-analysis',
  index: 1,
  title: 'Confusion Risk Analysis',
  description:
  'Automated similarity scoring — phonetic, visual, and class overlap — with the evidence shown, not a black-box number.'
},
{
  id: 'office-action-research',
  index: 2,
  title: 'Office Action Research',
  description:
  'Search examiner precedent and reasoning for comparable marks and classes.'
},
{
  id: 'portfolio-management',
  index: 3,
  title: 'Portfolio Management',
  description:
  "A firm's or brand's marks tracked in one place, with renewal deadlines flagged."
},
{
  id: 'watch-alerts',
  index: 4,
  title: 'Watch & Alerts',
  description:
  'Continuous monitoring of new filings against saved marks, with alerts on conflicts.'
},
{
  id: 'reporting-export',
  index: 5,
  title: 'Reporting & Export',
  description:
  'Client-ready PDF exports of search results, risk reports, and portfolio summaries.'
}];


export interface StatItem {
  label: string;
  value: string;
  caption: string;
}

// Supporting stat strip. Placeholder figures until real numbers are supplied.
export const STATS: StatItem[] = [
{
  label: 'Jurisdictions covered',
  value: '55+',
  caption: 'Registries indexed worldwide'
},
{
  label: 'Marks under watch',
  value: '2.1M+',
  caption: 'Continuously monitored for conflicts'
},
{
  label: 'Searches per query',
  value: '1',
  caption: 'Federated across every registry at once'
}];
import { http, HttpResponse, delay } from 'msw';
import type { Alert, DashboardSummary, SearchResponse, SearchResult, OfficeActionRef, PortfolioAttachment, PortfolioMark, PortfolioMarkDetail, Matter, MatterSaveRequest, MatterSaveResult, WatchSummary, WatchUpsertRequest } from '../../types';

const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    searchId: 's1',
    candidateMarkText: 'FORGE TEK',
    candidateSource: 'USPTO',
    candidateRef: 'US87654321',
    owner: 'Forge Technologies Inc.',
    niceClasses: [9, 42],
    jurisdiction: 'US',
    filingDate: '2025-02-14',
    status: 'pending',
    riskScore: {
      id: 'r1',
      phoneticScore: 85,
      visualScore: 40,
      conceptualScore: 72,
      classOverlap: true,
      compositeRating: 'high',
      methodology: {
        version: 'v2.1.0',
        description: 'Weighted composite of phonetic (Soundex/Double Metaphone), visual (Levenshtein edit distance), conceptual (word-vector cosine), and Nice class overlap.',
        sourceAttribution: ['USPTO TESS', 'EUIPO TMview'],
      },
      matchedMarkRefs: [
        {
          type: 'Phonetic',
          evidence: 'Double Metaphone encoding identical: FRKTK — "FORGE" and "FORGETEK" share the dominant FORGE phoneme with near-identical stress pattern.',
          score: 85,
        },
        {
          type: 'Visual',
          evidence: 'Levenshtein edit distance of 4 on 10-character base. Shared uppercase FORGE prefix dominates visual impression.',
          score: 70,
        },
        {
          type: 'Conceptual',
          evidence: 'Word-vector cosine similarity 0.72 — both marks evoke industrial craftsmanship and technology concepts.',
          score: 72,
        },
        {
          type: 'Class',
          evidence: 'Direct overlap in Nice Class 9 (electronics/software). Applicant also filed in Class 42 which further overlaps your registrations.',
          score: 100,
        },
      ],
    },
  },
  {
    id: '2',
    searchId: 's1',
    candidateMarkText: 'FORTRESS GLOBAL',
    candidateSource: 'EUIPO',
    candidateRef: 'EU12345678',
    owner: 'Fortress Global GmbH',
    niceClasses: [35],
    jurisdiction: 'EU',
    filingDate: '2024-09-03',
    status: 'registered',
    riskScore: {
      id: 'r2',
      phoneticScore: 30,
      visualScore: 60,
      // null = conceptual scoring unsupported for EUIPO source in this methodology version
      conceptualScore: null,
      classOverlap: false,
      compositeRating: 'medium',
      methodology: {
        version: 'v2.1.0',
        description: 'Weighted composite of phonetic (Soundex/Double Metaphone), visual (Levenshtein edit distance), conceptual (word-vector cosine), and Nice class overlap.',
        sourceAttribution: ['EUIPO TMview'],
      },
      matchedMarkRefs: [
        {
          type: 'Visual',
          evidence: 'Shared word structure: [ADJECTIVE] GLOBAL mirrors [MARK] GLOBAL. Visual impression elevated by identical secondary element "GLOBAL".',
          score: 60,
        },
        {
          type: 'Phonetic',
          evidence: '"FORTRESS" and "FORGE" share the initial FOR- phoneme and 4-character overlap but diverge strongly at the third syllable. Modest risk.',
          score: 30,
        },
      ],
    },
  },
  {
    id: '3',
    searchId: 's1',
    candidateMarkText: 'THE FORGE HOUSE',
    candidateSource: 'UKIPO',
    candidateRef: 'GB00998877',
    owner: 'Forge House Limited',
    niceClasses: [35, 41],
    jurisdiction: 'GB',
    filingDate: '2023-05-18',
    status: 'Abandoned',
    riskScore: {
      id: 'r3',
      phoneticScore: 25,
      visualScore: 35,
      conceptualScore: 20,
      classOverlap: false,
      compositeRating: 'low',
      methodology: {
        version: 'v2.1.0',
        description: 'Mock low-risk aggregate used for ranked-result testing.',
        sourceAttribution: ['UKIPO'],
      },
      matchedMarkRefs: [{ type: 'Visual', evidence: 'Shared FORGE term only', score: 35 }],
    },
  },
];

export const mockSearchResponse: SearchResponse = {
  results: mockSearchResults,
  sourceStatuses: [
    { source: 'USPTO', status: 'complete', resultCount: 1 },
    { source: 'EUIPO', status: 'pending', resultCount: 1 },
    { source: 'UKIPO', status: 'delayed', resultCount: 1 },
    { source: 'WIPO', status: 'unavailable', resultCount: 0 },
  ],
  partial: true,
  requestId: 'mock-search-request',
};

export const mockDashboardSummary: DashboardSummary = {
  activeWatches: 12,
  portfolioHealthPercent: 94,
  portfolioMarkCount: 24,
  recentAlerts: [
    { id: 'a-high', matchedMarkText: 'FORGE LABS', protectedMarkText: 'FORGE GLOBAL', candidateRef: 'US99887766', jurisdiction: 'US', riskLevel: 'high', detectedAt: '2026-08-04', resolved: false },
    { id: 'a-medium', matchedMarkText: 'FORTRESS GLOBAL', protectedMarkText: 'FORGE GLOBAL', candidateRef: 'EU12345678', jurisdiction: 'EU', riskLevel: 'medium', detectedAt: '2026-08-03', resolved: false },
    { id: 'a-resolved', matchedMarkText: 'FORGE HOUSE', protectedMarkText: 'FORGE GLOBAL', candidateRef: 'GB00998877', jurisdiction: 'GB', riskLevel: 'high', detectedAt: '2026-08-01', resolved: true },
  ],
  recentSearches: [
    { id: 's1', mark: 'FORGE', jurisdictions: ['US', 'EU'], resultCount: 18, highRiskCount: 3, searchedAt: '2026-08-04' },
    { id: 's2', mark: 'INNOVATE PRO', jurisdictions: ['US'], resultCount: 7, highRiskCount: 0, searchedAt: '2026-08-02' },
  ],
  searchActivity: [
    { label: 'Mon', count: 4 }, { label: 'Tue', count: 7 }, { label: 'Wed', count: 5 },
    { label: 'Thu', count: 12 }, { label: 'Fri', count: 9 }, { label: 'Sat', count: 2 }, { label: 'Sun', count: 3 },
  ],
  riskDistribution: [
    { risk: 'high', count: 4 }, { risk: 'medium', count: 8 }, { risk: 'low', count: 12 },
  ],
  partial: false,
  unavailableSections: [],
};

const mockOfficeActionRefs: OfficeActionRef[] = [
  {
    id: 'oa1',
    portfolioMarkId: null,
    referenceText: 'FORGE INNOVATIONS vs. FORGE TECH - Phonetic similarity analysis',
    examinerReasoningSummary: 'Examiner determined that FORGE TECH creates likelihood of confusion with FORGE INNOVATIONS due to identical sound pattern and overlapping Class 9 services. The shared "FORGE" element dominates both marks.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa2',
    portfolioMarkId: 'p1',
    referenceText: 'GLOBAL SYSTEMS vs. FORGE GLOBAL - Visual and conceptual analysis',
    examinerReasoningSummary: 'Despite shared "GLOBAL" element, examiner found no likelihood of confusion due to different dominant elements and distinct commercial impressions. FORGE creates stronger brand identity than descriptive GLOBAL.',
    linkedPrecedentRef: 'US87654321',
  },
  {
    id: 'oa3',
    portfolioMarkId: null,
    referenceText: 'METALFORGE vs. FORGE STEEL - Class 9 electronics overlap',
    examinerReasoningSummary: 'Compound marks containing FORGE in Class 9 electronics. Examiner cited likelihood of confusion based on shared FORGE element and identical Nice classification, despite different secondary elements.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa4',
    portfolioMarkId: null,
    referenceText: 'DIGITAL FORGE vs. FORGE DIGITAL - Transposition analysis',
    examinerReasoningSummary: 'Examiner found transposition of identical elements (DIGITAL + FORGE) creates confusingly similar commercial impression in Class 42 computer services. Order of elements insufficient to avoid confusion.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa5',
    portfolioMarkId: null,
    referenceText: 'FORGE & CO vs. FORGE VENTURES - Class 35 business services',
    examinerReasoningSummary: 'Shared FORGE element in Class 35 business services creates likelihood of confusion. Examiner noted that additional descriptive elements (& CO, VENTURES) do not distinguish the core FORGE identity.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa6',
    portfolioMarkId: null,
    referenceText: 'FORGE LABS vs. LABORATORY FORGE - Scientific services Class 42',
    examinerReasoningSummary: 'Despite different word order, examiner found FORGE + laboratory concept creates confusingly similar impression in Class 42 scientific research services. Shared conceptual framework of innovation/development.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa7',
    portfolioMarkId: null,
    referenceText: 'FORGE MEDIA vs. FORGE CONTENT - Class 41 media services',
    examinerReasoningSummary: 'Examiner determined identical FORGE element with related media/content concepts in Class 41 creates likelihood of confusion. Both marks target same consumer base for digital media services.',
    linkedPrecedentRef: null,
  },
  {
    id: 'oa8',
    portfolioMarkId: null,
    referenceText: 'FORGE STUDIO vs. CREATIVE FORGE - Class 42 design services',
    examinerReasoningSummary: 'Shared FORGE element in creative/design services (Class 42). Examiner found that both marks convey concept of creative craftsmanship, leading to consumer confusion in marketplace.',
    linkedPrecedentRef: null,
  },
];

const mockPortfolioMarks = [
  {
    id: 'p1',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'FORGE GLOBAL',
    jurisdiction: 'US',
    niceClasses: [9, 35, 42],
    status: 'registered',
    filingDate: '2022-01-15',
    renewalDate: '2032-01-15',
    sourceRegistry: 'USPTO',
    mocked: true,
  },
  {
    id: 'p2',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'INNOVATE PRO',
    jurisdiction: 'US',
    niceClasses: [42],
    status: 'pending',
    filingDate: '2024-03-10',
    renewalDate: '2026-08-25',
    sourceRegistry: 'USPTO',
    mocked: true,
  },
  {
    id: 'p3',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'TECHSUITE',
    jurisdiction: 'EU',
    niceClasses: [9, 35],
    status: 'registered',
    filingDate: '2021-08-22',
    renewalDate: '2026-07-20',
    sourceRegistry: 'EUIPO',
    mocked: true,
  },
].map((mark) => ({ ...mark, registryReference: "MOCK-" + mark.id, registrationDate: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" })) as PortfolioMark[];

const mockPortfolioDetails: Record<string, PortfolioMarkDetail> = Object.fromEntries(mockPortfolioMarks.map((mark) => [mark.id, {
  ...mark,
  statusHistory: [
    { id: `${mark.id}-history-filed`, status: 'Filed', effectiveAt: mark.filingDate, source: mark.sourceRegistry, note: 'Application received by registry.' },
    { id: `${mark.id}-history-current`, status: mark.status, effectiveAt: mark.status === 'pending' ? mark.filingDate : '2023-05-18', source: mark.sourceRegistry, note: 'Current mock registry status.' },
  ],
}])) as Record<string, PortfolioMarkDetail>;

const mockAttachments: Record<string, PortfolioAttachment[]> = {
  p1: [
    { id: 'attachment-registration', portfolioMarkId: 'p1', fileName: 'registration-certificate.pdf', contentType: 'application/pdf', uploadedAt: '2023-05-18', availability: 'available', mocked: true },
    { id: 'attachment-failed', portfolioMarkId: 'p1', fileName: 'assignment-record.pdf', contentType: 'application/pdf', uploadedAt: '2025-01-09', availability: 'available', mocked: true },
  ],
  p2: [],
};

const mockWatches: WatchSummary[] = [
  { id: 'w1', portfolioMarkId: 'p1', userId: 'u1', alertChannel: 'email', alertMode: 'real-time', active: true, markText: 'FORGE GLOBAL', jurisdiction: 'US', mocked: true },
];

const mockAlerts: Alert[] = [
  {
    id: 'a-newest', watchId: 'w1', matchedFilingRef: 'US99887766', riskScoreId: 'r1', riskResultId: '1', read: false,
    createdAt: '2026-08-04T14:35:00.000Z', matchedMarkText: 'FORGE LABS', protectedMarkText: 'FORGE GLOBAL',
    severity: 'high', source: 'USPTO', supportingEvidence: ['92% phonetic similarity', 'Nice Class 42 overlap'], mocked: true,
    riskScore: mockSearchResults[0].riskScore,
  },
  {
    id: 'a-older', watchId: 'w1', matchedFilingRef: 'EU12345678', riskScoreId: 'r2', riskResultId: '2', read: true,
    createdAt: '2026-08-02T09:15:00.000Z', matchedMarkText: 'FORTRESS GLOBAL', protectedMarkText: 'FORGE GLOBAL',
    severity: 'medium', source: 'EUIPO', supportingEvidence: ['60% visual similarity', 'Shared GLOBAL element'], mocked: true,
    riskScore: mockSearchResults[1].riskScore,
  },
  {
    id: 'a-middle', watchId: 'w1', matchedFilingRef: 'GB00998877', riskScoreId: 'r3', riskResultId: '3', read: false,
    createdAt: '2026-08-03T18:05:00.000Z', matchedMarkText: 'THE FORGE HOUSE', protectedMarkText: 'FORGE GLOBAL',
    severity: 'low', source: 'UKIPO', supportingEvidence: ['35% visual similarity', 'No class overlap'], mocked: true,
    riskScore: mockSearchResults[2].riskScore,
  },
];

// ---------------------------------------------------------------------------
// MOCK-ONLY: Matter fixtures — FE-12
// These fixtures exist only for frontend development while the backend
// /api/v1/matters endpoint has not been implemented. They must not be used as
// production data or presented as server-persisted state.
// ---------------------------------------------------------------------------
const mockMatters: Matter[] = [
  {
    id: 'matter-mock-1',
    name: 'Q3 Clearance — FORGE GLOBAL',
    clientRef: 'FG-2026-Q3',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
    savedResultIds: [],
  },
  {
    id: 'matter-mock-2',
    name: 'Portfolio Audit 2026',
    clientRef: 'FG-2026-AUDIT',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString(),
    savedResultIds: ['1'],
  },
  {
    id: 'matter-mock-3',
    name: 'EU Expansion Clearance',
    clientRef: 'FG-2026-EU',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1_000).toISOString(),
    savedResultIds: [],
  },
];

// ---------------------------------------------------------------------------
// Auth scenario counters — FE-06/auth. MOCK-ONLY.
// ---------------------------------------------------------------------------
const mockAttemptCounts = new Map<string, number>();
const failFirstMockAttempt = (key: string) => {
  const attempts = mockAttemptCounts.get(key) ?? 0;
  mockAttemptCounts.set(key, attempts + 1);
  return attempts === 0;
};

const mockAuthError = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message, mocked: true }, { status });

export const handlers = [
  http.post('/api/v1/provisioning/firm', async () => {
    await delay(400);
    return HttpResponse.json({
      user: { id: 'mock-user', firmId: 'mock-firm', email: 'mock@example.test', role: 'admin' },
      firm: { id: 'mock-firm', name: 'Mock Firm', subscriptionTier: 'free' },
      mocked: true,
    }, { status: 201 });
  }),

  http.get('/api/v1/auth/invitations/:token', async ({ params }) => {
    const token = String(params.token);
    if (token === 'network-retry' && failFirstMockAttempt('invite:network-retry')) return HttpResponse.error();
    if (token === 'network') return HttpResponse.error();
    if (token === 'expired') return mockAuthError(410, 'EXPIRED_LINK', 'The invitation has expired.');
    if (token === 'seat-limit') return mockAuthError(409, 'SEAT_LIMIT', 'No licensed seats remain.');
    if (token === 'duplicate') return mockAuthError(409, 'DUPLICATE_ACCOUNT', 'This email already has an account.');
    if (token === 'forbidden') return mockAuthError(403, 'PERMISSION_DENIED', 'This invitation is not available to the current user.');
    await delay(250);
    return HttpResponse.json({
      email: `${token}@invite.example`,
      firmName: 'Forge Legal Partners',
      role: token.startsWith('viewer') ? 'viewer' : token.startsWith('admin') ? 'admin' : 'attorney',
      mocked: true,
    });
  }),

  http.post('/api/v1/auth/invitations/:token/accept', async ({ params, request }) => {
    const token = String(params.token);
    const body = await request.json() as { fullName?: string };
    if (token === 'expired') return mockAuthError(410, 'EXPIRED_LINK', 'The invitation expired before acceptance.');
    if (token === 'seat-limit') return mockAuthError(409, 'SEAT_LIMIT', 'No licensed seats remain.');
    const role = token.startsWith('viewer') ? 'viewer' : token.startsWith('admin') ? 'admin' : 'attorney';
    await delay(350);
    return HttpResponse.json({
      token: 'mock-invitation-session',
      expiresAt: Date.now() + 60 * 60 * 1_000,
      user: {
        id: `invited-${token}`,
        email: `${token}@invite.example`,
        fullName: body.fullName ?? 'Invited User',
        role,
        emailVerified: true,
        onboardingRequired: true,
      },
      mocked: true,
    });
  }),

  http.get('/api/v1/search', async ({ request }) => {
    const url = new URL(request.url);
    const resultId = url.searchParams.get('resultId');
    const mark = url.searchParams.get('mark')?.toLowerCase() ?? '';
    const requestedJurisdictions = url.searchParams.getAll('jurisdiction');
    const requestedClasses = (url.searchParams.get('class') ?? '').split(',').filter(Boolean).map(Number);
    const status = url.searchParams.get('status')?.toLowerCase() ?? '';
    const owner = url.searchParams.get('owner')?.toLowerCase() ?? '';
    const filedFrom = url.searchParams.get('filedFrom') ?? '';
    const filedTo = url.searchParams.get('filedTo') ?? '';

    await delay(700);
    if (resultId) {
      const result = mockSearchResults.find(({ id }) => id === resultId);
      return HttpResponse.json<SearchResponse>({
        results: result ? [result] : [],
        sourceStatuses: result ? [{ source: result.candidateSource, status: 'complete', resultCount: 1 }] : [],
        partial: false,
        requestId: `mock-result-${resultId}`,
      }, { headers: { 'X-Mock-Response': 'true' } });
    }
    if (mark === 'error') return HttpResponse.json({ message: 'Mock search failure' }, { status: 503 });
    if (mark === 'outage') return HttpResponse.json<SearchResponse>({
      results: [],
      sourceStatuses: ['USPTO', 'EUIPO', 'UKIPO', 'WIPO'].map((source) => ({ source, status: 'unavailable' as const, resultCount: 0 })),
      partial: true,
      requestId: 'mock-outage',
    });

    const filtered = mockSearchResults.filter((result) => {
      if (mark && !result.candidateMarkText.toLowerCase().includes(mark)) return false;
      if (requestedJurisdictions.length && !requestedJurisdictions.includes(result.jurisdiction)) return false;
      if (requestedClasses.length && !requestedClasses.some((niceClass) => result.niceClasses.includes(niceClass))) return false;
      if (status && result.status.toLowerCase() !== status) return false;
      if (owner && !result.owner.toLowerCase().includes(owner)) return false;
      if (filedFrom && result.filingDate < filedFrom) return false;
      if (filedTo && result.filingDate > filedTo) return false;
      return true;
    });

    const requestKey = url.searchParams.toString();
    const firstArrival = failFirstMockAttempt(`search:${requestKey}`);
    const arrivedResults = firstArrival ? filtered.filter(({ candidateSource }) => candidateSource === 'USPTO') : filtered;
    const sourceStatuses = firstArrival
      ? [
          { source: 'USPTO', status: 'complete' as const, resultCount: arrivedResults.length },
          { source: 'EUIPO', status: 'pending' as const },
          { source: 'UKIPO', status: 'delayed' as const },
          { source: 'WIPO', status: 'unavailable' as const, resultCount: 0 },
        ]
      : [
          { source: 'USPTO', status: 'complete' as const, resultCount: filtered.filter((result) => result.candidateSource === 'USPTO').length },
          { source: 'EUIPO', status: 'complete' as const, resultCount: filtered.filter((result) => result.candidateSource === 'EUIPO').length },
          { source: 'UKIPO', status: 'complete' as const, resultCount: filtered.filter((result) => result.candidateSource === 'UKIPO').length },
          { source: 'WIPO', status: 'unavailable' as const, resultCount: 0 },
        ];

    return HttpResponse.json<SearchResponse>({
      results: arrivedResults,
      sourceStatuses,
      partial: sourceStatuses.some(({ status: sourceStatus }) => sourceStatus !== 'complete'),
      requestId: `mock-${Date.now()}`,
    });
  }),

  // MOCK dashboard lifecycle scenarios. Append ?scenario=empty|partial|error
  // while exercising frontend states; replace with an authenticated aggregate API.
  http.get('/api/v1/dashboard/summary', async ({ request }) => {
    const scenario = new URL(request.url).searchParams.get('scenario');
    await delay(500);
    if (scenario === 'error') return HttpResponse.json({ message: 'Mock dashboard failure' }, { status: 503 });
    if (scenario === 'empty') return HttpResponse.json<DashboardSummary>({
      activeWatches: 0,
      portfolioHealthPercent: 0,
      portfolioMarkCount: 0,
      recentAlerts: [],
      recentSearches: [],
      searchActivity: [],
      riskDistribution: [],
      partial: false,
      unavailableSections: [],
    });
    if (scenario === 'partial') return HttpResponse.json<DashboardSummary>({
      ...mockDashboardSummary,
      partial: true,
      unavailableSections: ['EUIPO alerts', 'portfolio renewal aggregate'],
    });
    return HttpResponse.json(mockDashboardSummary);
  }),

  http.get('/api/v1/portfolio', async () => {
    await delay(500);
    return HttpResponse.json(mockPortfolioMarks, { headers: { 'X-Mock-Response': 'true' } });
  }),

  // MOCK FE-14 detail and document endpoints. Real object storage download
  // authorization and portfolio tenancy checks remain backend-blocked.
  http.get('/api/v1/portfolio/:markId', async ({ params }) => {
    await delay(300);
    const detail = mockPortfolioDetails[String(params.markId)];
    if (!detail) return HttpResponse.json({ message: 'Mark not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    return HttpResponse.json(detail, { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.get('/api/v1/portfolio/:markId/attachments', async ({ params }) => {
    await delay(350);
    const markId = String(params.markId);
    if (markId === 'p3') return HttpResponse.json({ message: 'Mock document storage unavailable', mocked: true }, { status: 503, headers: { 'X-Mock-Response': 'true' } });
    return HttpResponse.json(mockAttachments[markId] ?? [], { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.get('/api/v1/portfolio/:markId/attachments/:attachmentId/download', async ({ params }) => {
    await delay(250);
    if (String(params.attachmentId) === 'attachment-failed') return HttpResponse.json({ message: 'Mock download failure', mocked: true }, { status: 503, headers: { 'X-Mock-Response': 'true' } });
    return HttpResponse.json({ downloadUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSBtb2NrIHBvcnRmb2xpbyBhdHRhY2htZW50Cg==', fileName: 'registration-certificate.pdf', mocked: true }, { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.post('/api/v1/portfolio', async ({ request }) => {
    const body = await request.json() as {
      markText: string;
      jurisdiction: string;
      niceClasses: number[];
      renewalDate: string;
    };
    await delay(400);
    return HttpResponse.json<PortfolioMark>({
      id: `mock-${Date.now()}`,
      firmId: 'f1',
      ownerUserId: 'u1',
      markText: body.markText,
      jurisdiction: body.jurisdiction,
      niceClasses: body.niceClasses,
      status: 'pending',
      filingDate: new Date().toISOString().slice(0, 10),
      renewalDate: body.renewalDate,
      sourceRegistry: 'Manual entry (mock)',
      registryReference: 'MOCK-MANUAL',
      registrationDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, { status: 201, headers: { 'X-Mock-Response': 'true' } });
  }),

  http.post('/api/v1/portfolio/import', async ({ request }) => {
    const body = await request.json() as { searchResultId?: string };
    const result = mockSearchResults.find(({ id }) => id === body.searchResultId);
    if (!result) return HttpResponse.json({ message: 'Search result not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    await delay(300);
    const created: PortfolioMark = {
      id: `portfolio-import-${result.id}`,
      firmId: 'f1', ownerUserId: 'u1', markText: result.candidateMarkText, jurisdiction: result.jurisdiction,
      niceClasses: result.niceClasses, status: 'pending', filingDate: result.filingDate,
      renewalDate: result.filingDate.replace(/^\d{4}/, String(Number(result.filingDate.slice(0, 4)) + 10)),
      sourceRegistry: 'MOCK SEARCH IMPORT', registryReference: 'MOCK-IMPORT', registrationDate: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    if (!mockPortfolioMarks.some(({ id }) => id === created.id)) mockPortfolioMarks.push(created);
    return HttpResponse.json(created, { status: 201, headers: { 'X-Mock-Response': 'true' } });
  }),

  http.post('/api/v1/portfolio/:markId/watch', async ({ params, request }) => {
    const mark = mockPortfolioMarks.find(({ id }) => id === String(params.markId));
    if (!mark) return HttpResponse.json({ message: 'Mark not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    const body = await request.json() as Omit<WatchUpsertRequest, 'portfolioMarkId'>;
    const existing = mockWatches.find(({ portfolioMarkId }) => portfolioMarkId === mark.id);
    if (existing) return HttpResponse.json(existing, { headers: { 'X-Mock-Response': 'true' } });
    const created: WatchSummary = { id: `watch-mock-${Date.now()}`, portfolioMarkId: mark.id, userId: 'u1', alertChannel: body.alertChannel, alertMode: body.alertMode, active: body.active, markText: mark.markText, jurisdiction: mark.jurisdiction, mocked: true };
    mockWatches.push(created);
    return HttpResponse.json(created, { status: 201, headers: { 'X-Mock-Response': 'true' } });
  }),

  http.get('/api/v1/watches', async () => {
    await delay(600);
    return HttpResponse.json(mockWatches, { headers: { 'X-Mock-Response': 'true' } });
  }),

  // MOCK FE-15 watch mutations. Server-side tenant/role authorization and
  // registry scheduling remain required; SMS is deliberately rejected.
  http.post('/api/v1/watches', async ({ request }) => {
    const body = await request.json() as WatchUpsertRequest;
    if (!['email', 'in-app'].includes(body.alertChannel) || !['real-time', 'digest'].includes(body.alertMode) || !body.portfolioMarkId) return HttpResponse.json({ message: 'Invalid mock watch configuration', mocked: true }, { status: 422, headers: { 'X-Mock-Response': 'true' } });
    const mark = mockPortfolioMarks.find(({ id }) => id === body.portfolioMarkId);
    if (!mark) return HttpResponse.json({ message: 'Portfolio mark not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    const created: WatchSummary = { ...body, id: `watch-mock-${Date.now()}`, userId: 'u1', markText: mark.markText, jurisdiction: mark.jurisdiction, mocked: true };
    mockWatches.push(created);
    return HttpResponse.json(created, { status: 201, headers: { 'X-Mock-Response': 'true' } });
  }),

  http.patch('/api/v1/watches/:watchId', async ({ params, request }) => {
    const index = mockWatches.findIndex(({ id }) => id === String(params.watchId));
    if (index < 0) return HttpResponse.json({ message: 'Watch not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    const body = await request.json() as WatchUpsertRequest;
    const mark = mockPortfolioMarks.find(({ id }) => id === body.portfolioMarkId);
    mockWatches[index] = { ...mockWatches[index], ...body, markText: mark?.markText ?? mockWatches[index].markText, jurisdiction: mark?.jurisdiction ?? mockWatches[index].jurisdiction, mocked: true };
    return HttpResponse.json(mockWatches[index], { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.get('/api/v1/alerts', async ({ request }) => {
    await delay(700);
    const params = new URL(request.url).searchParams;
    const readState = params.get('read');
    const severity = params.get('severity');
    const source = params.get('source');
    const dateFrom = params.get('dateFrom');
    const dateTo = params.get('dateTo');
    const filtered = mockAlerts.filter((alert) => {
      if (readState === 'read' && !alert.read) return false;
      if (readState === 'unread' && alert.read) return false;
      if (severity && alert.severity !== severity) return false;
      if (source && alert.source !== source) return false;
      if (dateFrom && alert.createdAt < `${dateFrom}T00:00:00.000Z`) return false;
      if (dateTo && alert.createdAt > `${dateTo}T23:59:59.999Z`) return false;
      return true;
    });
    return HttpResponse.json(filtered, { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.patch('/api/v1/alerts/:alertId', async ({ params, request }) => {
    const index = mockAlerts.findIndex(({ id }) => id === String(params.alertId));
    if (index < 0) return HttpResponse.json({ message: 'Alert not found', mocked: true }, { status: 404, headers: { 'X-Mock-Response': 'true' } });
    const body = await request.json() as { read?: boolean };
    mockAlerts[index] = { ...mockAlerts[index], read: body.read ?? mockAlerts[index].read };
    return HttpResponse.json(mockAlerts[index], { headers: { 'X-Mock-Response': 'true' } });
  }),

  http.get('/api/v1/office-actions/search', async ({ request }) => {
    const url = new URL(request.url);
    const markText = url.searchParams.get('markText') || '';
    const niceClass = url.searchParams.get('niceClass') || '';

    await delay(800);

    let filteredResults = mockOfficeActionRefs;

    if (markText) {
      filteredResults = filteredResults.filter(oa =>
        oa.referenceText.toLowerCase().includes(markText.toLowerCase()) ||
        oa.examinerReasoningSummary.toLowerCase().includes(markText.toLowerCase())
      );
    }

    if (niceClass) {
      filteredResults = filteredResults.filter(oa =>
        oa.referenceText.includes(`Class ${niceClass}`) ||
        oa.examinerReasoningSummary.includes(`Class ${niceClass}`)
      );
    }

    return HttpResponse.json(filteredResults);
  }),

  http.post('/api/v1/office-actions/link', async ({ request }) => {
    const body = await request.json() as {
      officeActionId: string;
      portfolioMarkId: string;
    };

    await delay(500);

    return HttpResponse.json({
      success: true,
      message: 'Office action successfully linked to portfolio mark',
      linkedOfficeActionId: body.officeActionId,
      linkedPortfolioMarkId: body.portfolioMarkId,
    });
  }),

  // ---------------------------------------------------------------------------
  // MOCK-ONLY: Matter endpoints — FE-12
  // Replace with real API calls once the backend /api/v1/matters endpoint ships.
  // These handlers return mocked: true to make the mock-only state explicit.
  // ---------------------------------------------------------------------------

  http.get('/api/v1/matters', async () => {
    await delay(400);
    return HttpResponse.json<Matter[]>(mockMatters);
  }),

  http.post('/api/v1/matters', async ({ request }) => {
    const body = await request.json() as { name: string; clientRef?: string };
    if (!body.name?.trim()) {
      return HttpResponse.json({ message: 'name is required' }, { status: 422 });
    }
    await delay(350);
    const newMatter: Matter = {
      id: `matter-mock-${Date.now()}`,
      name: body.name.trim(),
      clientRef: body.clientRef?.trim() ?? '',
      createdAt: new Date().toISOString(),
      savedResultIds: [],
    };
    mockMatters.push(newMatter);
    return HttpResponse.json<Matter & { mocked: true }>({ ...newMatter, mocked: true }, { status: 201 });
  }),

  http.post('/api/v1/matters/:matterId/risk-results', async ({ params, request }) => {
    const matterId = String(params.matterId);
    const body = await request.json() as MatterSaveRequest;

    await delay(500);

    const matter = mockMatters.find((m) => m.id === matterId);
    if (!matter) {
      return HttpResponse.json({ message: `Matter ${matterId} not found` }, { status: 404 });
    }
    if (!matter.savedResultIds.includes(body.resultId)) {
      matter.savedResultIds = [...matter.savedResultIds, body.resultId];
    }

    const result: MatterSaveResult = { matter, created: false, mocked: true };
    return HttpResponse.json(result, { status: 200 });
  }),

  // TEMPORARY FE-17 FALLBACK: remove once authenticated server-generated PDF endpoint is available.
  http.post('/api/v1/reports/pdf', async ({ request }) => {
    const body = await request.json() as {
      reportType?: 'search-results' | 'risk-detail' | 'portfolio-summary';
      context?: { screen?: string };
    };
    const expectedScreens = {
      'search-results': 'search-results',
      'risk-detail': 'risk-detail',
      'portfolio-summary': 'portfolio',
    } as const;

    if (!body.reportType || !body.context || expectedScreens[body.reportType] !== body.context.screen) {
      return HttpResponse.json({ message: 'Invalid report type or screen context' }, { status: 400 });
    }

    await delay(600);
    const fileName = `forge-${body.reportType}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new HttpResponse('%PDF-1.4\n% mock PDF fixture\n%%EOF', {
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': 'application/pdf',
        'X-Mock-Response': 'true',
      },
    });
  }),
];

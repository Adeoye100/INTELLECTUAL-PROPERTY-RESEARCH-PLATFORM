import { http, HttpResponse, delay } from 'msw';
import type { DashboardSummary, SearchResponse, SearchResult, OfficeActionRef, PortfolioMark, Matter, MatterSaveRequest, MatterSaveResult } from '../../types';

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
    status: 'Pending',
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
    status: 'Registered',
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

const mockPortfolioMarks: PortfolioMark[] = [
  {
    id: 'p1',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'FORGE GLOBAL',
    jurisdiction: 'US',
    niceClasses: [9, 35, 42],
    status: 'Registered',
    filingDate: '2022-01-15',
    renewalDate: '2032-01-15',
    sourceRegistry: 'USPTO',
  },
  {
    id: 'p2',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'INNOVATE PRO',
    jurisdiction: 'US',
    niceClasses: [42],
    status: 'Pending',
    filingDate: '2024-03-10',
    renewalDate: '2034-03-10',
    sourceRegistry: 'USPTO',
  },
  {
    id: 'p3',
    firmId: 'f1',
    ownerUserId: 'u1',
    markText: 'TECHSUITE',
    jurisdiction: 'EU',
    niceClasses: [9, 35],
    status: 'Registered',
    filingDate: '2021-08-22',
    renewalDate: '2031-08-22',
    sourceRegistry: 'EUIPO',
  },
];

// ---------------------------------------------------------------------------
// MOCK-ONLY: Matter fixtures — FE-12
// These fixtures exist only for frontend development while the backend
// /api/matters endpoint has not been implemented. They must not be used as
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
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email?: string };
    const email = body.email?.toLowerCase() ?? '';
    if (email.startsWith('retry') && failFirstMockAttempt(`login:${email}`)) return HttpResponse.error();
    if (email.startsWith('network')) return HttpResponse.error();
    if (email.startsWith('unverified')) return mockAuthError(403, 'EMAIL_NOT_VERIFIED', 'Email verification is required.');
    if (email.startsWith('denied')) return mockAuthError(403, 'PERMISSION_DENIED', 'This account cannot access the requested firm.');

    const role = email.startsWith('admin')
      ? 'admin'
      : email.startsWith('viewer')
        ? 'viewer'
        : 'attorney';
    await delay(800);
    return HttpResponse.json({
      token: 'mock-token',
      expiresAt: email.startsWith('short-session') ? Date.now() + 500 : Date.now() + 60 * 60 * 1_000,
      user: {
        id: 'u1',
        email: body.email ?? 'attorney@forgeglobal.com',
        role,
        fullName: role === 'admin' ? 'Jane Smith' : role === 'viewer' ? 'Robert Ross' : 'John Doe',
        emailVerified: true,
        onboardingRequired: email.includes('new'),
      },
    });
  }),

  http.post('/api/auth/logout', async () => {
    await delay(150);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/auth/signup', async ({ request }) => {
    const body = await request.json() as { email?: string };
    const email = body.email?.toLowerCase() ?? '';
    if (email.startsWith('existing')) return mockAuthError(409, 'DUPLICATE_ACCOUNT', 'An account already exists.');
    if (email.startsWith('network')) return HttpResponse.error();
    await delay(400);
    return HttpResponse.json({ accepted: true, verificationRequired: true, mocked: true }, { status: 202 });
  }),

  http.get('/api/auth/invitations/:token', async ({ params }) => {
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

  http.post('/api/auth/invitations/:token/accept', async ({ params, request }) => {
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

  http.post('/api/auth/password-reset', async ({ request }) => {
    const body = await request.json() as { email?: string };
    if (body.email?.startsWith('network')) return HttpResponse.error();
    await delay(300);
    return HttpResponse.json({ accepted: true, mocked: true }, { status: 202 });
  }),

  http.get('/api/auth/password-reset/:token', async ({ params }) => {
    const token = String(params.token);
    if (token === 'expired') return mockAuthError(410, 'EXPIRED_LINK', 'The reset link has expired.');
    if (token === 'network') return HttpResponse.error();
    return HttpResponse.json({ valid: true, mocked: true });
  }),

  http.post('/api/auth/password-reset/:token', async ({ params }) => {
    if (String(params.token) === 'expired') return mockAuthError(410, 'EXPIRED_LINK', 'The reset link has expired.');
    await delay(300);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/auth/verify-email/:token', async ({ params }) => {
    const token = String(params.token);
    if (token === 'expired') return mockAuthError(410, 'EXPIRED_LINK', 'The verification link has expired.');
    if (token === 'network') return HttpResponse.error();
    await delay(250);
    return HttpResponse.json({ verified: true, mocked: true });
  }),

  http.post('/api/auth/verify-email/resend', async () => {
    await delay(250);
    return HttpResponse.json({ accepted: true, mocked: true }, { status: 202 });
  }),

  http.get('/api/search', async ({ request }) => {
    const url = new URL(request.url);
    const mark = url.searchParams.get('mark')?.toLowerCase() ?? '';
    const requestedJurisdictions = url.searchParams.getAll('jurisdiction');
    const requestedClasses = (url.searchParams.get('class') ?? '').split(',').filter(Boolean).map(Number);
    const status = url.searchParams.get('status')?.toLowerCase() ?? '';
    const owner = url.searchParams.get('owner')?.toLowerCase() ?? '';
    const filedFrom = url.searchParams.get('filedFrom') ?? '';
    const filedTo = url.searchParams.get('filedTo') ?? '';

    await delay(700);
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
  http.get('/api/dashboard/summary', async ({ request }) => {
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

  http.get('/api/portfolio', async () => {
    await delay(500);
    return HttpResponse.json(mockPortfolioMarks);
  }),

  http.post('/api/portfolio', async ({ request }) => {
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
      status: 'Draft',
      filingDate: new Date().toISOString().slice(0, 10),
      renewalDate: body.renewalDate,
      sourceRegistry: 'Manual entry (mock)',
    }, { status: 201 });
  }),

  http.get('/api/watches', async () => {
    await delay(600);
    return HttpResponse.json([
      {
        id: 'w1',
        portfolioMarkId: 'p1',
        userId: 'u1',
        alertChannel: 'email',
        alertMode: 'real-time',
        active: true,
        markText: 'FORGE GLOBAL', // Flattened for UI
      }
    ]);
  }),

  http.get('/api/alerts', async () => {
    await delay(700);
    return HttpResponse.json([
      {
        id: 'a1',
        watchId: 'w1',
        matchedFilingRef: 'US99887766',
        riskScoreId: 'r3',
        read: false,
        createdAt: new Date().toISOString(),
        riskScore: {
          id: 'r3',
          phoneticScore: 92,
          visualScore: 35,
          conceptualScore: null,
          classOverlap: true,
          compositeRating: 'high',
          matchedMarkRefs: [
            { type: 'Phonetic', evidence: 'Identical phonetic match "FORGE"', score: 92 },
          ],
        },
        matchedMarkText: 'FORGE LABS', // Flattened for UI
      }
    ]);
  }),

  http.get('/api/office-actions/search', async ({ request }) => {
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

  http.post('/api/office-actions/link', async ({ request }) => {
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
  // Replace with real API calls once the backend /api/matters endpoint ships.
  // These handlers return mocked: true to make the mock-only state explicit.
  // ---------------------------------------------------------------------------

  http.get('/api/matters', async () => {
    await delay(400);
    return HttpResponse.json<Matter[]>(mockMatters);
  }),

  http.post('/api/matters', async ({ request }) => {
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

  http.post('/api/matters/:matterId/risk-results', async ({ params, request }) => {
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
  http.post('/api/reports/pdf', async ({ request }) => {
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
    return HttpResponse.json({
      fileName,
      downloadUrl: 'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=',
      mocked: true,
    });
  }),
];

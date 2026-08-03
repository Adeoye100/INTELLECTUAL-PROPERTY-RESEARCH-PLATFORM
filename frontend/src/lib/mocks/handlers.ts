import { http, HttpResponse, delay } from 'msw';
import type { SearchResponse, SearchResult, OfficeActionRef, PortfolioMark } from '../../types';

const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    searchId: 's1',
    candidateMarkText: 'FORGE TEK',
    candidateSource: 'USPTO',
    candidateRef: 'US87654321',
    riskScore: {
      id: 'r1',
      phoneticScore: 85,
      visualScore: 40,
      classOverlap: true,
      compositeRating: 'high',
      matchedMarkRefs: [
        { type: 'Phonetic', evidence: 'Highly similar sound to "FORGE"', score: 85 },
        { type: 'Class', evidence: 'Direct overlap in Class 9', score: 100 },
      ],
    },
  },
  {
    id: '2',
    searchId: 's1',
    candidateMarkText: 'FORTRESS GLOBAL',
    candidateSource: 'EUIPO',
    candidateRef: 'EU12345678',
    riskScore: {
      id: 'r2',
      phoneticScore: 30,
      visualScore: 60,
      classOverlap: false,
      compositeRating: 'medium',
      matchedMarkRefs: [
        { type: 'Visual', evidence: 'Similar word structure', score: 60 },
      ],
    },
  },
];

export const mockSearchResponse: SearchResponse = {
  results: mockSearchResults,
  sourceStatuses: [
    { source: 'USPTO', status: 'responded' },
    { source: 'EUIPO', status: 'responded' },
    { source: 'UKIPO', status: 'pending' },
    { source: 'WIPO', status: 'unavailable' },
  ],
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

export const handlers = [
  http.post('/api/auth/login', async () => {
    await delay(800);
    return HttpResponse.json({
      token: 'mock-token',
      user: {
        id: 'u1',
        email: 'attorney@forgeglobal.com',
        role: 'attorney',
        fullName: 'John Doe',
      },
    });
  }),

  http.get('/api/search', async ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    
    await delay(1200);
    
    if (!q) {
      return HttpResponse.json<SearchResponse>({ results: [], sourceStatuses: [] });
    }
    
    return HttpResponse.json(mockSearchResponse);
  }),

  http.get('/api/portfolio', async () => {
    await delay(500);
    return HttpResponse.json(mockPortfolioMarks);
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
    
    // Filter by mark text if provided
    if (markText) {
      filteredResults = filteredResults.filter(oa => 
        oa.referenceText.toLowerCase().includes(markText.toLowerCase()) ||
        oa.examinerReasoningSummary.toLowerCase().includes(markText.toLowerCase())
      );
    }
    
    // Filter by Nice class if provided
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
    
    // In a real implementation, this would update the database
    // For now, we just return success with the request data for confirmation
    return HttpResponse.json({
      success: true,
      message: 'Office action successfully linked to portfolio mark',
      linkedOfficeActionId: body.officeActionId,
      linkedPortfolioMarkId: body.portfolioMarkId,
    });
  }),

  http.get('/api/portfolio', async () => {
    await delay(500);
    return HttpResponse.json(mockPortfolioMarks);
  }),
];

import { http, HttpResponse, delay } from 'msw';
import type { SearchResult } from '../../types';

const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    searchId: 's1',
    candidateMarkText: 'FORGE TEK',
    candidateSource: 'USPTO',
    candidateRef: 'US87654321',
    status: 'available',
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
    status: 'available',
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
  {
    id: '3',
    searchId: 's1',
    candidateMarkText: 'VALLEY FORGE',
    candidateSource: 'WIPO',
    candidateRef: 'WI99887766',
    status: 'unavailable', // Demonstrating partial source failure requirement
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
      return HttpResponse.json([]);
    }
    
    return HttpResponse.json(mockSearchResults);
  }),

  http.get('/api/portfolio', async () => {
    await delay(500);
    return HttpResponse.json([
      {
        id: 'p1',
        markText: 'FORGE GLOBAL',
        jurisdiction: 'US',
        niceClasses: [9, 35, 42],
        status: 'Registered',
        filingDate: '2022-01-15',
        renewalDate: '2032-01-15',
        sourceRegistry: 'USPTO',
      }
    ]);
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
];

export type UserRole = 'admin' | 'attorney' | 'viewer';
export type RiskLevel = 'low' | 'medium' | 'high';
export type SourceStatus = 'complete' | 'pending' | 'delayed' | 'unavailable';
export type SourceStatusEntry = { source: string; status: SourceStatus; resultCount?: number };
export type WatchAlertChannel = 'email' | 'in-app';
export type WatchAlertMode = 'real-time' | 'digest';

export interface Firm {
  id: string;
  name: string;
  subscriptionTier: string;
  createdAt: string;
}

export interface User {
  id: string;
  firmId: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string;
  fullName?: string; // Derived/UI field
  company?: string;  // Derived/UI field
}

export interface PortfolioMark {
  id: string;
  firmId: string;
  ownerUserId: string;
  markText: string;
  jurisdiction: string;
  niceClasses: number[];
  status: string;
  filingDate: string;
  renewalDate: string;
  sourceRegistry: string;
  mocked?: boolean;
}

export interface PortfolioStatusHistoryEntry {
  id: string;
  status: string;
  effectiveAt: string;
  source: string;
  note?: string;
}

export type AttachmentAvailability = 'available' | 'unavailable';

export interface PortfolioAttachment {
  id: string;
  portfolioMarkId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  availability: AttachmentAvailability;
  mocked?: boolean;
}

export interface PortfolioMarkDetail extends PortfolioMark {
  statusHistory: PortfolioStatusHistoryEntry[];
}

export interface PortfolioDetailRouteState {
  mark: PortfolioMark;
  returnTo: string;
}

export interface Watch {
  id: string;
  portfolioMarkId: string;
  userId: string;
  alertChannel: WatchAlertChannel;
  alertMode: WatchAlertMode;
  active: boolean;
}

export interface WatchSummary extends Watch {
  markText: string;
  jurisdiction: string;
  mocked?: boolean;
}

export interface WatchUpsertRequest {
  portfolioMarkId: string;
  alertChannel: WatchAlertChannel;
  alertMode: WatchAlertMode;
  active: boolean;
}

export interface Alert {
  id: string;
  watchId: string;
  matchedFilingRef: string;
  riskScoreId: string;
  read: boolean;
  createdAt: string;
  matchedMarkText: string;
  protectedMarkText: string;
  riskResultId: string;
  severity: RiskLevel;
  source: string;
  supportingEvidence: string[];
  mocked?: boolean;
  riskScore?: RiskScore; // Joined data
}

export interface Search {
  id: string;
  userId: string;
  queryText: string;
  filters: {
    jurisdiction?: string[];
    classes?: number[];
    dateRange?: { start: string; end: string };
  };
  createdAt: string;
}

export interface SearchResult {
  id: string;
  searchId: string;
  candidateMarkText: string;
  candidateSource: string;
  candidateRef: string;
  /** Mark owner name as returned by the source registry. */
  owner: string;
  /** Jurisdiction code, e.g. "US", "EU". */
  jurisdiction: string;
  /** Nice Classification class numbers for this filing. */
  niceClasses: number[];
  /** Filing date in YYYY-MM-DD format. */
  filingDate: string;
  /** Current filing status as returned by the source registry. */
  status: string;
  riskScore?: RiskScore; // Joined data
}

export interface SearchResponse {
  results: SearchResult[];
  sourceStatuses: SourceStatusEntry[];
  /** True while one or more registry sources are incomplete. */
  partial?: boolean;
  /** Correlates progressive responses for the same submitted search. */
  requestId?: string;
}

export interface DashboardAlert {
  id: string;
  matchedMarkText: string;
  protectedMarkText: string;
  candidateRef: string;
  jurisdiction: string;
  detectedAt: string;
  riskLevel: RiskLevel;
  resolved: boolean;
}

export interface RecentSearchSummary {
  id: string;
  mark: string;
  jurisdictions: string[];
  resultCount: number;
  highRiskCount: number;
  searchedAt: string;
}

export interface DashboardSummary {
  activeWatches: number;
  portfolioHealthPercent: number;
  portfolioMarkCount: number;
  recentAlerts: DashboardAlert[];
  recentSearches: RecentSearchSummary[];
  searchActivity: Array<{ label: string; count: number }>;
  riskDistribution: Array<{ risk: RiskLevel; count: number }>;
  partial: boolean;
  unavailableSections: string[];
}

/** Describes the algorithm version and evidence attribution for a risk score. */
export interface ScoringMethodology {
  /** Short version identifier, e.g. "v2.1.0" */
  version: string;
  /** Human-readable description of the scoring approach */
  description: string;
  /**
   * Source databases consulted for this score.
   * e.g. ["USPTO TESS", "EUIPO TMview"]
   */
  sourceAttribution: string[];
}

export interface RiskScore {
  id: string;
  searchResultId?: string;
  alertId?: string;
  phoneticScore: number;
  visualScore: number;
  /** null = conceptual scoring not supported for this source/version */
  conceptualScore: number | null;
  classOverlap: boolean;
  compositeRating: RiskLevel;
  /** Scoring algorithm version and source attribution */
  methodology?: ScoringMethodology;
  matchedMarkRefs: MatchedMarkRef[];
}

export interface MatchedMarkRef {
  type: 'Phonetic' | 'Visual' | 'Conceptual' | 'Class';
  evidence: string;
  score: number;
}

export interface OfficeActionRef {
  id: string;
  portfolioMarkId: string | null;   // null until linked
  referenceText: string;
  examinerReasoningSummary: string;
  linkedPrecedentRef: string | null;
}

export interface Subscription {
  id: string;
  firmId: string;
  seatsLicensed: number;
  billingProvider: string;
  status: string;
  renewalDate: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  targetRef: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// FE-11 / FE-12: Risk Detail & Decision-Action types
// ---------------------------------------------------------------------------

/**
 * The proposed (protected) mark that the user is defending.
 * Passed via router Link state so RiskDetailScreen can render without
 * a round-trip when arriving from SearchScreen.
 */
export interface ProposedMark {
  /** Free text of the proposed/protected mark. */
  markText: string;
  jurisdiction: string;
  /** Nice class numbers, e.g. [9, 35, 42] */
  niceClasses: number[];
  /** Portfolio mark id if the mark is in the user's portfolio (optional). */
  portfolioMarkId?: string;
}

/**
 * Router location state carried by the Link from SearchScreen → RiskDetailScreen.
 * When this state is present on location.state, the screen renders immediately
 * without waiting for the search query cache.
 *
 * The screen must handle the absence of this state gracefully (e.g., after a
 * direct page refresh) by falling back to the API.
 */
export interface RiskDetailRouteState {
  result: SearchResult;
  proposedMark: ProposedMark;
  /**
   * The originating search query text. Used as the fallback query key
   * if route state is absent and the screen must re-fetch.
   */
  searchQuery?: string;
}

// ---------------------------------------------------------------------------
// FE-12: Matter types (mock-only until backend /api/matters is implemented)
// ---------------------------------------------------------------------------

/**
 * A matter (case file) that one or more risk results can be saved into.
 *
 * IMPORTANT: This type is used exclusively through the mock-only MatterAdapter.
 * No server persistence exists yet. Saving a result to a matter stores it only
 * in the adapter's in-memory + localStorage mock state.
 */
export interface Matter {
  id: string;
  name: string;
  clientRef: string;
  createdAt: string;
  /** Risk result ids that have been saved to this matter. */
  savedResultIds: string[];
}

/**
 * Payload to save a risk result to a matter.
 * If matterId is omitted, a new matter is created with the given name.
 */
export interface MatterSaveRequest {
  /** Existing matter id. If omitted, create a new matter. */
  matterId?: string;
  /** Required when matterId is omitted — name for the new matter. */
  newMatterName?: string;
  newMatterClientRef?: string;
  resultId: string;
  /** Snapshot of the risk score saved for the matter record. */
  riskScoreSnapshot: Pick<RiskScore, 'compositeRating' | 'phoneticScore' | 'visualScore' | 'conceptualScore' | 'classOverlap'>;
  candidateMarkText: string;
}

export interface MatterSaveResult {
  matter: Matter;
  /** True when a new matter was created as part of this save. */
  created: boolean;
  /** Always true for mock adapter responses. */
  mocked: true;
}

/**
 * Interface that the matter adapter must satisfy. Enables easy swap to a
 * real API-backed implementation once the backend /api/matters endpoint ships.
 */
export interface MatterAdapter {
  /** List all matters for the current mock session. */
  listMatters(): Promise<Matter[]>;
  /** Save a risk result to an existing or new matter. */
  saveToMatter(request: MatterSaveRequest): Promise<MatterSaveResult>;
}

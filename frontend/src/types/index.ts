export type UserRole = 'admin' | 'attorney' | 'viewer';
export type RiskLevel = 'low' | 'medium' | 'high';
export type SourceStatus = 'responded' | 'pending' | 'unavailable';
export type SourceStatusEntry = { source: string; status: SourceStatus };
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
}

export interface Watch {
  id: string;
  portfolioMarkId: string;
  userId: string;
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
  riskScore?: RiskScore; // Joined data
}

export interface SearchResponse {
  results: SearchResult[];
  sourceStatuses: SourceStatusEntry[];
}

export interface RiskScore {
  id: string;
  searchResultId?: string;
  alertId?: string;
  phoneticScore: number;
  visualScore: number;
  classOverlap: boolean;
  compositeRating: RiskLevel;
  matchedMarkRefs: {
    type: string;
    evidence: string;
    score: number;
  }[];
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

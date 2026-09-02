import type { CalendarDate, PortfolioMarkStatus } from "../../types";
import type { PortfolioMarkListQuery } from "./portfolioApi";

export const portfolioMarkStatuses: readonly PortfolioMarkStatus[] = [
  "pending", "filed", "registered", "abandoned", "expired", "cancelled",
];

export type RenewalWindow = "all" | "overdue" | "30" | "90" | "365";

export interface PortfolioFilters {
  query: string;
  jurisdiction: string;
  status: PortfolioMarkStatus | "";
  sourceRegistry: string;
  registryReference: string;
  niceClass: string;
  renewalWindow: RenewalWindow;
}

export const defaultPortfolioFilters: PortfolioFilters = {
  query: "",
  jurisdiction: "",
  status: "",
  sourceRegistry: "",
  registryReference: "",
  niceClass: "",
  renewalWindow: "all",
};

const renewalWindows: readonly RenewalWindow[] = ["all", "overdue", "30", "90", "365"];

const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const renewalDaysRemaining = (renewalDate: string | null | undefined, now = new Date()) => {
  if (!renewalDate || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return Number.POSITIVE_INFINITY;
  return Math.ceil((Date.parse(`${renewalDate}T00:00:00Z`) - startOfUtcDay(now)) / 86_400_000);
};

export const getRenewalWarning = (renewalDate: string | null | undefined, now = new Date()) => {
  if (!renewalDate || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return { level: "none" as const, label: "No renewal date", days: Number.POSITIVE_INFINITY };
  const days = renewalDaysRemaining(renewalDate, now);
  if (days < 0) return { level: "high" as const, label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, days };
  if (days <= 30) return { level: "high" as const, label: `Due in ${days} day${days === 1 ? "" : "s"}`, days };
  if (days <= 90) return { level: "medium" as const, label: `Due in ${days} days`, days };
  return { level: "low" as const, label: "No immediate action", days };
};

export const portfolioStatusLabel = (status: PortfolioMarkStatus) =>
  `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;

function normalizedParam(params: URLSearchParams, key: string, maximum: number) {
  return (params.get(key) ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function statusParam(value: string): PortfolioMarkStatus | "" {
  return portfolioMarkStatuses.includes(value as PortfolioMarkStatus) ? value as PortfolioMarkStatus : "";
}

function niceClassParam(value: string) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 45 ? value : "";
}

export const portfolioFiltersFromParams = (params: URLSearchParams): PortfolioFilters => {
  const renewal = params.get("renewal") ?? "all";
  return {
    query: normalizedParam(params, "query", 200),
    jurisdiction: normalizedParam(params, "jurisdiction", 8).toUpperCase(),
    status: statusParam(params.get("status") ?? ""),
    sourceRegistry: normalizedParam(params, "sourceRegistry", 100).toUpperCase(),
    registryReference: normalizedParam(params, "registryReference", 200),
    niceClass: niceClassParam(params.get("niceClass") ?? ""),
    renewalWindow: renewalWindows.includes(renewal as RenewalWindow) ? renewal as RenewalWindow : "all",
  };
};

export const portfolioPageFromParams = (params: URLSearchParams) => {
  const value = Number(params.get("page") ?? "1");
  return Number.isSafeInteger(value) && value >= 1 && value <= 100_000 ? value : 1;
};

export const portfolioFiltersToParams = (filters: PortfolioFilters, page = 1) => {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.jurisdiction) params.set("jurisdiction", filters.jurisdiction);
  if (filters.status) params.set("status", filters.status);
  if (filters.sourceRegistry) params.set("sourceRegistry", filters.sourceRegistry);
  if (filters.registryReference) params.set("registryReference", filters.registryReference);
  if (filters.niceClass) params.set("niceClass", filters.niceClass);
  if (filters.renewalWindow !== "all") params.set("renewal", filters.renewalWindow);
  if (page > 1) params.set("page", String(page));
  return params;
};

function calendarDate(date: Date): CalendarDate {
  return date.toISOString().slice(0, 10) as CalendarDate;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Maps visible filters to the server-side, bounded portfolio list contract. */
export function portfolioListQuery(filters: PortfolioFilters, page: number, now = new Date()): PortfolioMarkListQuery {
  const query: PortfolioMarkListQuery = { page, pageSize: 25 };
  if (filters.query) query.query = filters.query;
  if (filters.jurisdiction) query.jurisdiction = filters.jurisdiction;
  if (filters.status) query.status = filters.status;
  if (filters.sourceRegistry) query.sourceRegistry = filters.sourceRegistry;
  if (filters.registryReference) query.registryReference = filters.registryReference;
  if (filters.niceClass) query.niceClass = Number(filters.niceClass);

  const today = addUtcDays(now, 0);
  if (filters.renewalWindow === "overdue") query.renewalBefore = calendarDate(addUtcDays(today, -1));
  if (filters.renewalWindow !== "all" && filters.renewalWindow !== "overdue") {
    query.renewalAfter = calendarDate(today);
    query.renewalBefore = calendarDate(addUtcDays(today, Number(filters.renewalWindow)));
  }
  return query;
}

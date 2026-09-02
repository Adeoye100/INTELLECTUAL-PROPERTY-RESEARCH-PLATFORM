import { getApiClient } from "../../lib/api/client";
import type {
  CalendarDate,
  PortfolioMark,
  PortfolioMarkListResponse,
  PortfolioMarkStatus,
} from "../../types";

export interface PortfolioMarkListQuery {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: PortfolioMarkStatus;
  jurisdiction?: string;
  sourceRegistry?: string;
  registryReference?: string;
  niceClass?: number;
  renewalBefore?: CalendarDate;
  renewalAfter?: CalendarDate;
}

export interface PortfolioMarkInput {
  markText: string;
  jurisdiction: string;
  sourceRegistry: string;
  registryReference: string;
  niceClasses: number[];
  status: PortfolioMarkStatus;
  filingDate: CalendarDate | null;
  registrationDate: CalendarDate | null;
  renewalDate: CalendarDate | null;
}

export type CreatePortfolioMarkRequest = PortfolioMarkInput;
export type PatchPortfolioMarkRequest = Partial<PortfolioMarkInput>;

function queryPath(query: PortfolioMarkListQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `/portfolio-marks?${suffix}` : "/portfolio-marks";
}

export const listPortfolioMarks = (query?: PortfolioMarkListQuery) =>
  getApiClient().requestJson<PortfolioMarkListResponse>(queryPath(query));

export const getPortfolioMark = (markId: string) =>
  getApiClient().requestJson<PortfolioMark>(`/portfolio-marks/${encodeURIComponent(markId)}`);

export const createPortfolioMark = (request: CreatePortfolioMarkRequest) =>
  getApiClient().requestJson<PortfolioMark>("/portfolio-marks", { method: "POST", body: request });

export const patchPortfolioMark = (markId: string, request: PatchPortfolioMarkRequest) =>
  getApiClient().requestJson<PortfolioMark>(`/portfolio-marks/${encodeURIComponent(markId)}`, {
    method: "PATCH",
    body: request,
  });

/**
 * The backend supports DELETE, but the initial UI deliberately does not expose
 * it while dependent watches, alerts, risk scores, and office-action records
 * use restrictive foreign keys. This client stays available for future,
 * dependency-safe lifecycle work and is not called by the active interface.
 */
export const deletePortfolioMark = (markId: string) =>
  getApiClient().requestJson<void>(`/portfolio-marks/${encodeURIComponent(markId)}`, { method: "DELETE" });

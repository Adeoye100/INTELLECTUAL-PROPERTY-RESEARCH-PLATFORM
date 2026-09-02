import { describe, expect, it } from "vitest";
import { getRenewalWarning, portfolioFiltersFromParams, portfolioListQuery } from "./portfolioDomain";

describe("portfolio domain", () => {
  it("calculates renewal warnings from UTC calendar dates", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(getRenewalWarning("2026-08-03", now)).toMatchObject({ level: "high", label: "Overdue by 1 day" });
    expect(getRenewalWarning("2026-10-01", now)).toMatchObject({ level: "medium" });
  });

  it("normalizes URL filters and maps renewal windows to bounded server query parameters", () => {
    const filters = portfolioFiltersFromParams(new URLSearchParams("query=  forge%20global  &status=registered&jurisdiction=us&niceClass=9&renewal=30"));
    expect(filters).toMatchObject({ query: "forge global", status: "registered", jurisdiction: "US", niceClass: "9", renewalWindow: "30" });
    expect(portfolioListQuery(filters, 2, new Date("2026-08-04T12:00:00.000Z"))).toEqual({ page: 2, pageSize: 25, query: "forge global", status: "registered", jurisdiction: "US", niceClass: 9, renewalAfter: "2026-08-04", renewalBefore: "2026-09-03" });
  });
});

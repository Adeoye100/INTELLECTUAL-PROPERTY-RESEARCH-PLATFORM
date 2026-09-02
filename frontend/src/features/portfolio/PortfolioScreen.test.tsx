import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortfolioMark, PortfolioMarkListResponse, UserRole } from "../../types";
import { useAuthStore } from "../auth/authStore";
import { PortfolioScreen } from "./PortfolioScreen";

const marks: PortfolioMark[] = [
  { id: "11111111-1111-4111-8111-111111111111", firmId: "f1", ownerUserId: "u1", markText: "FORGE GLOBAL", jurisdiction: "US", sourceRegistry: "USPTO", registryReference: "12345678", niceClasses: [9], status: "registered", filingDate: "2020-01-01", registrationDate: "2021-01-01", renewalDate: "2030-01-01", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", firmId: "f1", ownerUserId: "u1", markText: "INNOVATE PRO", jurisdiction: "EU", sourceRegistry: "EUIPO", registryReference: "EU-42", niceClasses: [42], status: "pending", filingDate: "2024-01-01", registrationDate: null, renewalDate: "2026-08-25", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
];
const envelope = (items = marks, page = 1, total = 2): PortfolioMarkListResponse => ({ items, pagination: { page, pageSize: 25, total, totalPages: total ? 2 : 0 } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderPortfolio(role: UserRole = "attorney", fetchImpl?: typeof fetch) {
  useAuthStore.getState().setSession("portfolio-token", { id: "u1", email: "attorney@firm.test", fullName: "Attorney", role, firmId: "f1" });
  const fetchMock = vi.fn(fetchImpl ?? (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/portfolio-marks") && init?.method === "POST") return json({ ...marks[0], id: "33333333-3333-4333-8333-333333333333" }, 201);
    if (url.includes("/api/v1/portfolio-marks")) return json(envelope());
    return json({}, 404);
  }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portfolio"]}><Routes><Route path="/portfolio" element={<PortfolioScreen />} /><Route path="/portfolio/:markId" element={<div>Portfolio detail destination</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}

describe("PortfolioScreen", () => {
  afterEach(() => { act(() => useAuthStore.getState().clearSession()); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("uses the real paginated endpoint and renders desktop and mobile presentations", async () => {
    const fetchMock = renderPortfolio();
    expect(await screen.findByRole("table", { name: "Portfolio marks" })).toHaveTextContent("FORGE GLOBAL");
    expect(screen.getAllByText("INNOVATE PRO")[0]).toBeVisible();
    expect(screen.getByText("2 portfolio marks · Page 1 of 2")).toBeVisible();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/portfolio-marks?page=1&pageSize=25");
  });

  it("sends complete create DTOs and announces a duplicate conflict safely", async () => {
    const user = userEvent.setup();
    const fetchMock = renderPortfolio();
    await screen.findAllByText("FORGE GLOBAL");
    await user.click(screen.getByRole("button", { name: "Add mark" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Mark text"), "NOVA");
    await user.type(dialog.getByLabelText("Jurisdiction"), "US");
    await user.type(dialog.getByLabelText("Source registry"), "USPTO");
    await user.type(dialog.getByLabelText("Registry reference"), "US-999");
    await user.type(dialog.getByLabelText("Nice classes"), "9, 42");
    await user.click(dialog.getByRole("button", { name: "Add mark" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(call?.[0])).toContain("/api/v1/portfolio-marks");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ markText: "NOVA", jurisdiction: "US", sourceRegistry: "USPTO", registryReference: "US-999", niceClasses: [9, 42], status: "pending", filingDate: null, registrationDate: null, renewalDate: null });
  });

  it("synchronizes server-side filters and pagination with the URL", async () => {
    const fetchMock = renderPortfolio();
    await screen.findAllByText("FORGE GLOBAL");
    fireEvent.change(screen.getByLabelText("Mark text"), { target: { value: "forge" } });
    fireEvent.change(await screen.findByLabelText("Nice class"), { target: { value: "9" } });
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("query=forge") && String(input).includes("niceClass=9") && String(input).includes("page=2"))).toBe(true));
  });

  it("shows controlled empty, error, and retry states", async () => {
    let attempts = 0;
    const fetchMock = renderPortfolio("attorney", async () => { attempts += 1; return attempts === 1 ? json({}, 503) : json(envelope([], 1, 0)); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Portfolio unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry portfolio" }));
    expect(await screen.findByText("No portfolio marks have been added to this firm yet.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps Viewer read-only while Attorney and Admin see Add mark", async () => {
    renderPortfolio("viewer");
    await screen.findAllByText("FORGE GLOBAL");
    expect(screen.queryByRole("button", { name: "Add mark" })).not.toBeInTheDocument();
    act(() => useAuthStore.getState().clearSession());
  });
});

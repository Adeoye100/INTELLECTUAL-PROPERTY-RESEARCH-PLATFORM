import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortfolioMark, UserRole } from "../../types";
import { useAuthStore } from "../auth/authStore";
import { PortfolioDetailScreen } from "./PortfolioDetailScreen";

const mark: PortfolioMark = { id: "11111111-1111-4111-8111-111111111111", firmId: "f1", ownerUserId: "u1", markText: "FORGE GLOBAL", jurisdiction: "US", sourceRegistry: "USPTO", registryReference: "12345678", niceClasses: [9, 42], status: "registered", filingDate: "2020-01-01", registrationDate: "2021-01-01", renewalDate: "2030-01-01", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderDetail(role: UserRole = "attorney", responder?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  useAuthStore.getState().setSession("token", { id: "u1", email: "attorney@firm.test", fullName: "Attorney", role, firmId: "f1" });
  const fetchMock = vi.fn(responder ?? (async (_input, init) => init?.method === "PATCH" ? json({ ...mark, status: "filed" }) : json(mark)));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portfolio/11111111-1111-4111-8111-111111111111?status=registered"]}><Routes><Route path="/portfolio/:markId" element={<PortfolioDetailScreen />} /></Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}

describe("PortfolioDetailScreen", () => {
  afterEach(() => { act(() => useAuthStore.getState().clearSession()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("loads the real mark DTO and omits unsupported portfolio capabilities", async () => {
    const fetchMock = renderDetail();
    expect(await screen.findByRole("heading", { name: "FORGE GLOBAL" })).toBeVisible();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/portfolio-marks/11111111-1111-4111-8111-111111111111");
    expect(screen.getByText(/Deletion is not available/)).toBeVisible();
    expect(screen.queryByText("Status history")).not.toBeInTheDocument();
    expect(screen.queryByText("Attachments")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Configure watch/i })).not.toBeInTheDocument();
  });

  it("sends only changed supported fields through PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = renderDetail();
    await screen.findByRole("heading", { name: "FORGE GLOBAL" });
    await user.click(screen.getByRole("button", { name: "Edit mark" }));
    const status = screen.getByLabelText("Status");
    await user.selectOptions(status, "filed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: "filed" });
    expect(await screen.findByText("Portfolio mark updated successfully.")).toBeVisible();
  });

  it("keeps Viewer read-only and gives a controlled cross-firm/not-found response", async () => {
    renderDetail("viewer", async () => json({ code: "PORTFOLIO_MARK_NOT_FOUND" }, 404));
    expect(await screen.findByRole("alert")).toHaveTextContent("Portfolio mark not found");
    expect(screen.queryByRole("button", { name: "Edit mark" })).not.toBeInTheDocument();
  });
});

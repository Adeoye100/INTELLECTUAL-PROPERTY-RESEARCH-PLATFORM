import type { UserRole } from "../../types";

export type Capability =
  | "dashboard:view"
  | "portfolio:view"
  | "portfolio:write"
  | "search:view"
  | "office-actions:view"
  | "watches:view"
  | "watches:write"
  | "members:manage"
  | "invitations:manage"
  | "firm:write"
  | "firm:read"
  | "billing:manage"
  | "reports:export";

const capabilities: Record<UserRole, ReadonlySet<Capability>> = {
  admin: new Set([
    "dashboard:view",
    "portfolio:view",
    "portfolio:write",
    "search:view",
    "office-actions:view",
    "watches:view",
    "watches:write",
    "members:manage",
    "invitations:manage",
    "firm:write",
    "firm:read",
    "billing:manage",
    "reports:export",
  ]),
  attorney: new Set([
    "dashboard:view",
    "portfolio:view",
    "portfolio:write",
    "search:view",
    "office-actions:view",
    "watches:view",
    "watches:write",
    "firm:write",
    "firm:read",
    "reports:export",
  ]),
  viewer: new Set([
    "dashboard:view",
    "portfolio:view",
    "search:view",
    "office-actions:view",
    "watches:view",
    "firm:read",
  ]),
};

export function hasCapability(role: UserRole | null | undefined, capability: Capability) {
  return Boolean(role && capabilities[role]?.has(capability));
}

export interface NavigationItem {
  to: string;
  label: string;
  capability: Capability;
}

/**
 * Navigation represents the PRD product surface, not deployment activation.
 * Feature flags are enforced by route content so a disabled capability is
 * visible with an honest unavailable state instead of disappearing entirely.
 */
const functionalNavigation: readonly NavigationItem[] = [
  { to: "/dashboard", label: "Dashboard", capability: "dashboard:view" },
  { to: "/search", label: "Search", capability: "search:view" },
  { to: "/risk-analysis", label: "Risk Analysis", capability: "search:view" },
  { to: "/office-actions", label: "Office Actions", capability: "office-actions:view" },
  { to: "/portfolio", label: "Portfolio", capability: "portfolio:view" },
  { to: "/watches", label: "Watches", capability: "watches:view" },
  { to: "/reports", label: "Reports", capability: "reports:export" },
  { to: "/admin/users", label: "Users & Invitations", capability: "members:manage" },
  { to: "/admin/billing", label: "Billing", capability: "billing:manage" },
];

export function navigationForRole(role: UserRole | null | undefined) {
  return functionalNavigation.filter((item) => hasCapability(role, item.capability));
}

export const roleDescriptions: Record<UserRole, string> = {
  admin: "Admin manages firm members and settings.",
  attorney: "Attorney performs firm legal and research work.",
  viewer: "Viewer has read-only access to firm information.",
};

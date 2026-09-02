import type { UserRole } from "../../types";

export type Capability =
  | "dashboard:view"
  | "portfolio:view"
  | "portfolio:write"
  | "members:manage"
  | "invitations:manage"
  | "firm:write"
  | "firm:read";

const capabilities: Record<UserRole, ReadonlySet<Capability>> = {
  admin: new Set(["dashboard:view", "portfolio:view", "portfolio:write", "members:manage", "invitations:manage", "firm:write", "firm:read"]),
  attorney: new Set(["dashboard:view", "portfolio:view", "portfolio:write", "firm:write", "firm:read"]),
  viewer: new Set(["dashboard:view", "portfolio:view", "firm:read"]),
};

export function hasCapability(role: UserRole | null | undefined, capability: Capability) {
  return Boolean(role && capabilities[role].has(capability));
}

export interface NavigationItem {
  to: string;
  label: string;
  capability: Capability;
}

const functionalNavigation: readonly NavigationItem[] = [
  { to: "/dashboard", label: "Dashboard", capability: "dashboard:view" },
  { to: "/portfolio", label: "Portfolio", capability: "portfolio:view" },
  { to: "/admin/users", label: "Users & Invitations", capability: "members:manage" },
];

export function navigationForRole(role: UserRole | null | undefined) {
  return functionalNavigation.filter((item) => hasCapability(role, item.capability));
}

export const roleDescriptions: Record<UserRole, string> = {
  admin: "Admin manages firm members and settings.",
  attorney: "Attorney performs firm legal and research work.",
  viewer: "Viewer has read-only access to firm information.",
};

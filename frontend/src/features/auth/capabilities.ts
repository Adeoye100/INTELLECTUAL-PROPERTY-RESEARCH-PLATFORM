import type { UserRole } from "../../types";
import { features } from "../../config/features";

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
  | "billing:manage";

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
  featureFlag?: keyof typeof features;
}

const functionalNavigation: readonly NavigationItem[] = [
  { to: "/dashboard", label: "Dashboard", capability: "dashboard:view" },
  { to: "/search", label: "Search", capability: "search:view", featureFlag: "searchEnabled" },
  { to: "/office-actions", label: "Office Actions", capability: "office-actions:view", featureFlag: "officeActionSearchEnabled" },
  { to: "/portfolio", label: "Portfolio", capability: "portfolio:view" },
  { to: "/watches", label: "Watches", capability: "watches:view", featureFlag: "watchEnabled" },
  { to: "/admin/users", label: "Users & Invitations", capability: "members:manage" },
  { to: "/admin/billing", label: "Billing", capability: "billing:manage" },
];

export function navigationForRole(role: UserRole | null | undefined) {
  return functionalNavigation.filter((item) => {
    if (!hasCapability(role, item.capability)) return false;
    if (item.featureFlag && !features[item.featureFlag]) return false;
    return true;
  });
}

export const roleDescriptions: Record<UserRole, string> = {
  admin: "Admin manages firm members and settings.",
  attorney: "Attorney performs firm legal and research work.",
  viewer: "Viewer has read-only access to firm information.",
};


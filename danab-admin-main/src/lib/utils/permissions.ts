export const ROLES = {
  USER: "user",
  MODERATOR: "moderator",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const ROLE_HIERARCHY: Record<string, number> = {
  [ROLES.USER]: 1,
  [ROLES.MODERATOR]: 2,
  [ROLES.ADMIN]: 3,
};

export interface User {
  id?: string;
  _id?: string;
  username?: string;
  email?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  token?: string;
}

export function getUserRole(user: User | null): Role {
  if (!user) return ROLES.USER;
  const role = (user.role || "").toLowerCase();
  if (role === ROLES.ADMIN) return ROLES.ADMIN;
  if (role === ROLES.MODERATOR) return ROLES.MODERATOR;
  return ROLES.USER;
}

export function hasRole(user: User | null, role: Role): boolean {
  return getUserRole(user) === role;
}

export function hasMinRole(user: User | null, minRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY[getUserRole(user)] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
  return userLevel >= requiredLevel;
}

// Permission checks
export function canViewDashboard(user: User | null): boolean {
  return hasMinRole(user, ROLES.MODERATOR);
}

export function canManageStations(user: User | null): boolean {
  return hasMinRole(user, ROLES.MODERATOR);
}

export function canManageSlots(user: User | null): boolean {
  return hasMinRole(user, ROLES.USER);
}

export function canViewRevenue(user: User | null): boolean {
  return hasMinRole(user, ROLES.MODERATOR);
}

export function canManageUsers(user: User | null): boolean {
  return hasMinRole(user, ROLES.ADMIN);
}

export function canManageBlacklist(user: User | null): boolean {
  return hasMinRole(user, ROLES.USER);
}

export function canViewNotifications(user: User | null): boolean {
  return hasMinRole(user, ROLES.USER);
}

export function canAccessSettings(user: User | null): boolean {
  return hasMinRole(user, ROLES.USER);
}

// Allowed routes per role
export function getAllowedRoutes(user: User | null): string[] {
  const role = getUserRole(user);
  const baseRoutes = [
    "/slots",
    "/active-rentals",
    "/settings",
    "/notifications",
    "/powerbanks",
    "/rentals",
  ];

  if (role === ROLES.USER) return [...baseRoutes, "/blacklist"];

  const moderatorRoutes = [
    ...baseRoutes,
    "/dashboard",
    "/stations",
    "/live-batteries",
    "/station-comparison",
    "/revenue",
    "/blacklist",
    "/problem-slots",
  ];

  if (role === ROLES.MODERATOR) return moderatorRoutes;

  // Admin gets everything
  return [...moderatorRoutes, "/users"];
}

export function canManageProblemSlots(user: User | null): boolean {
  return hasMinRole(user, ROLES.MODERATOR);
}

export function canAccessRoute(user: User | null, route: string): boolean {
  const allowedRoutes = getAllowedRoutes(user);
  // Allow station detail routes
  if (route.startsWith("/station/")) return hasMinRole(user, ROLES.MODERATOR);
  return allowedRoutes.some((r) => route.startsWith(r));
}

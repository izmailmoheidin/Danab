import { getUserRole, ROLES, type User, type Role } from './permissions';

export function isAdmin(user: User | null): boolean {
  return getUserRole(user) === ROLES.ADMIN;
}

export function isModerator(user: User | null): boolean {
  return getUserRole(user) === ROLES.MODERATOR;
}

export function hasRole(user: User | null, role: Role): boolean {
  return getUserRole(user) === role;
}

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user || !user.permissions) return false;
  return user.permissions.includes(permission);
}

export function getUserDisplayRole(user: User | null): string {
  const role = getUserRole(user);
  switch (role) {
    case ROLES.ADMIN:
      return 'Administrator';
    case ROLES.MODERATOR:
      return 'Moderator';
    default:
      return 'User';
  }
}

interface NavItem {
  name: string;
  path: string;
  icon: string;
  minRole?: Role;
  adminOnly?: boolean;
}

export function getRoleBasedNavigation(user: User | null, navItems: NavItem[]): NavItem[] {
  const userRole = getUserRole(user);
  const roleLevel: Record<string, number> = {
    [ROLES.USER]: 1,
    [ROLES.MODERATOR]: 2,
    [ROLES.ADMIN]: 3,
  };

  return navItems.filter((item) => {
    if (item.adminOnly && userRole !== ROLES.ADMIN) return false;
    if (item.minRole) {
      return (roleLevel[userRole] || 0) >= (roleLevel[item.minRole] || 0);
    }
    return true;
  });
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { getUserRole, hasMinRole, ROLES, type Role } from '@/lib/utils/permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
  adminOnly?: boolean;
  minRole?: Role;
}

export default function ProtectedRoute({
  children,
  requiredRole,
  adminOnly = false,
  minRole,
}: ProtectedRouteProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.authLoading);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    const userRole = getUserRole(user);

    if (adminOnly && userRole !== ROLES.ADMIN) {
      router.push('/slots');
      return;
    }

    if (requiredRole && userRole !== requiredRole) {
      router.push('/slots');
      return;
    }

    if (minRole && !hasMinRole(user, minRole)) {
      router.push('/slots');
      return;
    }
  }, [user, authLoading, router, adminOnly, requiredRole, minRole]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-lg text-blue-600 dark:text-blue-300 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  if (adminOnly && getUserRole(user) !== ROLES.ADMIN) return null;
  if (requiredRole && getUserRole(user) !== requiredRole) return null;
  if (minRole && !hasMinRole(user, minRole)) return null;

  return <>{children}</>;
}

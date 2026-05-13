import AuthShell from '@/components/AuthShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}

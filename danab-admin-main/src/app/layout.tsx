import type { Metadata } from 'next';
import './globals.css';
import Initializer from '@/components/Initializer';

export const metadata: Metadata = {
  title: 'Danab Power Admin',
  description: 'Power Bank Rental Management Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <Initializer>{children}</Initializer>
      </body>
    </html>
  );
}

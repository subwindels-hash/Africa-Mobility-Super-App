import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AMSA — Africa Mobility Super App',
  description:
    'Rides, delivery, flights, charters and verified security in one app — with escrow-protected payments. Lagos → Africa → the world.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Scholarly — Academic Conference & Peer-Review Platform',
  description: 'Enterprise conference management, multi-author paper submission, and review tracking built on PostgreSQL.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        <Suspense fallback={<div className="h-16 border-b border-slate-800 bg-slate-900/80"></div>}>
          <Navbar />
        </Suspense>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
          Scholarly (ConfDB) DBMS Project — Powered by PostgreSQL & Next.js
        </footer>
      </body>
    </html>
  );
}

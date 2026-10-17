import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

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
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900 antialiased selection:bg-[#c8102e] selection:text-white">
        <Suspense fallback={<div className="h-28 border-b border-gray-200 bg-white"></div>}>
          <Navbar />
        </Suspense>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        
        {/* Clean Academic Conference Footer */}
        <footer className="border-t border-gray-300 bg-white mt-16 pt-12 pb-16 text-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-12 border-b border-gray-200 text-xs">
              <div>
                <h4 className="font-bold text-black uppercase tracking-wider mb-3">Conferences</h4>
                <ul className="space-y-2">
                  <li><Link href="/conferences" className="hover:underline">All Conferences Index</Link></li>
                  <li><Link href="/conferences?status=open" className="hover:underline">Open Calls for Papers</Link></li>
                  <li><Link href="/conferences?status=in_review" className="hover:underline">Papers in Review</Link></li>
                  <li><Link href="/conferences?status=closed" className="hover:underline">Archived Proceedings</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-black uppercase tracking-wider mb-3">Author & Reviewer Portal</h4>
                <ul className="space-y-2">
                  <li><Link href="/conferences?status=open" className="hover:underline">Submit a Paper</Link></li>
                  <li><Link href="/dashboard" className="hover:underline">Track Submissions</Link></li>
                  <li><Link href="/login" className="hover:underline">Sign In</Link></li>
                  <li><Link href="/register" className="hover:underline">Register Author Profile</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-black uppercase tracking-wider mb-3">DBMS Architecture</h4>
                <ul className="space-y-2">
                  <li><span className="text-gray-500">20-Table Relational Schema</span></li>
                  <li><span className="text-gray-500">Deferred Unique Constraints</span></li>
                  <li><span className="text-gray-500">pgvector Semantic Indexing</span></li>
                  <li><span className="text-gray-500">ACID Stored Procedures</span></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-black uppercase tracking-wider mb-3">Platform Specs</h4>
                <ul className="space-y-2">
                  <li><span className="text-gray-500">DBMS Level 3 Experiential Project</span></li>
                  <li><span className="text-gray-500">PostgreSQL 16 Engine</span></li>
                  <li><span className="text-gray-500">Double-Blind Peer Review</span></li>
                  <li><span className="text-gray-500">Multi-Author Transaction Pipeline</span></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-gray-500">
              <div className="flex items-center space-x-2 mb-4 md:mb-0">
                <span className="font-serif font-black text-black text-xs tracking-wider uppercase border border-black px-1.5 py-0.5">
                  SCHOLARLY
                </span>
                <span>Academic Conference & Peer-Review Management System. Powered by PostgreSQL.</span>
              </div>
              <div className="flex space-x-6 text-[11px]">
                <Link href="/conferences" className="hover:underline">Conferences</Link>
                <Link href="/dashboard" className="hover:underline">Dashboard</Link>
                <Link href="/login" className="hover:underline">Sign In</Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

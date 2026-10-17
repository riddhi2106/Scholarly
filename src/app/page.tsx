import Link from 'next/link';
import { BookOpen, Calendar, FileText, Database, Shield, Cpu, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-blue-950/80 border border-blue-800/80 text-blue-400 text-xs font-semibold">
          <Database className="h-3.5 w-3.5 text-blue-400" />
          <span>DBMS Level 3 Experiential Learning — PostgreSQL & pgvector</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Next-Generation Academic <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Conference Management
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          Scholarly delivers verified conference timelines, transactional multi-author submissions, and relational integrity backed by a 20-table PostgreSQL architecture.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/conferences"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/25 transition duration-150 flex items-center justify-center space-x-2"
          >
            <span>Explore Conferences</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-sm transition duration-150 flex items-center justify-center"
          >
            Author Portal & Sign In
          </Link>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-white">Relational Integrity</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Strict foreign keys, deferred unique author orders, check constraints, and custom triggers guarantee clean data and reject invalid submissions.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Cpu className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-white">ACID Transactions</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Atomic stored procedures execute multi-table paper creation, author order assignments, and topic tagging with automatic rollback on error.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="h-10 w-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Database className="h-5 w-5" />
          </div>
          <h2 className="text-base font-bold text-white">Vector & Full-Text Search</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Powered by PostgreSQL <code className="text-purple-300">pgvector</code> HNSW indexing for semantic similarity matching alongside GIN inverted indexes for keywords.
          </p>
        </div>
      </div>
    </div>
  );
}

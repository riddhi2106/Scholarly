'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, ArrowRight, Clock, Users, CheckCircle, AlertCircle } from 'lucide-react';

export default function ConferencesPage() {
  const [conferences, setConferences] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchConferences = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/conferences?${params.toString()}`);
      const data = await res.json();
      setConferences(data.conferences || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConferences();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchConferences();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Open for Submission</span>
          </span>
        );
      case 'in_review':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
            <span>In Review</span>
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <span>Closed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Academic Conferences</h1>
          <p className="text-slate-400 mt-1">
            Browse verified conferences, track submission deadlines, and submit your research.
          </p>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search VLDB, SIGMOD..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </form>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In Review</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Conference Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">Loading conferences...</div>
      ) : conferences.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
          <p className="text-slate-400 text-sm">No conferences match your filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {conferences.map((conf) => {
            const isOpen = conf.status === 'open';
            const closeDate = new Date(conf.submission_close_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={conf.conference_id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition duration-150 shadow-lg group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black tracking-wider uppercase px-2.5 py-1 rounded bg-blue-950/70 text-blue-400 border border-blue-800/80 font-mono">
                      {conf.acronym} {conf.year}
                    </span>
                    {getStatusBadge(conf.status)}
                  </div>

                  <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                    {conf.name}
                  </h2>

                  <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {conf.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-400" />
                      <span>Deadline: <strong className="text-slate-200">{closeDate}</strong></span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      <span>{conf.total_submissions} papers</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Link
                      href={`/conferences/${conf.conference_id}`}
                      className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 rounded-xl text-xs transition duration-150"
                    >
                      View Details
                    </Link>

                    {isOpen ? (
                      <Link
                        href={`/conferences/${conf.conference_id}/submit`}
                        className="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-xl text-xs transition duration-150 flex items-center justify-center space-x-1 shadow-md shadow-blue-600/20"
                      >
                        <span>Submit Paper</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="flex-1 text-center bg-slate-800/40 text-slate-500 font-medium py-2 rounded-xl text-xs cursor-not-allowed"
                      >
                        Submissions Closed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

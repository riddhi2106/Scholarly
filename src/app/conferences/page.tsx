'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, ArrowRight, Clock, Users, CheckCircle, Bookmark, Share2 } from 'lucide-react';

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

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Editorial Header */}
      <div className="border-b border-black pb-4 mb-8">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
          INDEX & PROCEEDINGS
        </span>
        <h1 className="text-4xl sm:text-5xl font-black font-serif text-black mt-1">
          Academic Conferences
        </h1>
        <p className="text-sm text-gray-600 mt-2 max-w-2xl">
          Browse peer-reviewed international conferences, submission deadlines, and call for papers managed through relational DBMS pipelines.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-gray-200 mb-8">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-2 text-xs font-semibold overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 border transition ${
              statusFilter === '' 
                ? 'bg-black text-white border-black font-bold' 
                : 'bg-white text-gray-700 border-gray-300 hover:border-black'
            }`}
          >
            All Statuses
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3 py-1.5 border transition ${
              statusFilter === 'open' 
                ? 'bg-black text-white border-black font-bold' 
                : 'bg-white text-gray-700 border-gray-300 hover:border-black'
            }`}
          >
            Call For Papers Open
          </button>
          <button
            onClick={() => setStatusFilter('in_review')}
            className={`px-3 py-1.5 border transition ${
              statusFilter === 'in_review' 
                ? 'bg-black text-white border-black font-bold' 
                : 'bg-white text-gray-700 border-gray-300 hover:border-black'
            }`}
          >
            Under Review
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-3 py-1.5 border transition ${
              statusFilter === 'closed' 
                ? 'bg-black text-white border-black font-bold' 
                : 'bg-white text-gray-700 border-gray-300 hover:border-black'
            }`}
          >
            Archived / Closed
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center w-full sm:w-72">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or acronym..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 focus:outline-none focus:border-black"
            />
          </div>
          <button
            type="submit"
            className="ml-2 bg-black hover:bg-gray-800 text-white text-xs font-bold px-3 py-1.5"
          >
            Go
          </button>
        </form>
      </div>

      {/* Conference List in Editorial Cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 font-serif text-lg">
          Loading academic proceedings...
        </div>
      ) : conferences.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 p-8">
          <p className="text-gray-600 font-serif text-lg mb-2">No conferences match your query</p>
          <p className="text-xs text-gray-500">Try adjusting your search criteria or resetting filters.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 border-b border-gray-200">
          {conferences.map((conf) => {
            const isOpen = conf.status === 'open';
            const closeDate = conf.submission_close_at
              ? new Date(conf.submission_close_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'TBA';

            return (
              <article key={conf.conference_id} className="py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start group">
                <div className="md:col-span-8 space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className={`px-2 py-0.5 uppercase tracking-wider text-[10px] font-bold ${
                      isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {conf.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="font-bold text-[#005a9c]">{conf.acronym} {conf.year}</span>
                  </div>

                  <h2 className="text-2xl font-black font-serif text-black leading-tight group-hover:text-[#c8102e] transition">
                    <Link href={`/conferences/${conf.conference_id}`}>
                      {conf.name}
                    </Link>
                  </h2>

                  <p className="text-sm text-gray-700 leading-relaxed pt-1 line-clamp-2">
                    {conf.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-2">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Deadline: <strong className="text-gray-800">{closeDate}</strong></span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Users className="h-3.5 w-3.5" />
                      <span>{conf.total_submissions} Papers Received</span>
                    </span>
                  </div>

                  <div className="pt-3 flex items-center space-x-4">
                    <Link
                      href={`/conferences/${conf.conference_id}`}
                      className="bg-black hover:bg-gray-800 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 transition"
                    >
                      View Details & CFP
                    </Link>
                    {isOpen && (
                      <Link
                        href={`/conferences/${conf.conference_id}/submit`}
                        className="bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold uppercase tracking-wider px-4 py-2 transition"
                      >
                        Submit Paper
                      </Link>
                    )}
                  </div>
                </div>

                {/* Right Artwork */}
                <div className="md:col-span-4 flex justify-end">
                  <div className="w-full max-w-[240px] aspect-[4/3] bg-neutral-100 border border-gray-200 p-5 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="font-serif font-black text-3xl text-gray-900">
                        {conf.acronym}
                      </span>
                      <span className="text-[11px] font-bold text-gray-600 bg-white px-2 py-0.5 border border-gray-300">
                        {conf.year}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">
                        STATUS
                      </span>
                      <span className="text-xs font-bold text-gray-900">
                        {conf.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-[#c8102e]"></div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

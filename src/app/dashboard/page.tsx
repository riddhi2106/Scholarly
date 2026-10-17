'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Calendar, Clock, Plus, Tag, Users, AlertCircle, Trash2, CheckCircle2, Bookmark, ArrowRight } from 'lucide-react';

export default function AuthorDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    try {
      const authRes = await fetch('/api/auth/session');
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push('/login');
        return;
      }
      setSession(authData.user);

      const papersRes = await fetch('/api/papers');
      const papersData = await papersRes.json();
      setPapers(papersData.papers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleWithdraw = async (paperId: number) => {
    if (!confirm('Are you sure you want to withdraw this paper submission?')) return;
    try {
      const res = await fetch(`/api/papers/${paperId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage('Paper withdrawn successfully.');
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300">
            Submitted
          </span>
        );
      case 'under_review':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
            Under Review
          </span>
        );
      case 'accepted':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-900 border border-red-300">
            Rejected
          </span>
        );
      case 'withdrawn':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-300">
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const filteredPapers = papers.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.conference_acronym.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="py-24 text-center text-gray-500 font-serif text-lg">Loading your editorial dashboard...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b-2 border-black">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            RESEARCHER PORTAL & MANUSCRIPT DOSSIER
          </span>
          <h1 className="text-4xl font-black font-serif text-black mt-1">Author Dashboard</h1>
          <p className="text-gray-600 mt-1 text-xs">
            Logged in as <strong className="text-black">{session?.fullName}</strong> ({session?.email})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/conferences"
            className="inline-flex items-center space-x-2 bg-[#c8102e] hover:bg-[#a50d26] text-white font-bold px-4 py-2.5 text-xs uppercase tracking-wider transition"
          >
            <Plus className="h-4 w-4" />
            <span>Submit to Conference</span>
          </Link>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-gray-500 hover:text-black font-bold">✕</button>
        </div>
      )}

      {/* Submissions Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
          <h2 className="text-xl font-bold font-serif text-black flex items-center space-x-2">
            <span>My Submitted Papers ({papers.length})</span>
          </h2>

          <input
            type="text"
            placeholder="Filter submissions by title or acronym..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 px-3 py-1.5 text-xs text-black placeholder-gray-400 focus:outline-none focus:border-black w-full sm:w-64"
          />
        </div>

        {filteredPapers.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-gray-300 p-8">
            <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <h3 className="text-base font-serif font-bold text-gray-800">No submissions found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              You haven&apos;t submitted any research papers yet. Browse open conferences and submit your manuscript.
            </p>
            <Link
              href="/conferences"
              className="mt-4 inline-block text-xs text-[#c8102e] hover:underline font-bold uppercase tracking-wider"
            >
              Browse Open Conferences →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 border-b border-gray-200">
            {filteredPapers.map((paper) => {
              const isSubmitter = Number(paper.creator_person_id) === session?.personId;
              const canWithdraw = isSubmitter && paper.submission_status === 'submitted';

              return (
                <div
                  key={paper.paper_id}
                  className="py-6 space-y-3 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 text-xs">
                        <span className="font-bold text-[#005a9c] uppercase tracking-wider">
                          {paper.conference_acronym} {paper.conference_year}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600">
                          {paper.conference_name}
                        </span>
                      </div>

                      <h3 className="text-xl font-serif font-bold text-black tracking-tight group-hover:text-[#c8102e] transition">
                        {paper.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(paper.submission_status)}
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                    {paper.abstract}
                  </p>

                  {/* Metadata Row: Topics & Authors */}
                  <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      {/* Topics */}
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="text-gray-500 font-semibold text-[11px]">Topics:</span>
                        {paper.topics && paper.topics.length > 0 ? (
                          paper.topics.map((t: any) => (
                            <span
                              key={t.topic_id}
                              className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-[10px] text-gray-700 font-medium"
                            >
                              {t.topic_name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400">None specified</span>
                        )}
                      </div>

                      {/* Authors */}
                      <div className="flex items-center flex-wrap gap-1.5 text-gray-600 text-[11px]">
                        <span className="font-semibold text-gray-500">Authors:</span>
                        {paper.authors &&
                          paper.authors.map((a: any, idx: number) => (
                            <span key={idx} className="text-black font-medium">
                              {a.full_name}
                              {a.is_corresponding ? ' (Corr.)' : ''}
                              {idx < paper.authors.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                      </div>
                    </div>

                    {/* Actions & Dates */}
                    <div className="flex items-center justify-between md:justify-end gap-4 text-gray-500 text-[11px]">
                      <span>
                        Submitted {new Date(paper.submitted_at).toLocaleDateString()}
                      </span>

                      {canWithdraw && (
                        <button
                          onClick={() => handleWithdraw(paper.paper_id)}
                          className="text-red-700 hover:underline flex items-center space-x-1 font-bold text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Withdraw Paper</span>
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
    </div>
  );
}

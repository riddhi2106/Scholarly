'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Calendar, Clock, Plus, Tag, Users, AlertCircle, Trash2, CheckCircle2 } from 'lucide-react';

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
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950 text-blue-400 border border-blue-800">
            Submitted
          </span>
        );
      case 'under_review':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
            Under Review
          </span>
        );
      case 'accepted':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950 text-red-400 border border-red-800">
            Rejected
          </span>
        );
      case 'withdrawn':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
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
    return <div className="py-24 text-center text-slate-500">Loading your author dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Author Dashboard</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Welcome back, <strong className="text-slate-200">{session?.fullName}</strong>. Manage your research submissions across all conferences.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/conferences"
            className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-lg shadow-blue-600/20 transition duration-150"
          >
            <Plus className="h-4 w-4" />
            <span>Submit to Conference</span>
          </Link>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-800 text-blue-300 text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Submissions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <FileText className="h-5 w-5 text-blue-400" />
            <span>My Submitted Papers ({papers.length})</span>
          </h2>

          <input
            type="text"
            placeholder="Filter submissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {filteredPapers.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">No submissions found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              You haven&apos;t submitted any research papers yet. Browse open conferences and submit your work.
            </p>
            <Link
              href="/conferences"
              className="mt-4 inline-block text-xs text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4"
            >
              Browse Open Conferences →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPapers.map((paper) => {
              const isSubmitter = Number(paper.creator_person_id) === session?.personId;
              const canWithdraw = isSubmitter && paper.submission_status === 'submitted';

              return (
                <div
                  key={paper.paper_id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition duration-150 shadow-md space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-mono font-bold uppercase px-2.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                          {paper.conference_acronym} {paper.conference_year}
                        </span>
                        <span className="text-xs text-slate-400">
                          {paper.conference_name}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-white tracking-tight">
                        {paper.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(paper.submission_status)}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                    {paper.abstract}
                  </p>

                  {/* Metadata Row: Topics & Authors */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="space-y-2">
                      {/* Topics */}
                      <div className="flex items-center flex-wrap gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        {paper.topics && paper.topics.length > 0 ? (
                          paper.topics.map((t: any) => (
                            <span
                              key={t.topic_id}
                              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300"
                            >
                              {t.topic_name}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">No topics</span>
                        )}
                      </div>

                      {/* Authors */}
                      <div className="flex items-center flex-wrap gap-1.5 text-slate-400">
                        <Users className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span>Authors:</span>
                        {paper.authors &&
                          paper.authors.map((a: any, idx: number) => (
                            <span key={idx} className="text-slate-200 font-medium">
                              {a.full_name}
                              {a.is_corresponding ? ' (Corr.)' : ''}
                              {idx < paper.authors.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                      </div>
                    </div>

                    {/* Actions & Dates */}
                    <div className="flex items-center justify-between md:justify-end gap-4 text-slate-500 text-[11px]">
                      <span>
                        Submitted {new Date(paper.submitted_at).toLocaleDateString()}
                      </span>

                      {canWithdraw && (
                        <button
                          onClick={() => handleWithdraw(paper.paper_id)}
                          className="text-red-400 hover:text-red-300 flex items-center space-x-1 font-medium transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Withdraw</span>
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

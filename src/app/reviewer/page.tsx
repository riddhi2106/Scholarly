'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Clock,
  Tag,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Users,
  Send,
} from 'lucide-react';

const RECOMMENDATIONS = [
  { value: 'strong_reject', label: 'Strong Reject' },
  { value: 'reject', label: 'Reject' },
  { value: 'weak_reject', label: 'Weak Reject' },
  { value: 'borderline', label: 'Borderline' },
  { value: 'weak_accept', label: 'Weak Accept' },
  { value: 'accept', label: 'Accept' },
  { value: 'strong_accept', label: 'Strong Accept' },
];

export default function ReviewerDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, pending: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    overallScore: 6,
    confidence: 3,
    recommendation: 'weak_accept',
    commentsToAuthors: '',
    commentsToChair: '',
  });

  const loadData = async () => {
    try {
      const authRes = await fetch('/api/auth/session');
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push('/login');
        return;
      }
      setSession(authData.user);

      const res = await fetch('/api/assignments');
      const data = await res.json();
      setAssignments(data.assignments || []);
      setSummary(data.summary || { total: 0, pending: 0, completed: 0 });
    } catch (err) {
      console.error(err);
      setError('Could not load your review queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (assignmentId: number) => {
    setError('');
    setMessage('');

    if (!form.commentsToAuthors.trim()) {
      setError('Comments to authors are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, ...form }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit review.');
        return;
      }

      setMessage('Review submitted. The assignment is now marked complete.');
      setOpenForm(null);
      setForm({
        overallScore: 6,
        confidence: 3,
        recommendation: 'weak_accept',
        commentsToAuthors: '',
        commentsToChair: '',
      });
      loadData();
    } catch (err) {
      setError('Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-gray-500 font-serif text-lg">
        Loading your review queue...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b-2 border-black">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Programme Committee
          </span>
          <h1 className="text-4xl font-black font-serif text-black mt-1">
            Reviewer Dashboard
          </h1>
          <p className="text-gray-600 mt-1 text-xs">
            {session?.fullName} &middot; {summary.pending} outstanding of {summary.total} assigned
          </p>
        </div>
      </div>

      {/* Double-blind notice */}
      <div className="flex items-start gap-3 border border-gray-300 bg-gray-50 p-4">
        <EyeOff className="h-4 w-4 text-gray-700 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-700 leading-relaxed">
          <span className="font-bold uppercase tracking-wider">Double-blind review.</span>{' '}
          Author names and affiliations are withheld. This page reads from the
          <code className="mx-1 px-1 bg-white border border-gray-300 text-[11px]">
            v_reviewer_paper_view
          </code>
          database view, which does not contain author identity columns at all, so
          identities cannot be revealed by this interface.
        </p>
      </div>

      {message && (
        <div className="flex items-center gap-2 border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {assignments.length === 0 && (
        <div className="border border-gray-300 p-12 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-gray-400" />
          <p className="mt-3 font-serif text-lg text-gray-700">No papers assigned to you.</p>
          <p className="mt-1 text-xs text-gray-500">
            Assignments are made by the programme chair using the conflict-aware
            matching procedure.
          </p>
        </div>
      )}

      {/* Assignment list */}
      <div className="space-y-5">
        {assignments.map((a) => {
          const done = Boolean(a.review_id);
          return (
            <article key={a.assignment_id} className="border border-gray-300 bg-white">
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        {a.conference_acronym} {a.conference_year}
                      </span>
                      {done ? (
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                          Review Submitted
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                          Awaiting Review
                        </span>
                      )}
                    </div>
                    <h2 className="font-serif font-bold text-xl text-black mt-2 leading-snug">
                      {a.title}
                    </h2>
                  </div>
                </div>

                <p className="text-sm text-gray-700 leading-relaxed">{a.abstract}</p>

                <div className="flex items-center gap-5 flex-wrap text-[11px] text-gray-600 pt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {a.author_count} author{Number(a.author_count) === 1 ? '' : 's'} (withheld)
                  </span>
                  {a.due_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Due {new Date(a.due_at).toLocaleDateString()}
                    </span>
                  )}
                  {Array.isArray(a.topics) && a.topics.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      {a.topics.join(', ')}
                    </span>
                  )}
                </div>

                {done ? (
                  <div className="border-t border-gray-200 pt-3 mt-3 text-xs text-gray-700">
                    <span className="font-bold uppercase tracking-wider text-gray-500">
                      Your review
                    </span>
                    <div className="mt-1.5 flex gap-5 flex-wrap">
                      <span>Score <strong>{a.overall_score}/10</strong></span>
                      <span>Confidence <strong>{a.confidence}/5</strong></span>
                      <span>
                        Recommendation{' '}
                        <strong>{String(a.recommendation).replace(/_/g, ' ')}</strong>
                      </span>
                    </div>
                  </div>
                ) : openForm === a.assignment_id ? (
                  <div className="border-t border-gray-200 pt-4 mt-3 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                          Overall score (1-10)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={form.overallScore}
                          onChange={(e) =>
                            setForm({ ...form, overallScore: Number(e.target.value) })
                          }
                          className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                          Confidence (1-5)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={form.confidence}
                          onChange={(e) =>
                            setForm({ ...form, confidence: Number(e.target.value) })
                          }
                          className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                          Recommendation
                        </span>
                        <select
                          value={form.recommendation}
                          onChange={(e) =>
                            setForm({ ...form, recommendation: e.target.value })
                          }
                          className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          {RECOMMENDATIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                        Comments to authors (required)
                      </span>
                      <textarea
                        rows={4}
                        value={form.commentsToAuthors}
                        onChange={(e) =>
                          setForm({ ...form, commentsToAuthors: e.target.value })
                        }
                        className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Returned to the authors verbatim."
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                        Confidential comments to chair (optional)
                      </span>
                      <textarea
                        rows={2}
                        value={form.commentsToChair}
                        onChange={(e) =>
                          setForm({ ...form, commentsToChair: e.target.value })
                        }
                        className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Never shown to authors."
                      />
                    </label>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSubmit(a.assignment_id)}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 bg-black text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submitting ? 'Submitting...' : 'Submit review'}
                      </button>
                      <button
                        onClick={() => setOpenForm(null)}
                        className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider border border-gray-300 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setOpenForm(a.assignment_id)}
                    className="inline-flex items-center gap-2 border border-black px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-black hover:text-white transition"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Write review
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

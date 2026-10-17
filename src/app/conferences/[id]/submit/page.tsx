'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Send, AlertCircle, CheckCircle, Tag, Users, FileText } from 'lucide-react';

function SubmitPaperContent() {
  const params = useParams();
  const router = useRouter();
  const conferenceId = params?.id;

  const [conference, setConference] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<number[]>([]);
  
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [coAuthors, setCoAuthors] = useState<{ fullName: string; email: string }[]>([]);

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // 1. Verify user is logged in
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((authData) => {
        if (!authData.authenticated) {
          router.push(`/login?redirect=/conferences/${conferenceId}/submit`);
        } else {
          setSession(authData.user);
        }
      });

    // 2. Fetch Conference
    fetch(`/api/conferences/${conferenceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.conference) setConference(data.conference);
      });

    // 3. Fetch Topics
    fetch('/api/topics')
      .then((res) => res.json())
      .then((data) => {
        if (data?.topics) setTopics(data.topics);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [conferenceId, router]);

  const toggleTopic = (topicId: number) => {
    setSelectedTopics((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  const addCoAuthor = () => {
    setCoAuthors([...coAuthors, { fullName: '', email: '' }]);
  };

  const removeCoAuthor = (idx: number) => {
    setCoAuthors(coAuthors.filter((_, i) => i !== idx));
  };

  const updateCoAuthor = (idx: number, field: 'fullName' | 'email', value: string) => {
    const updated = [...coAuthors];
    updated[idx][field] = value;
    setCoAuthors(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedTopics.length === 0) {
      setError('Please select at least one research topic for your submission.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conferenceId: Number(conferenceId),
          title,
          abstract,
          topicIds: selectedTopics,
          coAuthors,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-slate-500">Preparing submission form...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href={`/conferences/${conferenceId}`}
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to {conference?.acronym || 'Conference'}</span>
      </Link>

      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 pb-6 border-b border-slate-800">
          <span className="text-xs font-mono font-bold uppercase px-2.5 py-1 rounded bg-blue-950 text-blue-400 border border-blue-800">
            {conference?.acronym} {conference?.year}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-2">Submit New Research Paper</h1>
          <p className="text-xs text-slate-400 mt-1">
            Fill in the metadata, select matching research topics, and add co-authors. All submissions are stored with full transactional guarantees.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
            <span>Paper submitted successfully! Redirecting to your author dashboard...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Paper Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Paper Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Adaptive Indexing for High-Throughput Stream Processing"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Abstract */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Abstract *
            </label>
            <textarea
              required
              rows={5}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Describe your research problem, methodology, key findings, and empirical results..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed"
            ></textarea>
          </div>

          {/* Topics Multi-Select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center space-x-1.5">
              <Tag className="h-3.5 w-3.5 text-blue-400" />
              <span>Research Topics (Select all that apply) *</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => {
                const isSelected = selectedTopics.includes(topic.topic_id);
                return (
                  <button
                    type="button"
                    key={topic.topic_id}
                    onClick={() => toggleTopic(topic.topic_id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition duration-150 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {topic.topic_name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Authors List */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                <Users className="h-3.5 w-3.5 text-blue-400" />
                <span>Authors & Co-Authors</span>
              </label>
              <button
                type="button"
                onClick={addCoAuthor}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Co-Author</span>
              </button>
            </div>

            {/* Submitter (Author 1 - Corresponding) */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 mb-3 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-white block">
                  1. {session?.fullName} (You)
                </span>
                <span className="text-slate-500 text-[11px]">{session?.email}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 uppercase">
                Corresponding Author
              </span>
            </div>

            {/* Additional Co-authors */}
            {coAuthors.map((co, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 mb-2 flex items-center gap-3 text-xs"
              >
                <span className="font-mono text-slate-500 w-4">{idx + 2}.</span>
                <input
                  type="text"
                  required
                  placeholder="Co-Author Full Name"
                  value={co.fullName}
                  onChange={(e) => updateCoAuthor(idx, 'fullName', e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="email"
                  required
                  placeholder="coauthor@institution.edu"
                  value={co.email}
                  onChange={(e) => updateCoAuthor(idx, 'email', e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeCoAuthor(idx)}
                  className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                  title="Remove author"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={submitting || success}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
            >
              {submitting ? (
                <span>Submitting to PostgreSQL...</span>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Submit Paper for Review</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SubmitPaperPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-500">Loading submission form...</div>}>
      <SubmitPaperContent />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Send, AlertCircle, CheckCircle, Tag, Users, FileText, ChevronLeft } from 'lucide-react';

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
    return <div className="py-24 text-center text-gray-500 font-serif text-lg">Preparing submission portal...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <Link
        href={`/conferences/${conferenceId}`}
        className="inline-flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-black transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Back to {conference?.acronym || 'Conference'}</span>
      </Link>

      <div className="bg-white border-2 border-black p-8 sm:p-10 shadow-sm">
        <div className="mb-8 pb-6 border-b border-gray-200">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black bg-gray-100 px-2.5 py-1 border border-gray-300">
            {conference?.acronym} {conference?.year} • MANUSCRIPT SUBMISSION
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif font-black text-black mt-3">
            Submit Research Manuscript
          </h1>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            All submissions are processed under atomic PostgreSQL stored procedures with deferred unique constraint validation and full audit tracking.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>Paper recorded in PostgreSQL! Redirecting to your dashboard...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Paper Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
              Paper Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Adaptive Indexing for High-Throughput Stream Processing"
              className="w-full bg-white border border-gray-400 p-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black"
            />
          </div>

          {/* Abstract */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
              Abstract *
            </label>
            <textarea
              required
              rows={5}
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Describe your research problem, methodology, key findings, and empirical results..."
              className="w-full bg-white border border-gray-400 p-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-black leading-relaxed"
            ></textarea>
          </div>

          {/* Topics Multi-Select */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2 flex items-center space-x-1.5">
              <Tag className="h-3.5 w-3.5 text-black" />
              <span>Research Topics (Select all that apply) *</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {topics.map((topic) => {
                const isSelected = selectedTopics.includes(topic.topic_id);
                return (
                  <button
                    type="button"
                    key={topic.topic_id}
                    onClick={() => toggleTopic(topic.topic_id)}
                    className={`text-xs px-3 py-1.5 border font-semibold transition ${
                      isSelected
                        ? 'bg-black text-white border-black'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-black'
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
              <label className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center space-x-1.5">
                <Users className="h-3.5 w-3.5 text-black" />
                <span>Authors & Order</span>
              </label>
              <button
                type="button"
                onClick={addCoAuthor}
                className="text-xs text-[#005a9c] hover:underline flex items-center space-x-1 font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Co-Author</span>
              </button>
            </div>

            {/* Submitter (Author 1 - Corresponding) */}
            <div className="p-4 bg-gray-50 border border-gray-300 mb-3 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-black block text-sm">
                  1. {session?.fullName} (You)
                </span>
                <span className="text-gray-500 text-xs">{session?.email}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-black text-white uppercase tracking-wider">
                Corresponding Author
              </span>
            </div>

            {/* Additional Co-authors */}
            {coAuthors.map((co, idx) => (
              <div
                key={idx}
                className="p-3 bg-white border border-gray-300 mb-2 flex items-center gap-3 text-xs"
              >
                <span className="font-bold text-gray-500 w-4">{idx + 2}.</span>
                <input
                  type="text"
                  required
                  placeholder="Co-Author Full Name"
                  value={co.fullName}
                  onChange={(e) => updateCoAuthor(idx, 'fullName', e.target.value)}
                  className="flex-1 border border-gray-300 p-2 text-black focus:outline-none focus:border-black text-xs"
                />
                <input
                  type="email"
                  required
                  placeholder="coauthor@institution.edu"
                  value={co.email}
                  onChange={(e) => updateCoAuthor(idx, 'email', e.target.value)}
                  className="flex-1 border border-gray-300 p-2 text-black focus:outline-none focus:border-black text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeCoAuthor(idx)}
                  className="text-gray-400 hover:text-red-600 p-1 transition"
                  title="Remove author"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={submitting || success}
              className="w-full bg-[#c8102e] hover:bg-[#a50d26] text-white font-bold text-xs uppercase tracking-wider py-3.5 transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {submitting ? (
                <span>Executing Stored Procedure...</span>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Submit Manuscript for Double-Blind Review</span>
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
    <Suspense fallback={<div className="py-24 text-center text-gray-500 font-serif">Loading submission portal...</div>}>
      <SubmitPaperContent />
    </Suspense>
  );
}

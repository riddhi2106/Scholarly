'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Calendar, Clock, FileText, ArrowRight, Shield, Award, Users } from 'lucide-react';

function ConferenceDetailContent() {
  const params = useParams();
  const id = params?.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/conferences/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-24 text-center text-slate-500">Loading conference details...</div>;
  }

  if (!data || !data.conference) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-bold text-white">Conference Not Found</h2>
        <Link href="/conferences" className="text-blue-400 text-sm mt-3 inline-block">
          ← Back to all conferences
        </Link>
      </div>
    );
  }

  const { conference, members } = data;
  const isOpen = conference.status === 'open';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <span className="text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-blue-950 text-blue-400 border border-blue-800">
            {conference.acronym} {conference.year}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              isOpen
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {conference.status.replace('_', ' ')}
          </span>
        </div>

        <h1 className="text-3xl font-extrabold text-white tracking-tight">{conference.name}</h1>
        <p className="text-slate-300 text-sm mt-3 leading-relaxed max-w-3xl">{conference.description}</p>

        {isOpen && (
          <div className="mt-6 flex items-center gap-4">
            <Link
              href={`/conferences/${conference.conference_id}/submit`}
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm shadow-lg shadow-blue-600/30 transition duration-150"
            >
              <span>Submit a Paper</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Grid: Dates & Members */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Important Deadlines Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-md">
          <h2 className="text-base font-bold text-white flex items-center space-x-2 mb-4">
            <Clock className="h-5 w-5 text-blue-400" />
            <span>Important Milestones & Deadlines</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Submission Opens:</span>
              <span className="font-semibold text-slate-200">
                {new Date(conference.submission_open_at).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Submission Closes:</span>
              <span className="font-semibold text-emerald-400">
                {new Date(conference.submission_close_at).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Reviews & Decision Deadline:</span>
              <span className="font-semibold text-slate-200">
                {new Date(conference.review_deadline).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Total Submissions:</span>
              <span className="font-bold text-blue-400">{conference.total_submissions} Papers</span>
            </div>
          </div>
        </div>

        {/* Organizing Committee Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-md">
          <h2 className="text-base font-bold text-white flex items-center space-x-2 mb-4">
            <Users className="h-5 w-5 text-blue-400" />
            <span>Organizing Committee & Reviewers</span>
          </h2>

          {members && members.length > 0 ? (
            <div className="space-y-3">
              {members.map((m: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200 block">{m.full_name}</span>
                    <span className="text-slate-500 text-[11px]">{m.email}</span>
                  </div>
                  <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center">Committee details pending announcement.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConferenceDetailPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-500">Loading conference...</div>}>
      <ConferenceDetailContent />
    </Suspense>
  );
}

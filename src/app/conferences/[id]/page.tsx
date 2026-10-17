'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Calendar, Clock, FileText, ArrowRight, Shield, Award, Users, ChevronLeft, Bookmark } from 'lucide-react';

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
    return <div className="py-24 text-center text-gray-500 font-serif text-lg">Loading conference proceedings...</div>;
  }

  if (!data || !data.conference) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-2xl font-serif font-bold text-black">Conference Not Found</h2>
        <Link href="/conferences" className="text-[#c8102e] text-xs font-bold uppercase mt-4 inline-block hover:underline">
          ← Back to all conferences
        </Link>
      </div>
    );
  }

  const { conference, members } = data;
  const isOpen = conference.status === 'open';

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      {/* Back Link */}
      <div>
        <Link 
          href="/conferences" 
          className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-black flex items-center space-x-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>All Conferences</span>
        </Link>
      </div>

      {/* Main Masthead / Article Style Header */}
      <div className="border-b-2 border-black pb-8 space-y-4">
        <div className="flex items-center space-x-3 text-xs">
          <span className="font-bold text-[#005a9c] uppercase tracking-wider">
            {conference.acronym} {conference.year}
          </span>
          <span className="text-gray-400">•</span>
          <span className={`px-2 py-0.5 uppercase tracking-wider text-[10px] font-bold ${
            isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
          }`}>
            {conference.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black font-serif text-black leading-tight">
          {conference.name}
        </h1>

        <p className="text-base text-gray-700 leading-relaxed font-sans pt-2">
          {conference.description}
        </p>

        {/* Action Row */}
        <div className="flex flex-wrap items-center gap-4 pt-4">
          {isOpen ? (
            <Link
              href={`/conferences/${conference.conference_id}/submit`}
              className="bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold uppercase tracking-wider px-6 py-3 transition shadow-sm flex items-center space-x-2"
            >
              <span>Submit Manuscript</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="bg-gray-100 text-gray-600 text-xs font-bold uppercase tracking-wider px-4 py-2.5 border border-gray-300">
              Submissions Closed
            </span>
          )}

          <button className="flex items-center space-x-1 text-xs font-semibold text-gray-700 hover:text-black border border-gray-300 px-4 py-2.5">
            <Bookmark className="h-4 w-4" />
            <span>Save to Reading List</span>
          </button>
        </div>
      </div>

      {/* Editorial Timeline & Specifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-gray-200 p-6 bg-gray-50 space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
            SUBMISSION WINDOW OPENS
          </span>
          <div className="text-base font-bold text-gray-900">
            {conference.submission_open_at
              ? new Date(conference.submission_open_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'N/A'}
          </div>
          <p className="text-xs text-gray-500">Submissions open for multi-author papers</p>
        </div>

        <div className="border border-gray-200 p-6 bg-gray-50 space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
            FINAL SUBMISSION DEADLINE
          </span>
          <div className="text-base font-bold text-black">
            {conference.submission_close_at
              ? new Date(conference.submission_close_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'N/A'}
          </div>
          <p className="text-xs text-gray-500">Hard deadline enforced by trigger constraints</p>
        </div>

        <div className="border border-gray-200 p-6 bg-gray-50 space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
            PEER REVIEW DECISION
          </span>
          <div className="text-base font-bold text-gray-900">
            {conference.review_deadline
              ? new Date(conference.review_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'N/A'}
          </div>
          <p className="text-xs text-gray-500">Double-blind review notification</p>
        </div>
      </div>

      {/* Committee & Review Board */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-black" />
          <h2 className="text-xl font-bold font-serif text-black">Program Committee & Editorial Board</h2>
        </div>
        <p className="text-xs text-gray-600">
          Verified academic members enrolled via <code className="bg-gray-100 px-1 py-0.5 text-black font-mono">CONFERENCE_MEMBERSHIPS</code> relational integrity.
        </p>

        {members && members.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {members.map((m: any, idx: number) => (
              <div key={idx} className="border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-black">{m.full_name}</h3>
                  <p className="text-xs text-gray-500">{m.affiliation_name || 'Academic Institution'}</p>
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-200">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">No public committee members listed yet.</p>
        )}
      </div>
    </div>
  );
}

export default function ConferenceDetailPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-gray-500 font-serif">Loading...</div>}>
      <ConferenceDetailContent />
    </Suspense>
  );
}

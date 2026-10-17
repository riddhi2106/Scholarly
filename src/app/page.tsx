import Link from 'next/link';
import { Bookmark, Share2, FileText, Calendar, ArrowRight, ShieldCheck, CheckCircle2, Send, Clock, Users, Database } from 'lucide-react';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getHomePageData() {
  try {
    const conferencesRes = await query(`
      SELECT 
        c.conference_id,
        c.name,
        c.acronym,
        c.year,
        c.description,
        c.submission_open_at,
        c.submission_close_at,
        c.review_deadline,
        c.status,
        COUNT(p.paper_id)::INT AS submissions_count
      FROM CONFERENCES c
      LEFT JOIN PAPERS p ON c.conference_id = p.conference_id
      GROUP BY c.conference_id
      ORDER BY c.year DESC, c.conference_id ASC
    `);

    const papersRes = await query(`
      SELECT 
        p.paper_id,
        p.title,
        p.abstract,
        p.submission_status,
        p.submitted_at,
        c.conference_id,
        c.name AS conference_name,
        c.acronym AS conference_acronym,
        c.year AS conference_year,
        creator.full_name AS creator_name,
        COALESCE(
          json_agg(DISTINCT t.topic_name) FILTER (WHERE t.topic_name IS NOT NULL), '[]'::json
        ) AS topic_names
      FROM PAPERS p
      JOIN CONFERENCES c ON p.conference_id = c.conference_id
      JOIN PEOPLE creator ON p.created_by_person_id = creator.person_id
      LEFT JOIN PAPER_TOPICS pt ON p.paper_id = pt.paper_id
      LEFT JOIN TOPICS t ON pt.topic_id = t.topic_id
      GROUP BY p.paper_id, c.conference_id, creator.full_name
      ORDER BY p.submitted_at DESC
      LIMIT 8
    `);

    return {
      conferences: conferencesRes.rows,
      papers: papersRes.rows,
    };
  } catch (err) {
    console.error('Error fetching home page data:', err);
    return { conferences: [], papers: [] };
  }
}

export default async function HomePage() {
  const { conferences, papers } = await getHomePageData();

  // Find the featured open conference, or fallback to the first one
  const featuredConf = conferences.find((c) => c.status === 'open') || conferences[0];

  const featuredDeadline = featuredConf?.submission_close_at
    ? new Date(featuredConf.submission_close_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Open for submissions';

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Editorial Main Heading */}
      <div className="pt-2 pb-6 border-b border-black mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            ACADEMIC PROCEEDINGS & MANUSCRIPT DOSSIER
          </span>
          <h1 className="text-3xl sm:text-5xl font-black font-serif tracking-tight text-black mt-1">
            Conference Proceedings
          </h1>
        </div>
        <p className="text-xs text-gray-600 max-w-md font-sans">
          Real-time paper submissions, double-blind peer review pipelines, and relational database integrity backed by PostgreSQL.
        </p>
      </div>

      {/* Featured Conference Call For Papers Banner Card */}
      {featuredConf && (
        <div className="bg-[#f4f5f7] p-6 sm:p-8 border-t-2 border-black mb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <span className="inline-block bg-[#0f3b73] text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">
                  FEATURED CALL FOR PAPERS · OPEN SUBMISSIONS
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-serif font-black text-gray-900 leading-tight">
                <Link href={`/conferences/${featuredConf.conference_id}`} className="hover:underline">
                  {featuredConf.name} ({featuredConf.acronym} {featuredConf.year})
                </Link>
              </h2>

              <p className="text-xs uppercase font-bold tracking-wider text-gray-600">
                DEADLINE: {featuredDeadline.toUpperCase()} • {featuredConf.submissions_count} PAPERS SUBMITTED
              </p>

              <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                {featuredConf.description || 'Premier international forum for database researchers, practitioners, and vendors.'}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href={`/conferences/${featuredConf.conference_id}/submit`}
                  className="bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 transition flex items-center space-x-1.5 shadow-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit Paper</span>
                </Link>
                <Link
                  href={`/conferences/${featuredConf.conference_id}`}
                  className="bg-black hover:bg-gray-800 text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 transition flex items-center space-x-1"
                >
                  <span>View Conference Details</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Card Visual */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-sm aspect-[16/11] bg-[#0c1e38] text-white p-6 flex flex-col justify-between shadow-md relative overflow-hidden border border-gray-300">
                {/* Decorative geometry */}
                <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full border-4 border-blue-500/20"></div>
                <div className="absolute -right-2 -bottom-2 w-24 h-24 rounded-full border-2 border-cyan-400/30"></div>

                <div className="space-y-1 relative z-10">
                  <span className="text-[10px] tracking-widest uppercase text-blue-300 font-bold block">
                    CALL FOR PAPERS
                  </span>
                  <h3 className="text-xl font-serif font-black text-white leading-snug">
                    {featuredConf.acronym} {featuredConf.year}
                  </h3>
                  <p className="text-xs text-gray-300 line-clamp-2">
                    {featuredConf.name}
                  </p>
                </div>

                <div className="relative z-10 pt-4 border-t border-blue-900/60 flex items-center justify-between text-[11px] text-gray-300">
                  <span>Submissions Open</span>
                  <span className="font-bold text-white tracking-widest text-[9px] bg-[#c8102e] px-2 py-0.5 uppercase">
                    ACTIVE CFP
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Main Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-2">
        <h2 className="text-xl font-serif font-bold text-black">
          Active Conferences & Calls for Papers
        </h2>
        <Link href="/conferences" className="text-xs font-bold uppercase tracking-wider text-[#c8102e] hover:underline">
          View All Conferences ({conferences.length}) →
        </Link>
      </div>

      {/* Conferences List */}
      <div className="divide-y divide-gray-200 border-b border-gray-200 mb-16">
        {conferences.map((conf) => {
          const isOpen = conf.status === 'open';
          const deadline = conf.submission_close_at 
            ? new Date(conf.submission_close_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'TBA';

          return (
            <article key={conf.conference_id} className="py-7 grid grid-cols-1 md:grid-cols-12 gap-6 items-start group">
              <div className="md:col-span-8 space-y-2">
                {/* Kicker */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className={`px-2 py-0.5 uppercase tracking-wider text-[10px] font-bold ${
                    isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {isOpen ? 'Call for Papers Open' : conf.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="text-[#005a9c] font-bold">{conf.acronym} {conf.year}</span>
                </div>

                {/* Title */}
                <h3 className="text-2xl font-black font-serif text-black leading-tight group-hover:text-[#c8102e] transition">
                  <Link href={`/conferences/${conf.conference_id}`}>
                    {conf.name}
                  </Link>
                </h3>

                {/* Byline */}
                <div className="text-xs space-x-2 text-gray-600">
                  <span className="font-bold text-gray-800 uppercase tracking-wider">SUBMISSION DEADLINE:</span>
                  <span className="font-semibold text-black">{deadline}</span>
                  <span className="text-gray-400">•</span>
                  <span>{conf.submissions_count} papers submitted</span>
                </div>

                {/* Excerpt */}
                <p className="text-sm text-gray-700 leading-relaxed pt-1 line-clamp-2">
                  {conf.description || 'International academic conference proceedings managed under PostgreSQL relational schema.'}
                </p>

                {/* Bottom Actions */}
                <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
                  <Link 
                    href={`/conferences/${conf.conference_id}`}
                    className="font-bold text-black hover:text-[#c8102e] flex items-center space-x-1"
                  >
                    <span>View Conference Timeline</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {isOpen && (
                    <Link
                      href={`/conferences/${conf.conference_id}/submit`}
                      className="bg-[#c8102e] hover:bg-[#a50d26] text-white px-3 py-1 font-bold uppercase tracking-wider text-[11px]"
                    >
                      Submit Paper
                    </Link>
                  )}
                </div>
              </div>

              {/* Right Thumbnail Graphic */}
              <div className="md:col-span-4 flex justify-end">
                <div className="w-full max-w-[220px] aspect-[4/3] bg-neutral-50 border border-gray-200 flex flex-col justify-between p-4">
                  <div className="flex justify-between items-start">
                    <span className="font-serif font-black text-2xl text-black">
                      {conf.acronym}
                    </span>
                    <span className="text-[10px] font-bold text-gray-600 bg-white px-1.5 py-0.5 border border-gray-300">
                      {conf.year}
                    </span>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                      CONFERENCE TRACK
                    </div>
                    <div className="text-xs font-bold text-gray-800 line-clamp-1">
                      {conf.name}
                    </div>
                  </div>
                  <div className="h-1 w-full bg-[#c8102e]"></div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Recent Submissions Feed */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-2">
        <h2 className="text-xl font-serif font-bold text-black">
          Recent Manuscript Submissions
        </h2>
        <Link href="/dashboard" className="text-xs font-bold uppercase tracking-wider text-[#c8102e] hover:underline">
          My Author Dashboard →
        </Link>
      </div>

      <div className="divide-y divide-gray-200 border-b border-gray-200 mb-16">
        {papers.map((paper) => {
          return (
            <article key={paper.paper_id} className="py-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start group">
              <div className="md:col-span-8 space-y-2">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-[#005a9c] uppercase tracking-wider">
                    {paper.conference_acronym} {paper.conference_year}
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="text-emerald-700 font-bold uppercase text-[10px] bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                    {paper.submission_status}
                  </span>
                </div>

                <h3 className="text-xl font-serif font-bold text-black leading-tight group-hover:text-[#c8102e] transition">
                  <Link href={`/conferences/${paper.conference_id}`}>
                    {paper.title}
                  </Link>
                </h3>

                <div className="text-xs space-x-2 text-gray-600">
                  <span className="font-bold text-gray-800">Submitted by:</span>
                  <span className="font-medium text-black">{paper.creator_name}</span>
                  <span className="text-gray-400">•</span>
                  <span>{new Date(paper.submitted_at).toLocaleDateString()}</span>
                </div>

                <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                  {paper.abstract}
                </p>

                {paper.topic_names && paper.topic_names.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {paper.topic_names.map((tName: string, idx: number) => (
                      <span key={idx} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 border border-gray-200">
                        {tName}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Thumbnail Graphic */}
              <div className="md:col-span-4 flex justify-end">
                <div className="w-full max-w-[220px] aspect-[4/3] bg-gray-50 border border-gray-200 p-4 flex flex-col justify-between">
                  <div className="flex items-center space-x-1 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                    <FileText className="h-3.5 w-3.5 text-gray-700" />
                    <span>MANUSCRIPT #{paper.paper_id}</span>
                  </div>
                  <div className="text-xs font-serif font-bold text-gray-900 line-clamp-2">
                    {paper.title}
                  </div>
                  <div className="text-[10px] text-gray-500 pt-2 border-t border-gray-200 flex justify-between">
                    <span>{paper.conference_acronym}</span>
                    <span className="font-bold text-black">{paper.submission_status}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Relational Database Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t-2 border-black">
        <div className="p-5 border border-gray-200 bg-gray-50 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#005a9c] block">
            DATA INTEGRITY
          </span>
          <h4 className="text-base font-serif font-bold text-black">Relational Schema</h4>
          <p className="text-xs text-gray-600 leading-relaxed">
            Strict foreign keys, deferred unique author orders, check constraints, and trigger cascades across 20 tables.
          </p>
        </div>

        <div className="p-5 border border-gray-200 bg-gray-50 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#005a9c] block">
            ACID PIPELINE
          </span>
          <h4 className="text-base font-serif font-bold text-black">Stored Procedures</h4>
          <p className="text-xs text-gray-600 leading-relaxed">
            Atomic stored procedures execute multi-table paper creation, author orders, and topic tagging with automatic rollback.
          </p>
        </div>

        <div className="p-5 border border-gray-200 bg-gray-50 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#005a9c] block">
            SEMANTIC MATCHING
          </span>
          <h4 className="text-base font-serif font-bold text-black">pgvector HNSW Index</h4>
          <p className="text-xs text-gray-600 leading-relaxed">
            High-dimensional cosine distance similarity indexing for semantic paper-reviewer matching and keyword search.
          </p>
        </div>
      </div>
    </div>
  );
}

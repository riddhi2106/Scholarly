'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, Menu, X, User, LogOut, BookOpen, FileText, Send, Calendar, CheckSquare } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data) => {
        if (data.authenticated) setSession(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'POST' });
    setSession(null);
    router.push('/login');
    router.refresh();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/conferences?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  return (
    <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-50">
      {/* Top Main Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Left: Clean Scholarly Wordmark & Academic Identity */}
          <div className="flex items-center space-x-4 sm:space-x-6">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-800 transition"
              title="Navigation menu"
              aria-label="Navigation menu"
            >
              {menuOpen ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : <Menu className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>

            <Link href="/" className="group flex items-center space-x-3">
              <div className="h-9 w-9 bg-black text-white flex items-center justify-center font-serif font-black text-lg border border-black shadow-xs">
                S
              </div>
              <div className="flex flex-col">
                <span className="font-serif font-black text-xl sm:text-2xl tracking-tight text-black leading-none group-hover:text-[#c8102e] transition">
                  SCHOLARLY
                </span>
                <span className="text-[9px] sm:text-[10px] font-sans uppercase font-bold tracking-widest text-gray-500 mt-0.5">
                  Conference & Peer-Review Platform
                </span>
              </div>
            </Link>
          </div>

          {/* Right: Submit Paper CTA, Sign In / Dashboard, Search */}
          <div className="flex items-center space-x-3 sm:space-x-5">
            {/* Primary Action Button: Submit Paper */}
            <Link
              href="/conferences?status=open"
              className="bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold tracking-wider uppercase px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-sm transition duration-150 shadow-sm flex items-center space-x-1.5"
            >
              <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Submit Paper</span>
            </Link>

            {/* Authentication Status / Profile */}
            {!loading && (
              <>
                {session ? (
                  <div className="flex items-center space-x-2 text-xs">
                    <Link
                      href="/dashboard"
                      className="flex items-center space-x-1.5 font-semibold text-gray-900 hover:text-[#c8102e] transition px-2 py-1 border border-gray-200 rounded-sm bg-gray-50"
                    >
                      <User className="h-3.5 w-3.5 text-gray-600" />
                      <span className="hidden md:inline">{session.fullName}</span>
                      <span className="md:hidden">Dashboard</span>
                      {session.role === 'admin' && (
                        <span className="text-[9px] bg-red-100 text-[#c8102e] font-bold px-1 rounded">
                          ADMIN
                        </span>
                      )}
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="text-gray-500 hover:text-red-600 p-1.5 rounded transition"
                      title="Log Out"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="text-xs font-bold text-gray-800 hover:text-black uppercase tracking-wider px-2 py-1 transition"
                  >
                    Sign In
                  </Link>
                )}
              </>
            )}

            {/* Search Icon */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-gray-800 hover:text-black p-1.5 border border-gray-200 rounded-sm hover:bg-gray-50 transition"
              title="Search Conferences & Papers"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Expandable Search Input Bar */}
        {searchOpen && (
          <form onSubmit={handleSearch} className="py-3 border-t border-gray-200 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conferences by acronym, title, or topic (e.g. 'VLDB', 'PostgreSQL', 'Indexing')..."
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:border-black font-sans"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="bg-black hover:bg-gray-800 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-2"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* Secondary Row: Conference Paper Checker Tabs Only */}
      <div className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center space-x-6 sm:space-x-8 overflow-x-auto py-2.5 text-xs font-medium text-gray-700 whitespace-nowrap scrollbar-none">
            <Link
              href="/"
              className={`hover:text-black transition flex items-center space-x-1.5 ${
                pathname === '/' ? 'text-black font-bold border-b-2 border-black pb-0.5' : ''
              }`}
            >
              <span>Overview</span>
            </Link>
            <Link
              href="/conferences"
              className={`hover:text-black transition flex items-center space-x-1.5 ${
                pathname === '/conferences' ? 'text-black font-bold border-b-2 border-black pb-0.5' : ''
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-gray-500" />
              <span>All Conferences</span>
            </Link>
            <Link
              href="/conferences?status=open"
              className="hover:text-black transition flex items-center space-x-1.5"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Open Calls for Papers</span>
            </Link>
            <Link
              href="/dashboard"
              className={`hover:text-black transition flex items-center space-x-1.5 ${
                pathname === '/dashboard' ? 'text-black font-bold border-b-2 border-black pb-0.5' : ''
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-gray-500" />
              <span>Track My Submissions</span>
            </Link>
          </nav>
        </div>
      </div>

      {/* Drawer Overlay Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" onClick={() => setMenuOpen(false)}>
          <div 
            className="w-80 max-w-[85vw] h-full bg-white shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 bg-black text-white flex items-center justify-center font-serif font-black text-sm">
                  S
                </div>
                <span className="font-serif font-black text-lg tracking-wider text-black">SCHOLARLY</span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            <div className="space-y-6 text-sm">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Conference Management</h3>
                <ul className="space-y-2">
                  <li><Link href="/conferences" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">All Conferences Index</Link></li>
                  <li><Link href="/conferences?status=open" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">Open for Submissions</Link></li>
                  <li><Link href="/conferences?status=in_review" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">In Peer Review</Link></li>
                  <li><Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">Author Dashboard</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Research Domains</h3>
                <ul className="space-y-2">
                  <li><Link href="/conferences?search=Database" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">Database Systems & ACID</Link></li>
                  <li><Link href="/conferences?search=Vector" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">pgvector & Semantic Indexing</Link></li>
                  <li><Link href="/conferences?search=Distributed" onClick={() => setMenuOpen(false)} className="block py-1 hover:text-[#c8102e]">Distributed Transactions</Link></li>
                </ul>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Account</h3>
                {session ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">Logged in as <span className="font-bold text-black">{session.fullName}</span></p>
                    <button 
                      onClick={() => { handleLogout(); setMenuOpen(false); }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Log out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link href="/login" onClick={() => setMenuOpen(false)} className="block text-[#c8102e] font-semibold">Sign In</Link>
                    <Link href="/register" onClick={() => setMenuOpen(false)} className="block text-gray-700">Register Author Account</Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

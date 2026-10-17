'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, User, LogOut, FileText, Calendar, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">Scholarly</span>
              <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-400 font-semibold border border-blue-700/50">ConfDB</span>
            </Link>

            <div className="hidden md:flex ml-8 space-x-1">
              <Link
                href="/conferences"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith('/conferences')
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>Conferences</span>
                </div>
              </Link>

              {session && (
                <Link
                  href="/dashboard"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === '/dashboard'
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FileText className="h-4 w-4" />
                    <span>My Dashboard</span>
                  </div>
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {!loading && (
              <>
                {session ? (
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-sm text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
                      <User className="h-4 w-4 text-blue-400" />
                      <span className="font-medium text-white">{session.fullName}</span>
                      {session.role === 'admin' && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          Admin
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Log out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Link
                      href="/login"
                      className="text-sm font-medium text-slate-300 hover:text-white px-3 py-2 rounded-md hover:bg-slate-800/60 transition-colors"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/register"
                      className="text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg shadow-sm transition-colors"
                    >
                      Register
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

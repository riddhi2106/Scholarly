'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/30">
          <BookOpen className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Welcome Back</h1>
        <p className="text-sm text-slate-400 mt-1">Sign in to your Scholarly author account</p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-sm flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="h-5 w-5 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. riddhi@pes.edu"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="h-5 w-5 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl transition duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
        >
          {loading ? (
            <span>Signing in...</span>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-800/80 text-center text-xs text-slate-400">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-4">
          Register now
        </Link>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
        <span className="font-semibold text-slate-300">Demo Seed Login:</span><br />
        Email: <code className="text-blue-300">riddhi@pes.edu</code><br />
        Password: <code className="text-blue-300">Password123!</code>
      </div>
    </div>
  );
}

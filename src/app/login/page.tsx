'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

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
    <div className="max-w-md mx-auto my-12 bg-white border-2 border-black p-8 sm:p-10 shadow-sm">
      <div className="text-center mb-8 pb-6 border-b border-gray-200">
        <span className="text-[10px] font-bold uppercase tracking-widest text-black bg-gray-100 px-2.5 py-1 border border-gray-300 inline-block mb-3">
          SCHOLARLY REVIEW DESK
        </span>
        <h1 className="text-3xl font-black font-serif text-black">Sign In</h1>
        <p className="text-xs text-gray-600 mt-2">
          Access your researcher profile, paper submissions, and peer-review tasks
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
            Institutional Email Address
          </label>
          <div className="relative">
            <Mail className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. riddhi@mit.edu"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-400 text-black placeholder-gray-400 focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-400 text-black placeholder-gray-400 focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#c8102e] hover:bg-[#a50d26] text-white font-bold text-xs uppercase tracking-wider py-3.5 transition flex items-center justify-center space-x-2 disabled:opacity-50 mt-6 shadow-sm"
        >
          {loading ? (
            <span>Authenticating...</span>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-bold text-black hover:text-[#c8102e] underline">
          Register new researcher profile
        </Link>
      </div>

      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 text-[11px] text-gray-500">
        <strong className="text-gray-800 block mb-1">Demo Credentials:</strong>
        <span className="block">Author: <code className="text-black font-semibold">riddhi@example.com</code> / <code className="text-black font-semibold">password123</code></span>
        <span className="block">Admin: <code className="text-black font-semibold">admin@scholarly.org</code> / <code className="text-black font-semibold">admin123</code></span>
      </div>
    </div>
  );
}

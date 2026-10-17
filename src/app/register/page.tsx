'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User, ArrowRight, AlertCircle } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
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
          MEMBERSHIP & AUTHOR REGISTRATION
        </span>
        <h1 className="text-3xl font-black font-serif text-black">Create Account</h1>
        <p className="text-xs text-gray-600 mt-2">
          Join Scholarly as an academic author, reviewer, or conference chair
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
            Full Name & Academic Title
          </label>
          <div className="relative">
            <User className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Prof. Alan Turing"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-400 text-black placeholder-gray-400 focus:outline-none focus:border-black"
            />
          </div>
        </div>

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
              placeholder="e.g. turing@cambridge.ac.uk"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-400 text-black placeholder-gray-400 focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-2">
            Password (Min 8 Characters)
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
            <span>Creating Relational Profile...</span>
          ) : (
            <>
              <span>Complete Registration</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-black hover:text-[#c8102e] underline">
          Sign In
        </Link>
      </div>
    </div>
  );
}

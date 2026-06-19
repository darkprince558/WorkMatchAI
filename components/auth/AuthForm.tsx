'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BriefcaseBusiness, Loader2, LockKeyhole } from 'lucide-react';

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === 'sign-up';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        emailConfirmationRequired?: boolean;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Authentication failed.');
        return;
      }

      if (payload.emailConfirmationRequired) {
        setNotice('Account created. Check your email to confirm the account before signing in.');
        return;
      }

      window.location.href = safeNextPath(searchParams.get('next'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="bg-gray-900 text-white px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-red-600 flex items-center justify-center">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">WorkMatch AI</h1>
              <p className="text-xs text-gray-300">Secure workforce matching workspace</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-gray-900">
              <LockKeyhole className="h-4 w-4 text-red-600" />
              <h2 className="text-lg font-bold">{isSignUp ? 'Create an account' : 'Sign in'}</h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {isSignUp ? 'Use your work email to create a WorkMatch account.' : 'Use your WorkMatch account to continue.'}
            </p>
          </div>

          {isSignUp && (
            <label className="block text-xs font-bold text-gray-700">
              Full name
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                autoComplete="name"
              />
            </label>
          )}

          <label className="block text-xs font-bold text-gray-700">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block text-xs font-bold text-gray-700">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>

          {error && <div className="rounded border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {notice && <div className="rounded border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:bg-gray-300"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignUp ? 'Create account' : 'Sign in'}
          </button>

          <div className="text-center text-sm text-gray-500">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <Link className="font-bold text-red-600 hover:text-red-700" href="/sign-in">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Need an account?{' '}
                <Link className="font-bold text-red-600 hover:text-red-700" href="/sign-up">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}


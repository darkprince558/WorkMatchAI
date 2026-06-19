import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16 text-gray-900">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-600">404</p>
        <h1 className="mt-3 text-3xl font-bold">Page not found</h1>
        <p className="mt-4 text-gray-600">The page you requested does not exist in this WorkMatch workspace.</p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Return to WorkMatch
        </Link>
      </div>
    </main>
  );
}

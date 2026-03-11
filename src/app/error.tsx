'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center max-w-md px-6">
        <div className="text-5xl mb-4">&#x1F30A;</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-6">
          The water monitoring dashboard encountered an error. This is usually temporary.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-3 mb-4 text-left font-mono break-words">
            {error.message}
          </p>
        )}
        <button
          onClick={() => reset()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

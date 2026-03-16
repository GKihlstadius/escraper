'use client';

export default function RecommendationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Prisrekommendationer</h1>
        <p className="text-sm text-red-500 mt-1">
          Ett fel uppstod vid laddning av prisrekommendationer.
        </p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-sm text-red-700 mb-2 font-medium">Felmeddelande:</p>
        <p className="text-sm text-red-600 font-mono">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-red-400 mt-2">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
        >
          Försök igen
        </button>
      </div>
    </div>
  );
}

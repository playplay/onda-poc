import { useState } from "react";
import { importFavoriteByUrl } from "../api/client";
import type { Post } from "../types";

interface Props {
  onClose: () => void;
  onSuccess: (post: Post) => void;
}

export default function ImportFavoriteModal({ onClose, onSuccess }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = url.includes("linkedin.com") && (url.includes("/posts/") || url.includes("activity-"));

  const handleSubmit = async () => {
    if (!isValidUrl) return;
    setError(null);
    setLoading(true);
    try {
      const post = await importFavoriteByUrl(url.trim());
      onSuccess(post);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "response" in e) {
        const resp = (e as { response?: { data?: { detail?: string } } }).response;
        setError(resp?.data?.detail || "Import failed");
      } else {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add a LinkedIn post</h3>
          <button
            onClick={() => !loading && onClose()}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">LinkedIn post URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.linkedin.com/posts/..."
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && isValidUrl && !loading && handleSubmit()}
          />
        </div>

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4 text-violet-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-gray-500 animate-pulse">Scraping and analyzing post...</span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !isValidUrl}
          className="mt-5 w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {loading ? "Importing..." : "Import post"}
        </button>
      </div>
    </div>
  );
}

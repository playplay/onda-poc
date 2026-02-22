import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { triggerScrape, getSectors, getCachedSectors } from "../api/client";

interface ScrapeFormProps {
  onJobCreated?: (jobId: string) => void;
}

export default function ScrapeForm({ onJobCreated }: ScrapeFormProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectors, setSectors] = useState<string[]>(getCachedSectors() ?? []);
  const [selectedSector, setSelectedSector] = useState("");

  useEffect(() => {
    getSectors().then(setSectors);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSector) return;

    setLoading(true);
    setError(null);

    try {
      const job = await triggerScrape({ sector: selectedSector });
      if (onJobCreated) {
        onJobCreated(job.id);
      } else {
        navigate(`/results/${job.id}`);
      }
    } catch {
      setError("Failed to start scrape. Check your API configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl mx-auto shadow-lg"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-1">New search</h2>
      <p className="text-sm text-gray-500 mb-4">
        Fetch the most recent posts from all watched accounts in the selected sector.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Sector *
          </label>
          {sectors.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No sectors available.{" "}
              <a href="/admin" className="underline text-gray-600">
                Add watched accounts in Admin
              </a>{" "}
              first.
            </p>
          ) : (
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            >
              <option value="">Select a sector…</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !selectedSector}
          className="w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {loading ? "Starting…" : "Start scraping"}
        </button>
      </div>
    </form>
  );
}

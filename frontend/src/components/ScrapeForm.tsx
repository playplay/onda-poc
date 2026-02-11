import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { triggerScrape } from "../api/client";
import { LINKEDIN_INDUSTRIES, CONTENT_TYPES } from "../types";

export default function ScrapeForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [sectorInput, setSectorInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contentType, setContentType] = useState("");
  const [isCorporate, setIsCorporate] = useState(false);
  const [organization, setOrganization] = useState("");
  const [maxResults, setMaxResults] = useState(50);

  const suggestionsRef = useRef<HTMLDivElement>(null);

  const filteredIndustries =
    sectorInput.trim().length >= 2
      ? LINKEDIN_INDUSTRIES.filter((ind) =>
          ind.toLowerCase().includes(sectorInput.toLowerCase())
        )
      : [];

  const unselectedCount = filteredIndustries.filter(
    (ind) => !selectedIndustries.includes(ind)
  ).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectAll = () => {
    const merged = [...new Set([...selectedIndustries, ...filteredIndustries])];
    setSelectedIndustries(merged);
    setSectorInput("");
    setShowSuggestions(false);
  };

  const handleToggleIndustry = (industry: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(industry)
        ? prev.filter((i) => i !== industry)
        : [...prev, industry]
    );
  };

  const handleRemoveIndustry = (industry: string) => {
    setSelectedIndustries((prev) => prev.filter((i) => i !== industry));
  };

  const handleClearAll = () => {
    setSelectedIndustries([]);
    setSectorInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const job = await triggerScrape({
        search_query: searchQuery,
        sector:
          selectedIndustries.length > 0
            ? selectedIndustries.join(",")
            : null,
        content_type_filter: contentType || null,
        is_corporate: isCorporate,
        organization: organization || null,
        max_results: maxResults,
      });
      navigate(`/results/${job.id}`);
    } catch {
      setError("Failed to start scrape. Check your API configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg shadow-md p-6 max-w-xl mx-auto"
    >
      <h2 className="text-lg font-semibold mb-4">New LinkedIn Scrape</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Query *
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. AI technology, content marketing..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative" ref={suggestionsRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Author Industry
            </label>
            <div className="relative">
              <input
                type="text"
                value={sectorInput}
                onChange={(e) => {
                  setSectorInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (sectorInput.trim().length >= 2) setShowSuggestions(true);
                }}
                placeholder="Type to search industries..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {selectedIndustries.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
                >
                  ×
                </button>
              )}
            </div>

            {/* Selected industries chips */}
            {selectedIndustries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedIndustries.map((ind) => (
                  <span
                    key={ind}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                  >
                    {ind}
                    <button
                      type="button"
                      onClick={() => handleRemoveIndustry(ind)}
                      className="text-blue-600 hover:text-blue-800 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && filteredIndustries.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {unselectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="w-full text-left px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border-b border-gray-200 sticky top-0"
                  >
                    Select all {filteredIndustries.length} matches
                  </button>
                )}
                {filteredIndustries.map((ind) => {
                  const isSelected = selectedIndustries.includes(ind);
                  return (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => handleToggleIndustry(ind)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                        isSelected
                          ? "bg-blue-50 text-blue-700"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 border rounded flex items-center justify-center text-xs shrink-0 ${
                          isSelected
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300"
                        }`}
                      >
                        {isSelected && "✓"}
                      </span>
                      {ind}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={isCorporate}
              onChange={(e) => setIsCorporate(e.target.checked)}
              className="rounded border-gray-300"
            />
            Corporate content only
          </label>
        </div>

        {isCorporate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization (optional)
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. Microsoft, HubSpot..."
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Results
          </label>
          <input
            type="number"
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            min={1}
            max={1000}
            className="w-32 border border-gray-300 rounded-md px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !searchQuery.trim()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? "Starting scrape..." : "Start Scrape"}
        </button>
      </div>
    </form>
  );
}

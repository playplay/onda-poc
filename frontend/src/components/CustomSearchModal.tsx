import { useState, useEffect } from "react";
import { getAccounts, createCustomSearch, getCustomSearch } from "../api/client";
import type { WatchedAccount, CustomSearchResult } from "../types";

interface Props {
  onClose: () => void;
  onResult: (result: CustomSearchResult) => void;
}

const POSTS_OPTIONS = [10, 20, 30];

export default function CustomSearchModal({ onClose, onResult }: Props) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [accountType, setAccountType] = useState<"company" | "person">("company");
  const [postsLimit, setPostsLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    getAccounts().then(setAccounts).catch(() => {});
  }, []);

  const filteredAccounts = accountSearch
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
          a.sector.toLowerCase().includes(accountSearch.toLowerCase())
      )
    : accounts;

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleSearch = async () => {
    setError(null);

    if (mode === "existing" && !selectedAccountId) {
      setError("Please select an account.");
      return;
    }
    if (mode === "new" && !newUrl.trim()) {
      setError("Please enter a LinkedIn URL.");
      return;
    }

    setLoading(true);
    setStatusMsg("Starting search...");

    try {
      const job = await createCustomSearch(
        mode === "existing"
          ? {
              account_id: selectedAccountId,
              posts_limit: postsLimit,
              account_type: accountType,
            }
          : {
              account_url: newUrl.trim(),
              account_name: newName.trim() || undefined,
              posts_limit: postsLimit,
              account_type: accountType,
            }
      );

      if (job.status === "failed") {
        setError(job.error_message || "Search failed");
        setLoading(false);
        return;
      }

      // Poll until complete
      setPolling(true);
      setStatusMsg("Scraping posts from Bright Data...");

      const poll = async () => {
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 5000));
          attempts++;
          try {
            const result = await getCustomSearch(job.id);
            if (result.job.status === "completed") {
              setPolling(false);
              setLoading(false);
              onResult(result);
              return;
            }
            if (result.job.status === "failed") {
              setPolling(false);
              setLoading(false);
              setError(result.job.error_message || "Search failed");
              return;
            }
            setStatusMsg(`Still running... (${attempts * 5}s)`);
          } catch {
            // ignore transient errors
          }
        }
        setPolling(false);
        setLoading(false);
        setError("Search timed out. Check back later.");
      };

      poll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
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
          <h3 className="text-base font-semibold text-gray-900">Custom Search</h3>
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

        {/* Account type toggle */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm font-medium text-gray-600">Account type</label>
            <div className="group relative">
              <svg className="w-3.5 h-3.5 text-amber-500 cursor-default" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1.5 shadow-lg w-52 leading-relaxed text-center">
                Make sure to select the right type — using the wrong scraper (Company vs Person) will cause the search to fail.
              </div>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
            {(["company", "person"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAccountType(t)}
                disabled={loading}
                className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  accountType === t
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "company" ? "Company" : "Person"}
              </button>
            ))}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5 mb-4">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={loading}
              className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                mode === m
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m === "existing" ? "Watched account" : "New URL"}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Search account</label>
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Type name or sector..."
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                disabled={loading}
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
              {filteredAccounts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-gray-400 text-center">No accounts found</p>
              ) : (
                filteredAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAccountId(a.id)}
                    disabled={loading}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${
                      selectedAccountId === a.id ? "bg-violet-50 text-violet-700" : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="text-gray-400 text-xs ml-2">{a.sector}</span>
                  </button>
                ))
              )}
            </div>
            {selectedAccount && (
              <p className="text-xs text-violet-600">Selected: {selectedAccount.name}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">LinkedIn URL *</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.linkedin.com/company/acme"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Account name (optional)</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                disabled={loading}
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">Number of posts</label>
          <div className="flex gap-2">
            {POSTS_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setPostsLimit(n)}
                disabled={loading}
                className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
                  postsLimit === n
                    ? "border-violet-600 bg-violet-50 text-violet-700 font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {statusMsg && loading && (
          <p className="mt-3 text-xs text-gray-500 text-center animate-pulse">{statusMsg}</p>
        )}

        <button
          onClick={handleSearch}
          disabled={loading}
          className="mt-5 w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {loading ? (polling ? "Fetching results..." : "Starting...") : "Search"}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { getAccounts } from "../api/client";
import type { WatchedAccount } from "../types";
import { LinkedInIcon, InstagramIcon, TikTokIcon } from "./icons";

interface Props {
  onClose: () => void;
}

export default function WatchedAccountsModal({ onClose }: Props) {
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSector, setFilterSector] = useState("");

  useEffect(() => {
    getAccounts()
      .then((data) => setAccounts([...data].sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sectors = [...new Set(accounts.map((a) => a.sector))].sort();
  const filtered = filterSector ? accounts.filter((a) => a.sector === filterSector) : accounts;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Watched Accounts</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="">All sectors ({accounts.length})</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s} ({accounts.filter((a) => a.sector === s).length})</option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Sector</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Platforms</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Assigned CS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{a.name}</div>
                      {a.type === "person" && a.company_name && (
                        <div className="text-xs text-gray-400">{a.company_name}</div>
                      )}
                      {a.is_playplay_client && (
                        <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full">Client PP</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{a.sector}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {a.linkedin_url ? (
                          <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[#0A66C2]">
                            <LinkedInIcon className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-gray-200"><LinkedInIcon className="w-4 h-4" /></span>
                        )}
                        {a.instagram_url ? (
                          <a href={a.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[#E4405F]">
                            <InstagramIcon className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-gray-200"><InstagramIcon className="w-4 h-4" /></span>
                        )}
                        {a.tiktok_url ? (
                          <a href={a.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-black">
                            <TikTokIcon className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-gray-200"><TikTokIcon className="w-4 h-4" /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {a.assigned_cs_email ? a.assigned_cs_email.split("@")[0] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../api/client";
import type { WatchedAccount, WatchedAccountCreate } from "../types";

// Module-level cache — survives React navigation (component unmount/remount)
let accountsCache: WatchedAccount[] | null = null;

function sortAccounts(list: WatchedAccount[]): WatchedAccount[] {
  return [...list].sort((a, b) => {
    if (a.sector < b.sector) return -1;
    if (a.sector > b.sector) return 1;
    return a.name.localeCompare(b.name);
  });
}

const EMPTY_FORM: WatchedAccountCreate = {
  name: "",
  type: "company",
  linkedin_url: "",
  sector: "",
  is_playplay_client: false,
};

export default function AdminPage() {
  const [accounts, setAccounts] = useState<WatchedAccount[]>(
    accountsCache ?? []
  );
  const [filterSector, setFilterSector] = useState("");
  const [filterPlayPlay, setFilterPlayPlay] = useState<boolean | null>(null);
  // Only show loading spinner if we have no cached data
  const [loading, setLoading] = useState(accountsCache === null);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WatchedAccountCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [sectorMode, setSectorMode] = useState<"select" | "new">("select");

  const sectors = [...new Set(accounts.map((a) => a.sector))].sort();

  const base = accounts.filter((a) => {
    if (filterSector && a.sector !== filterSector) return false;
    if (filterPlayPlay !== null && a.is_playplay_client !== filterPlayPlay) return false;
    return true;
  });

  function applyAndCache(list: WatchedAccount[]) {
    const sorted = sortAccounts(list);
    accountsCache = sorted;
    setAccounts(sorted);
  }

  useEffect(() => {
    // Always refresh in background; show cache instantly if available
    getAccounts()
      .then(applyAndCache)
      .catch(() => {
        if (!accountsCache) setError("Failed to load accounts.");
      })
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSectorMode(sectors.length > 0 ? "select" : "new");
    setShowModal(true);
  }

  function openEdit(account: WatchedAccount) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      linkedin_url: account.linkedin_url,
      sector: account.sector,
      is_playplay_client: account.is_playplay_client,
    });
    setFormError(null);
    setSectorMode("select");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.linkedin_url || !form.sector) {
      setFormError("All fields are required.");
      return;
    }
    setFormError(null);

    if (editingId) {
      const optimistic: WatchedAccount = { id: editingId, created_at: "", ...form };
      applyAndCache(accounts.map((a) => (a.id === editingId ? optimistic : a)));
      setShowModal(false);
      try {
        const updated = await updateAccount(editingId, form);
        applyAndCache(accounts.map((a) => (a.id === editingId ? updated : a)));
      } catch {
        getAccounts().then(applyAndCache);
        setError("Failed to update account.");
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: WatchedAccount = {
        id: tempId,
        created_at: new Date().toISOString(),
        ...form,
      };
      applyAndCache([...accounts, optimistic]);
      setShowModal(false);
      try {
        const created = await createAccount(form);
        applyAndCache(
          accountsCache!.map((a) => (a.id === tempId ? created : a))
        );
      } catch {
        applyAndCache(accountsCache!.filter((a) => a.id !== tempId));
        setError("Failed to create account.");
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account?")) return;
    applyAndCache(accounts.filter((a) => a.id !== id));
    try {
      await deleteAccount(id);
    } catch {
      getAccounts().then(applyAndCache);
      alert("Failed to delete account.");
    }
  }

  const AccountRow = ({ account }: { account: WatchedAccount }) => (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2 font-medium text-gray-900">{account.name}</td>
      <td className="px-4 py-2 text-gray-600">{account.sector}</td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={account.is_playplay_client}
          onChange={async (e) => {
            const val = e.target.checked;
            applyAndCache(accounts.map((a) => a.id === account.id ? { ...a, is_playplay_client: val } : a));
            try {
              await updateAccount(account.id, { is_playplay_client: val });
            } catch {
              getAccounts().then(applyAndCache);
            }
          }}
          className="rounded border-gray-300 text-gray-400 focus:ring-gray-300 cursor-pointer w-3.5 h-3.5"
        />
      </td>
      <td className="px-4 py-2 text-gray-500 max-w-xs truncate">
        <a
          href={account.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {account.linkedin_url}
        </a>
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button
          onClick={() => openEdit(account)}
          title="Edit"
          className="inline-flex text-gray-300 hover:text-gray-600 mr-3 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button
          onClick={() => handleDelete(account.id)}
          title="Delete"
          className="inline-flex text-gray-300 hover:text-red-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Watched Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            LinkedIn company pages tracked per sector.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          + Add Account
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {sectors.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm"
          >
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setFilterPlayPlay((prev) => (prev === true ? null : true))}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filterPlayPlay === true
                ? "bg-green-50 text-green-700 border-green-200"
                : "text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            PlayPlay only
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : base.length === 0 ? (
        <p className="text-sm text-gray-400">
          No accounts yet. Click "+ Add Account" to get started.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Sector</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">PlayPlay Client?</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">LinkedIn URL</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {base.map((a) => <AccountRow key={a.id} account={a} />)}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editingId ? "Edit Account" : "Add Account"}
            </h3>

            {formError && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Apple, Société Générale"
                  autoFocus
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Sector *</label>
                {sectorMode === "select" ? (
                  <div className="flex gap-2">
                    <select
                      value={form.sector}
                      onChange={(e) => setForm({ ...form, sector: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value="">Select a sector…</option>
                      {sectors.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setSectorMode("new"); setForm((f) => ({ ...f, sector: "" })); }}
                      className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.sector}
                      onChange={(e) => setForm({ ...form, sector: e.target.value })}
                      placeholder="e.g. Banque et assurances"
                      autoFocus
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {sectors.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSectorMode("select"); setForm((f) => ({ ...f, sector: "" })); }}
                        className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                      >
                        ← Back
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">LinkedIn URL *</label>
                <input
                  type="url"
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  placeholder="https://www.linkedin.com/company/apple"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="playplay-client"
                  checked={form.is_playplay_client ?? false}
                  onChange={(e) => setForm({ ...form, is_playplay_client: e.target.checked })}
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="playplay-client" className="text-sm text-gray-600">
                  PlayPlay Client
                </label>
              </div>

            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

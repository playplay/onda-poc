import { useState, useEffect } from "react";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../api/client";
import type { WatchedAccount, WatchedAccountCreate } from "../types";
import { LinkedInIcon, InstagramIcon, TikTokIcon } from "../components/icons";
import { FilterableHeader } from "../components/FilterableHeader";
import { sortAccounts } from "../utils/accounts";

// Module-level cache — survives React navigation (component unmount/remount)
let accountsCache: WatchedAccount[] | null = null;

function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const first = local.split(".")[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function csmFullName(email: string | null): string {
  if (!email) return "—";
  const local = email.split("@")[0];
  return local
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const EMPTY_FORM: WatchedAccountCreate = {
  name: "",
  type: "company",
  linkedin_url: null,
  instagram_url: null,
  tiktok_url: null,
  sector: "",
  company_name: null,
  is_playplay_client: false,
  assigned_cs_email: null,
};

interface Props {
  userRole: string;
  userEmail?: string;
}

export default function AccountsPage({ userRole, userEmail }: Props) {
  const isAdmin = userRole === "admin";

  const [accounts, setAccounts] = useState<WatchedAccount[]>(
    accountsCache ?? []
  );
  const [filterType, setFilterType] = useState<string>("");
  const [filterSector, setFilterSector] = useState("");
  const [filterPlayPlay, setFilterPlayPlay] = useState<string>("");
  const [filterPlatform, setFilterPlatform] = useState<string>("");
  const [filterName, setFilterName] = useState("");
  const [filterCsm, setFilterCsm] = useState("");
  const [filterParentAccount, setFilterParentAccount] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(accountsCache === null);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WatchedAccountCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [sectorMode, setSectorMode] = useState<"select" | "new">("select");

  const sectors = [...new Set(accounts.map((a) => a.sector))].sort();
  const csms = [...new Set(accounts.map((a) => a.assigned_cs_email).filter(Boolean) as string[])].sort();
  const parentAccounts = [...new Set(accounts.map((a) => a.company_name).filter(Boolean) as string[])].sort();

  const hasFilters = !!(filterType || filterSector || filterPlayPlay || filterPlatform || filterName || filterCsm || filterParentAccount);

  const filtered = accounts.filter((a) => {
    if (filterType && a.type !== filterType) return false;
    if (filterSector && a.sector !== filterSector) return false;
    if (filterPlayPlay === "yes" && !a.is_playplay_client) return false;
    if (filterPlayPlay === "no" && a.is_playplay_client) return false;
    if (filterPlatform === "linkedin" && !a.linkedin_url) return false;
    if (filterPlatform === "instagram" && !a.instagram_url) return false;
    if (filterPlatform === "tiktok" && !a.tiktok_url) return false;
    if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterCsm && a.assigned_cs_email !== filterCsm) return false;
    if (filterParentAccount && a.company_name !== filterParentAccount) return false;
    return true;
  });

  function resetFilters() {
    setFilterType("");
    setFilterSector("");
    setFilterPlayPlay("");
    setFilterPlatform("");
    setFilterName("");
    setFilterCsm("");
    setFilterParentAccount("");
  }

  function applyAndCache(list: WatchedAccount[]) {
    const sorted = sortAccounts(list, userEmail);
    accountsCache = sorted;
    setAccounts(sorted);
  }

  useEffect(() => {
    // Re-sort cache if userEmail changes (different user logged in)
    if (accountsCache) {
      setAccounts(sortAccounts(accountsCache, userEmail));
    }
    getAccounts()
      .then(applyAndCache)
      .catch(() => {
        if (!accountsCache) setError("Failed to load accounts.");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

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
      instagram_url: account.instagram_url,
      tiktok_url: account.tiktok_url,
      sector: account.sector,
      company_name: account.company_name,
      is_playplay_client: account.is_playplay_client,
      assigned_cs_email: account.assigned_cs_email,
    });
    setFormError(null);
    setSectorMode("select");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.sector) {
      setFormError("Name and sector are required.");
      return;
    }
    if (!form.linkedin_url && !form.instagram_url && !form.tiktok_url) {
      setFormError("At least one URL (LinkedIn, Instagram, or TikTok) is required.");
      return;
    }
    setFormError(null);

    if (editingId) {
      const optimistic: WatchedAccount = {
        id: editingId,
        created_at: "",
        is_playplay_client: false,
        ...form,
        linkedin_url: form.linkedin_url ?? null,
        instagram_url: form.instagram_url ?? null,
        tiktok_url: form.tiktok_url ?? null,
        company_name: form.company_name ?? null,
        assigned_cs_email: form.assigned_cs_email ?? null,
      };
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
        is_playplay_client: false,
        ...form,
        linkedin_url: form.linkedin_url ?? null,
        instagram_url: form.instagram_url ?? null,
        tiktok_url: form.tiktok_url ?? null,
        company_name: form.company_name ?? null,
        assigned_cs_email: form.assigned_cs_email ?? null,
      };
      applyAndCache([...accounts, optimistic]);
      setShowModal(false);
      try {
        const created = await createAccount(form);
        applyAndCache(accountsCache!.map((a) => (a.id === tempId ? created : a)));
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
    <tr className="border-t border-gray-100 hover:bg-gray-50 h-14">
      <td className="px-4 py-2 align-middle">
        <div className="font-medium text-gray-900">{account.name}</div>
      </td>
      <td className="px-4 py-2 align-middle text-gray-500 text-sm">
        {account.company_name || <span className="text-gray-200">—</span>}
      </td>
      <td className="px-4 py-2 align-middle">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
          account.type === "person"
            ? "bg-blue-50 text-blue-700"
            : "bg-gray-100 text-gray-600"
        }`}>
          {account.type === "person" ? "Person" : "Company"}
        </span>
      </td>
      <td className="px-4 py-2 align-middle">
        <div className="flex items-center gap-2">
          {account.linkedin_url ? (
            <a href={account.linkedin_url} target="_blank" rel="noopener noreferrer"
              title={account.linkedin_url} className="text-[#0A66C2] hover:text-[#004182] transition-colors">
              <LinkedInIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200"><LinkedInIcon className="w-4 h-4" /></span>
          )}
          {account.instagram_url ? (
            <a href={account.instagram_url} target="_blank" rel="noopener noreferrer"
              title={account.instagram_url} className="text-[#E4405F] hover:text-[#C13584] transition-colors">
              <InstagramIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200"><InstagramIcon className="w-4 h-4" /></span>
          )}
          {account.tiktok_url ? (
            <a href={account.tiktok_url} target="_blank" rel="noopener noreferrer"
              title={account.tiktok_url} className="text-black hover:text-gray-700 transition-colors">
              <TikTokIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200"><TikTokIcon className="w-4 h-4" /></span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 align-middle text-gray-600 text-sm">{account.sector}</td>
      <td className="px-4 py-2 align-middle text-gray-500 text-sm">
        {csmFullName(account.assigned_cs_email)}
      </td>
      <td className="px-4 py-2 align-middle">
        {account.is_playplay_client ? (
          <svg className="w-4 h-4 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="text-gray-200">—</span>
        )}
      </td>
      {isAdmin && (
        <td className="px-4 py-2 align-middle text-right whitespace-nowrap">
          <button onClick={() => openEdit(account)} title="Edit"
            className="inline-flex text-gray-300 hover:text-gray-600 mr-3 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={() => handleDelete(account.id)} title="Delete"
            className="inline-flex text-gray-300 hover:text-red-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </td>
      )}
    </tr>
  );

  return (
    <div>
      {userEmail && (
        <p className="text-sm text-gray-500 mb-5">
          Welcome, <span className="font-medium text-gray-700">{firstNameFromEmail(userEmail)}</span>
        </p>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Watched Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Company and personal profiles tracked per sector.
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate}
            className="bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-violet-700 transition-colors">
            + Add Account
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-400">No accounts yet.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-visible">
          {hasFilters && (
            <div className="flex items-center justify-between px-4 py-2 bg-violet-50 border-b border-violet-100 rounded-t-lg">
              <span className="text-xs text-violet-600">
                {filtered.length} of {accounts.length} accounts
              </span>
              <button onClick={resetFilters}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors">
                Reset filters
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <FilterableHeader label="Name" column="name" options={[]}
                  activeValue={filterName} onSelect={setFilterName} openFilter={openFilter} setOpenFilter={setOpenFilter} searchOnly />
                <FilterableHeader label="Parent Account" column="parentAccount"
                  options={parentAccounts.map((p) => ({ value: p, label: p }))}
                  activeValue={filterParentAccount} onSelect={setFilterParentAccount} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <FilterableHeader label="Type" column="type"
                  options={[{ value: "company", label: "Company" }, { value: "person", label: "Person" }]}
                  activeValue={filterType} onSelect={setFilterType} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <FilterableHeader label="Platforms" column="platform"
                  options={[
                    { value: "linkedin", label: "LinkedIn" },
                    { value: "instagram", label: "Instagram" },
                    { value: "tiktok", label: "TikTok" },
                  ]}
                  activeValue={filterPlatform} onSelect={setFilterPlatform} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <FilterableHeader label="Sector" column="sector"
                  options={sectors.map((s) => ({ value: s, label: s }))}
                  activeValue={filterSector} onSelect={setFilterSector} openFilter={openFilter} setOpenFilter={setOpenFilter} showSearch />
                <FilterableHeader label="CSM" column="csm"
                  options={csms.map((c) => ({ value: c, label: csmFullName(c) }))}
                  activeValue={filterCsm} onSelect={setFilterCsm} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <FilterableHeader label="Client PP?" column="playplay"
                  options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                  activeValue={filterPlayPlay} onSelect={setFilterPlayPlay} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                {isAdmin && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-sm text-gray-400">
                    No accounts match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => <AccountRow key={a.id} account={a} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editingId ? "Edit Account" : "Add Account"}
            </h3>

            {formError && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{formError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Type *</label>
                <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                  {(["company", "person"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                        form.type === t
                          ? "bg-white text-gray-900 shadow-sm font-medium"
                          : "text-gray-500 hover:text-gray-700"
                      }`}>
                      {t === "company" ? "Company" : "Person"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Name *</label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={form.type === "person" ? "e.g. Patrick Pouyanné" : "e.g. TotalEnergies"}
                  autoFocus
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Parent Account</label>
                <input type="text" value={form.company_name ?? ""}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value || null })}
                  placeholder="e.g. BNP, TotalEnergies, Saint-Gobain"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Sector *</label>
                {sectorMode === "select" ? (
                  <div className="flex gap-2">
                    <select value={form.sector}
                      onChange={(e) => setForm({ ...form, sector: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
                      <option value="">Select a sector…</option>
                      {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button"
                      onClick={() => { setSectorMode("new"); setForm((f) => ({ ...f, sector: "" })); }}
                      className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="text" value={form.sector}
                      onChange={(e) => setForm({ ...form, sector: e.target.value })}
                      placeholder="e.g. Banque et assurances"
                      autoFocus
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    {sectors.length > 0 && (
                      <button type="button"
                        onClick={() => { setSectorMode("select"); setForm((f) => ({ ...f, sector: "" })); }}
                        className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                        ← Back
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Assigned CSM</label>
                <input type="email" value={form.assigned_cs_email ?? ""}
                  onChange={(e) => setForm({ ...form, assigned_cs_email: e.target.value || null })}
                  placeholder="e.g. maud.alexandre@playplay.com"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">LinkedIn URL</label>
                <input type="url" value={form.linkedin_url ?? ""}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value || null })}
                  placeholder="https://www.linkedin.com/company/totalenergies"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Instagram URL</label>
                <input type="url" value={form.instagram_url ?? ""}
                  onChange={(e) => setForm({ ...form, instagram_url: e.target.value || null })}
                  placeholder="https://www.instagram.com/totalenergies"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">TikTok URL</label>
                <input type="url" value={form.tiktok_url ?? ""}
                  onChange={(e) => setForm({ ...form, tiktok_url: e.target.value || null })}
                  placeholder="https://www.tiktok.com/@username"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id="playplay-client"
                  checked={form.is_playplay_client ?? false}
                  onChange={(e) => setForm({ ...form, is_playplay_client: e.target.checked })}
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="playplay-client" className="text-sm text-gray-600">PlayPlay Client</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={handleSave}
                className="px-4 py-2 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../api/client";
import type { WatchedAccount, WatchedAccountCreate } from "../types";
import { LinkedInIcon, InstagramIcon, TikTokIcon } from "../components/icons";

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
  linkedin_url: null,
  instagram_url: null,
  tiktok_url: null,
  sector: "",
  company_name: null,
  is_playplay_client: false,
};

export default function AdminPage() {
  const [accounts, setAccounts] = useState<WatchedAccount[]>(
    accountsCache ?? []
  );
  const [filterType, setFilterType] = useState<string>("");
  const [filterSector, setFilterSector] = useState("");
  const [filterPlayPlay, setFilterPlayPlay] = useState<string>("");
  const [filterPlatform, setFilterPlatform] = useState<string>("");
  const [filterName, setFilterName] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  // Only show loading spinner if we have no cached data
  const [loading, setLoading] = useState(accountsCache === null);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WatchedAccountCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [sectorMode, setSectorMode] = useState<"select" | "new">("select");
  const [companyMode, setCompanyMode] = useState<"select" | "other">("select");

  const sectors = [...new Set(accounts.map((a) => a.sector))].sort();

  // Companies in the currently selected sector (for person → company dropdown)
  const companiesInSector = accounts.filter(
    (a) => a.type === "company" && a.sector === form.sector
  );

  const hasFilters = !!(filterType || filterSector || filterPlayPlay || filterPlatform || filterName);

  const base = accounts.filter((a) => {
    if (filterType && a.type !== filterType) return false;
    if (filterSector && a.sector !== filterSector) return false;
    if (filterPlayPlay === "yes" && !a.is_playplay_client) return false;
    if (filterPlayPlay === "no" && a.is_playplay_client) return false;
    if (filterPlatform === "linkedin" && !a.linkedin_url) return false;
    if (filterPlatform === "instagram" && !a.instagram_url) return false;
    if (filterPlatform === "tiktok" && !a.tiktok_url) return false;
    if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    return true;
  });

  function resetFilters() {
    setFilterType("");
    setFilterSector("");
    setFilterPlayPlay("");
    setFilterPlatform("");
    setFilterName("");
  }

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
    setCompanyMode("select");
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
    });
    setFormError(null);
    setSectorMode("select");
    // If person with company_name that's not a known company → "other" mode
    if (account.type === "person" && account.company_name) {
      const knownCompany = accounts.find(
        (a) => a.type === "company" && a.sector === account.sector && a.name === account.company_name
      );
      setCompanyMode(knownCompany ? "select" : "other");
    } else {
      setCompanyMode("select");
    }
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
    if (form.type === "person" && !form.company_name) {
      setFormError("Please select or enter a company for this person.");
      return;
    }
    setFormError(null);

    // Clean company_name for company accounts
    const payload = {
      ...form,
      company_name: form.type === "person" ? form.company_name : null,
    };

    if (editingId) {
      const optimistic: WatchedAccount = {
        id: editingId,
        created_at: "",
        is_playplay_client: false,
        ...payload,
        linkedin_url: payload.linkedin_url ?? null,
        instagram_url: payload.instagram_url ?? null,
        tiktok_url: payload.tiktok_url ?? null,
        company_name: payload.company_name ?? null,
      };
      applyAndCache(accounts.map((a) => (a.id === editingId ? optimistic : a)));
      setShowModal(false);
      try {
        const updated = await updateAccount(editingId, payload);
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
        ...payload,
        linkedin_url: payload.linkedin_url ?? null,
        instagram_url: payload.instagram_url ?? null,
        tiktok_url: payload.tiktok_url ?? null,
        company_name: payload.company_name ?? null,
      };
      applyAndCache([...accounts, optimistic]);
      setShowModal(false);
      try {
        const created = await createAccount(payload);
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

  const ChevronIcon = ({ active }: { active: boolean }) => (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={`ml-1 transition-colors ${active ? "text-violet-600" : "text-gray-400"}`}
    >
      <path d="M2.5 3.75L5 6.25L7.5 3.75" />
    </svg>
  );

  function FilterableHeader({
    label, column, options, activeValue, onSelect, showSearch, searchOnly,
  }: {
    label: string;
    column: string;
    options: { value: string; label: string }[];
    activeValue: string;
    onSelect: (v: string) => void;
    showSearch?: boolean;
    searchOnly?: boolean;
  }) {
    const ref = useRef<HTMLTableHeaderCellElement>(null);
    const [search, setSearch] = useState("");
    const isOpen = openFilter === column;
    const isActive = !!activeValue;

    useEffect(() => {
      function handleClick(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpenFilter(null);
          setSearch("");
        }
      }
      if (isOpen) document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const filtered = showSearch && search
      ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
      : options;

    return (
      <th className="text-left px-4 py-2 font-medium text-gray-600 relative" ref={ref}>
        <button
          onClick={() => { setOpenFilter(isOpen ? null : column); setSearch(""); }}
          className={`inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors ${
            isActive ? "text-violet-600 font-semibold" : ""
          }`}
        >
          {label}
          <ChevronIcon active={isActive} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] py-1">
            {searchOnly ? (
              <div className="px-2 py-1.5">
                <input
                  type="text"
                  value={activeValue}
                  onChange={(e) => onSelect(e.target.value)}
                  placeholder="Type to filter…"
                  autoFocus
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                {activeValue && (
                  <button
                    onClick={() => { onSelect(""); setOpenFilter(null); }}
                    className="mt-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <>
                {showSearch && (
                  <div className="px-2 py-1.5">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      autoFocus
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                )}
                <button
                  onClick={() => { onSelect(""); setOpenFilter(null); setSearch(""); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                    !activeValue ? "text-violet-600 font-medium" : "text-gray-500"
                  }`}
                >
                  All
                </button>
                <div className="max-h-[240px] overflow-y-auto">
                  {filtered.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { onSelect(o.value); setOpenFilter(null); setSearch(""); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                        activeValue === o.value ? "text-violet-600 font-medium bg-violet-50" : "text-gray-700"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </th>
    );
  }

  const AccountRow = ({ account }: { account: WatchedAccount }) => (
    <tr className="border-t border-gray-100 hover:bg-gray-50 h-14">
      <td className="px-4 py-2 align-middle">
        <div className="font-medium text-gray-900">
          {account.name}
        </div>
        {account.type === "person" && account.company_name && (
          <div className="text-gray-400 text-xs mt-0.5">
            {account.company_name}
          </div>
        )}
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
            <a
              href={account.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              title={account.linkedin_url}
              className="text-[#0A66C2] hover:text-[#004182] transition-colors"
            >
              <LinkedInIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200">
              <LinkedInIcon className="w-4 h-4" />
            </span>
          )}
          {account.instagram_url ? (
            <a
              href={account.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              title={account.instagram_url}
              className="text-[#E4405F] hover:text-[#C13584] transition-colors"
            >
              <InstagramIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200">
              <InstagramIcon className="w-4 h-4" />
            </span>
          )}
          {account.tiktok_url ? (
            <a
              href={account.tiktok_url}
              target="_blank"
              rel="noopener noreferrer"
              title={account.tiktok_url}
              className="text-black hover:text-gray-700 transition-colors"
            >
              <TikTokIcon className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-gray-200">
              <TikTokIcon className="w-4 h-4" />
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 align-middle text-gray-600">{account.sector}</td>
      <td className="px-4 py-2 align-middle">
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
      <td className="px-4 py-2 align-middle text-right whitespace-nowrap">
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
            Company and personal profiles tracked per sector.
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

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-400">
          No accounts yet. Click "+ Add Account" to get started.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-visible">
          {hasFilters && (
            <div className="flex items-center justify-between px-4 py-2 bg-violet-50 border-b border-violet-100 rounded-t-lg">
              <span className="text-xs text-violet-600">
                {base.length} of {accounts.length} accounts
              </span>
              <button
                onClick={resetFilters}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
              >
                Reset filters
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <FilterableHeader
                  label="Name"
                  column="name"
                  options={[]}
                  activeValue={filterName}
                  onSelect={setFilterName}
                  searchOnly
                />
                <FilterableHeader
                  label="Type"
                  column="type"
                  options={[
                    { value: "company", label: "Company" },
                    { value: "person", label: "Person" },
                  ]}
                  activeValue={filterType}
                  onSelect={setFilterType}
                />
                <FilterableHeader
                  label="Platforms"
                  column="platform"
                  options={[
                    { value: "linkedin", label: "LinkedIn" },
                    { value: "instagram", label: "Instagram" },
                    { value: "tiktok", label: "TikTok" },
                  ]}
                  activeValue={filterPlatform}
                  onSelect={setFilterPlatform}
                />
                <FilterableHeader
                  label="Sector"
                  column="sector"
                  options={sectors.map((s) => ({ value: s, label: s }))}
                  activeValue={filterSector}
                  onSelect={setFilterSector}
                  showSearch
                />
                <FilterableHeader
                  label="PlayPlay Client?"
                  column="playplay"
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                  activeValue={filterPlayPlay}
                  onSelect={setFilterPlayPlay}
                />
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {base.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    No accounts match the current filters.
                  </td>
                </tr>
              ) : (
                base.map((a) => <AccountRow key={a.id} account={a} />)
              )}
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
                <label className="block text-sm font-medium text-gray-600 mb-1">Type *</label>
                <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                  {(["company", "person"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        type: t,
                        company_name: t === "company" ? null : f.company_name,
                      }))}
                      className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                        form.type === t
                          ? "bg-white text-gray-900 shadow-sm font-medium"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t === "company" ? "Company" : "Person"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={form.type === "person" ? "e.g. Thibaut Machet" : "e.g. PlayPlay"}
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
                      onChange={(e) => setForm({ ...form, sector: e.target.value, company_name: null })}
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value="">Select a sector…</option>
                      {sectors.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setSectorMode("new"); setForm((f) => ({ ...f, sector: "", company_name: null })); }}
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

              {form.type === "person" && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Company *</label>
                  {companyMode === "select" && companiesInSector.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={form.company_name ?? ""}
                        onChange={(e) => setForm({ ...form, company_name: e.target.value || null })}
                        className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                      >
                        <option value="">Select a company…</option>
                        {companiesInSector.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setCompanyMode("other"); setForm((f) => ({ ...f, company_name: null })); }}
                        className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                      >
                        Other
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.company_name ?? ""}
                        onChange={(e) => setForm({ ...form, company_name: e.target.value || null })}
                        placeholder="e.g. PlayPlay"
                        className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                      {companiesInSector.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCompanyMode("select"); setForm((f) => ({ ...f, company_name: null })); }}
                          className="px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                        >
                          ← Back
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  LinkedIn URL {!form.instagram_url && !form.tiktok_url && <span className="text-gray-400 font-normal">(at least one URL required)</span>}
                </label>
                <input
                  type="url"
                  value={form.linkedin_url ?? ""}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value || null })}
                  placeholder={form.type === "person"
                    ? "https://www.linkedin.com/in/thibautmachet"
                    : "https://www.linkedin.com/company/playplay"
                  }
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Instagram URL {!form.linkedin_url && !form.tiktok_url && <span className="text-gray-400 font-normal">(at least one URL required)</span>}
                </label>
                <input
                  type="url"
                  value={form.instagram_url ?? ""}
                  onChange={(e) => setForm({ ...form, instagram_url: e.target.value || null })}
                  placeholder="https://www.instagram.com/playplay.video"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  TikTok URL {!form.linkedin_url && !form.instagram_url && <span className="text-gray-400 font-normal">(at least one URL required)</span>}
                </label>
                <input
                  type="url"
                  value={form.tiktok_url ?? ""}
                  onChange={(e) => setForm({ ...form, tiktok_url: e.target.value || null })}
                  placeholder="https://www.tiktok.com/@username"
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

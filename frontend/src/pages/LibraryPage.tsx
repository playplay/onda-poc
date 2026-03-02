import { useState, useEffect, useMemo, useRef } from "react";
import type { LibraryResponse } from "../types";
import { getLibrary, getAccounts } from "../api/client";
import PostCard, { normalizeFormat, formatLabel } from "../components/PostCard";

// Module-level cache with TTL
let libraryCache: { data: LibraryResponse; ts: number } | null = null;
const CACHE_TTL = 30_000;

function getCached(): LibraryResponse | null {
  if (libraryCache && Date.now() - libraryCache.ts < CACHE_TTL) {
    return libraryCache.data;
  }
  return null;
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
  onClear,
  chipColor,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (val: string) => void;
  onClear: () => void;
  chipColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex items-center gap-2 min-h-[28px]">
      {/* Dropdown button — fixed width */}
      <div className="relative w-[120px] shrink-0" ref={ref}>
        <button
          onClick={() => options.length > 0 && setOpen(!open)}
          className={`w-full px-2.5 py-1 text-xs rounded-md border transition-colors inline-flex items-center justify-between gap-1 ${
            options.length === 0
              ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
              : selected.size > 0
                ? "bg-gray-50 text-gray-900 border-gray-300 font-medium"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          }`}
        >
          <span className="truncate">{label}{selected.size > 0 ? ` (${selected.size})` : ""}</span>
          <svg className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-72 max-h-72 overflow-y-auto">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => onToggle(opt)}
                  className="rounded border-gray-300 text-gray-700 focus:ring-gray-400 w-3 h-3"
                />
                <span className="truncate flex-1 capitalize">{opt}</span>
              </label>
            ))}
            {selected.size > 0 && (
              <button
                onClick={onClear}
                className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {Array.from(selected).map((val) => (
          <span
            key={val}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chipColor}`}
          >
            <span className="capitalize truncate max-w-[160px]">{val}</span>
            <button
              onClick={() => onToggle(val)}
              className="opacity-50 hover:opacity-100"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(getCached);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [filterSectors, setFilterSectors] = useState<Set<string>>(new Set());
  const [filterFormats, setFilterFormats] = useState<Set<string>>(new Set());
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());
  const [filterPlatforms, setFilterPlatforms] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cached = getCached();
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    getLibrary()
      .then((res) => {
        libraryCache = { data: res, ts: Date.now() };
        setData(res);
      })
      .catch((err) => setError(err.message || "Failed to load library"))
      .finally(() => setLoading(false));
  }, []);

  // Load all accounts to build name/type maps
  useEffect(() => {
    getAccounts().then((accounts) => {
      const names = new Map<string, string>();
      const types = new Map<string, "company" | "person">();
      const slugs = new Set<string>();
      for (const a of accounts) {
        const match = a.linkedin_url?.match(/\/(in|company)\/([^/]+)/);
        const slug = match ? match[2] : "";
        if (!slug) continue;
        names.set(slug, a.name);
        types.set(slug, a.type);
        names.set(a.name, a.name);
        types.set(a.name, a.type);
        names.set(a.name.toLowerCase(), a.name);
        types.set(a.name.toLowerCase(), a.type);
        // Map by Instagram username
        if (a.instagram_url) {
          const igMatch = a.instagram_url.match(/instagram\.com\/([^/?\s]+)/);
          if (igMatch) {
            const igUser = igMatch[1].toLowerCase();
            names.set(igUser, a.name);
            types.set(igUser, a.type);
            if (a.is_playplay_client) slugs.add(igUser);
          }
        }
        if (a.is_playplay_client) {
          slugs.add(slug);
          slugs.add(a.name);
          slugs.add(a.name.toLowerCase());
        }
      }
      setAccountNames(names);
      setAccountTypes(types);
      setPlayplaySlugs(slugs);
    });
  }, []);

  const allScores = useMemo(
    () => data?.posts.map((p) => p.engagement_score) ?? [],
    [data]
  );

  const platforms = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const p of data.posts) set.add(p.platform || "linkedin");
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data.posts;
    if (filterSectors.size > 0) {
      result = result.filter((p) => p.sector && filterSectors.has(p.sector));
    }
    if (filterFormats.size > 0) {
      result = result.filter((p) => {
        const fmt = normalizeFormat(p.format_family);
        return fmt && filterFormats.has(fmt);
      });
    }
    if (filterUseCases.size > 0) {
      result = result.filter((p) => p.claude_use_case && filterUseCases.has(p.claude_use_case));
    }
    if (filterPlatforms.size > 0) {
      result = result.filter((p) => filterPlatforms.has(p.platform || "linkedin"));
    }
    return result;
  }, [data, filterSectors, filterFormats, filterUseCases, filterPlatforms]);

  const hasActiveFilters = filterSectors.size > 0 || filterFormats.size > 0 || filterUseCases.size > 0 || filterPlatforms.size > 0;

  const resetAllFilters = () => {
    setFilterSectors(new Set());
    setFilterFormats(new Set());
    setFilterUseCases(new Set());
    setFilterPlatforms(new Set());
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  if (loading) {
    return <p className="text-center text-gray-400 py-8 text-sm">Loading library...</p>;
  }

  if (error) {
    return <p className="text-center text-red-500 py-8 text-sm">{error}</p>;
  }

  if (!data || data.posts.length === 0) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Library</h2>
        <p className="text-sm text-gray-400">No posts yet. Launch a search to populate the library.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Library</h2>
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-gray-400">Best posts across all searches</p>
            <div className="relative group/info">
              <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 group-hover/info:text-gray-600 group-hover/info:border-gray-400 inline-flex items-center justify-center text-[10px] font-medium transition-colors cursor-default">
                i
              </span>
              <div className="invisible opacity-0 group-hover/info:visible group-hover/info:opacity-100 transition-opacity absolute top-full left-0 mt-1.5 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80 text-xs text-gray-600 leading-relaxed">
                <p className="font-medium text-gray-900 mb-2">How posts are ranked</p>
                <p className="mb-2">
                  <span className="font-mono bg-gray-50 px-1 py-0.5 rounded text-gray-700">
                    Engagement Rate = (reactions + comments) / followers &times; 100
                  </span>
                </p>
                <p className="mb-1.5">Posts are ranked relative to audience size:</p>
                <div className="space-y-0.5 mb-2 pl-2 text-gray-500">
                  <p>100k+ followers &rarr; Viral &gt; 2% &middot; Engaging &ge; 0.5%</p>
                  <p>10k&ndash;100k &rarr; Viral &gt; 3% &middot; Engaging &ge; 1%</p>
                  <p>&lt; 10k &rarr; Viral &gt; 5% &middot; Engaging &ge; 2%</p>
                </div>
                <p className="text-gray-500">Top 10 per format + Top 10 per use case.</p>
                <p className="text-gray-500">Posts without follower data are excluded.</p>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={hasActiveFilters ? resetAllFilters : undefined}
          className={`text-xs transition-colors inline-flex items-center gap-1 ${
            hasActiveFilters
              ? "text-gray-500 hover:text-gray-700 cursor-pointer"
              : "text-gray-300 cursor-default"
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reset filters
        </button>
      </div>

      {/* Filter rows — stacked with dividers */}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white px-2.5 py-0.5">
        <div className="py-1.5">
          <FilterRow
            label="Platform"
            options={platforms}
            selected={filterPlatforms}
            onToggle={toggle(setFilterPlatforms)}
            onClear={() => setFilterPlatforms(new Set())}
            chipColor="bg-gray-50 text-gray-700 border-gray-200"
          />
        </div>
        <div className="py-1.5">
          <FilterRow
            label="Sector"
            options={data.sectors}
            selected={filterSectors}
            onToggle={toggle(setFilterSectors)}
            onClear={() => setFilterSectors(new Set())}
            chipColor="bg-gray-50 text-gray-700 border-gray-200"
          />
        </div>
        <div className="py-1.5">
          <FilterRow
            label="Format"
            options={data.format_families}
            selected={filterFormats}
            onToggle={toggle(setFilterFormats)}
            onClear={() => setFilterFormats(new Set())}
            chipColor="bg-gray-50 text-gray-700 border-gray-200"
          />
        </div>
        <div className="py-1.5">
          <FilterRow
            label="Use Case"
            options={data.use_cases}
            selected={filterUseCases}
            onToggle={toggle(setFilterUseCases)}
            onClear={() => setFilterUseCases(new Set())}
            chipColor="bg-gray-50 text-gray-700 border-gray-200"
          />
        </div>
      </div>

      {/* Post count */}
      <p className="text-xs text-gray-400">{filtered.length} posts</p>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            allScores={allScores}
            accountNames={accountNames}
            accountTypes={accountTypes}
            playplaySlugs={playplaySlugs}
            showSector
          />
        ))}
      </div>
    </div>
  );
}

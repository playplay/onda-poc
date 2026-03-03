import { useState, useEffect, useMemo } from "react";
import type { LibraryResponse } from "../types";
import { getLibrary, getAccounts } from "../api/client";
import PostCard, { normalizeFormat, formatLabel, shortUseCaseName } from "../components/PostCard";
import PostTable from "../components/PostTable";
import FilterDropdown from "../components/FilterDropdown";
import PlatformToggle, { type PlatformFilterValue } from "../components/PlatformToggle";
import { getEngagementPriority } from "../utils/engagement";

// Module-level cache with TTL
let libraryCache: { data: LibraryResponse; ts: number } | null = null;
const CACHE_TTL = 30_000;

function getCached(): LibraryResponse | null {
  if (libraryCache && Date.now() - libraryCache.ts < CACHE_TTL) {
    return libraryCache.data;
  }
  return null;
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
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterValue>("all");
  const [tab, setTab] = useState<"gallery" | "table">("gallery");

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
        // Map by TikTok username
        if (a.tiktok_url) {
          const ttMatch = a.tiktok_url.match(/tiktok\.com\/@([^/?\s]+)/);
          if (ttMatch) {
            const ttUser = ttMatch[1].toLowerCase();
            names.set(ttUser, a.name);
            types.set(ttUser, a.type);
            if (a.is_playplay_client) slugs.add(ttUser);
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

  const platformCounts = useMemo(() => {
    if (!data) return { linkedin: 0, instagram: 0, tiktok: 0 };
    const map = { linkedin: 0, instagram: 0, tiktok: 0 };
    for (const p of data.posts) {
      const plat = (p.platform || "linkedin") as "linkedin" | "instagram" | "tiktok";
      if (plat in map) map[plat]++;
    }
    return map;
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
    if (platformFilter !== "all") {
      result = result.filter((p) => (p.platform || "linkedin") === platformFilter);
    }
    // Sort by label (Viral > Engaging > Neutral), then by engagement_rate desc
    return [...result].sort((a, b) => {
      const pa = getEngagementPriority(a, allScores);
      const pb = getEngagementPriority(b, allScores);
      if (pa !== pb) return pa - pb;
      return (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1);
    });
  }, [data, allScores, filterSectors, filterFormats, filterUseCases, platformFilter]);

  const hasActiveFilters = filterSectors.size > 0 || filterFormats.size > 0 || filterUseCases.size > 0 || platformFilter !== "all";

  const resetAllFilters = () => {
    setFilterSectors(new Set());
    setFilterFormats(new Set());
    setFilterUseCases(new Set());
    setPlatformFilter("all");
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
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your Post Library</h2>
        <p className="text-sm text-gray-400">No posts yet. Launch a search to populate the library.</p>
      </div>
    );
  }

  // Collect active chips
  const activeChips: { key: string; label: string; color: string; onRemove: () => void }[] = [];
  for (const s of filterSectors) {
    activeChips.push({
      key: `sector-${s}`,
      label: s,
      color: "bg-white/60 text-gray-700 border-gray-200",
      onRemove: () => setFilterSectors((prev) => { const n = new Set(prev); n.delete(s); return n; }),
    });
  }
  for (const f of filterFormats) {
    activeChips.push({
      key: `fmt-${f}`,
      label: formatLabel(f),
      color: "bg-white/60 text-gray-700 border-gray-200",
      onRemove: () => setFilterFormats((prev) => { const n = new Set(prev); n.delete(f); return n; }),
    });
  }
  for (const uc of filterUseCases) {
    activeChips.push({
      key: `uc-${uc}`,
      label: shortUseCaseName(uc),
      color: "bg-white/60 text-gray-700 border-gray-200",
      onRemove: () => setFilterUseCases((prev) => { const n = new Set(prev); n.delete(uc); return n; }),
    });
  }

  return (
    <div className="space-y-0">
      {/* Hero header with gradient */}
      <div
        className="-mx-6 -mt-6 px-6 pt-8 pb-6 mb-6 rounded-b-2xl"
        style={{
          background: "linear-gradient(135deg, #faeefa 0%, #ffeef1 50%, #fff4ec 100%)",
        }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Post Library</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-sm text-gray-500">Best posts across all your searches</p>
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
                  <p className="text-gray-500">Top 10 per sector, format, use case and platform.</p>
                  <p className="text-gray-500">Posts without follower data are excluded.</p>
                </div>
              </div>
            </div>
          </div>
          <PlatformToggle
            value={platformFilter}
            onChange={setPlatformFilter}
            counts={platformCounts}
          />
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <FilterDropdown
            label="Sector"
            options={data.sectors}
            selected={filterSectors}
            onToggle={toggle(setFilterSectors)}
            onClear={() => setFilterSectors(new Set())}
          />
          <FilterDropdown
            label="Format"
            options={data.format_families}
            selected={filterFormats}
            onToggle={toggle(setFilterFormats)}
            onClear={() => setFilterFormats(new Set())}
            displayFn={formatLabel}
          />
          <FilterDropdown
            label="Use Case"
            options={data.use_cases}
            selected={filterUseCases}
            onToggle={toggle(setFilterUseCases)}
            onClear={() => setFilterUseCases(new Set())}
            displayFn={shortUseCaseName}
          />
          <button
            onClick={hasActiveFilters ? resetAllFilters : undefined}
            className={`ml-auto text-[11px] transition-colors inline-flex items-center gap-0.5 ${
              hasActiveFilters
                ? "text-gray-900 hover:text-black cursor-pointer"
                : "text-gray-400 cursor-default"
            }`}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reset filters
          </button>
        </div>

        {/* Chips area */}
        <div className="min-h-[28px] flex flex-wrap items-center gap-1 mt-2">
          {activeChips.length > 0 ? (
            activeChips.map((chip) => (
              <span
                key={chip.key}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chip.color}`}
              >
                <span className="truncate max-w-[160px]">{chip.label}</span>
                <button
                  onClick={chip.onRemove}
                  className="opacity-50 hover:opacity-100 ml-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-500">{filtered.length} posts</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200 mb-8">
        <button
          onClick={() => setTab("gallery")}
          className={`px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "gallery"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Gallery
        </button>
        <button
          onClick={() => setTab("table")}
          className={`px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "table"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Table
        </button>
      </div>

      {/* Content */}
      {tab === "gallery" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-4">
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              allScores={allScores}
              accountNames={accountNames}
              accountTypes={accountTypes}
              playplaySlugs={playplaySlugs}
              showSector
              showUseCase
            />
          ))}
        </div>
      )}
      {tab === "table" && (
        <div className="pt-4">
          <PostTable
            posts={filtered}
            accountNames={accountNames}
            accountTypes={accountTypes}
            playplaySlugs={playplaySlugs}
          />
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { LibraryResponse, Post, ScrapeJob, CustomSearchResult } from "../types";
import {
  getLibrary,
  getAccounts,
  getFavoriteIds,
  getFavoritePosts,
  addFavorite,
  removeFavorite,
  setPlayPlayFlag,
  getCustomSearch,
  listCustomSearches,
} from "../api/client";
import PostCard from "../components/PostCard";
import PostDetailModal from "../components/PostDetailModal";
import { normalizeFormat, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { buildAccountMaps } from "../utils/accounts";
import PostTable from "../components/PostTable";
import FilterDropdown from "../components/FilterDropdown";
import ViewSwitch from "../components/ViewSwitch";
import { getEngagementPriority } from "../utils/engagement";
import CustomSearchModal from "../components/CustomSearchModal";
import ImportFavoriteModal from "../components/ImportFavoriteModal";

type ViewTab = "library" | "portfolio" | "favorites" | "custom";

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function LibraryPage({ userRole }: { userRole: string }) {
  const navigate = useNavigate();
  const { search: locationSearch } = useLocation();
  const searchParams = new URLSearchParams(locationSearch);

  const rawTab = searchParams.get("tab") ?? "library";
  const activeTab: ViewTab = (["library", "portfolio", "favorites", "custom"].includes(rawTab) ? rawTab : "library") as ViewTab;
  const activeCustomSearchId = searchParams.get("search");
  const actionParam = searchParams.get("action");

  const setActiveTab = (tab: ViewTab) => navigate(`/library?tab=${tab}`, { replace: true });
  const setActiveCustomSearch = (id: string) => navigate(`/library?tab=custom&search=${id}`);

  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());
  const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());

  // Filters (shared across library/portfolio/favorites)
  const [filterSectors, setFilterSectors] = useState<Set<string>>(new Set());
  const [filterFormats, setFilterFormats] = useState<Set<string>>(new Set());
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());
  const [filterAccountTypes, setFilterAccountTypes] = useState<Set<string>>(new Set());
  const [filterParentAccounts, setFilterParentAccounts] = useState<Set<string>>(new Set());
  const [filterPlayPlay, setFilterPlayPlay] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");
  const [subTab, setSubTab] = useState<"all" | "lastWeek">("all");

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritePosts, setFavoritePosts] = useState<Post[]>([]);

  // Custom Search
  const [customSearches, setCustomSearches] = useState<ScrapeJob[]>([]);
  const [customSearchJob, setCustomSearchJob] = useState<ScrapeJob | null>(null);
  const [customSearchPosts, setCustomSearchPosts] = useState<Post[]>([]);
  const [showCustomSearchModal, setShowCustomSearchModal] = useState(false);
  const [customSearchLoading, setCustomSearchLoading] = useState(false);
  const [showImportFavoriteModal, setShowImportFavoriteModal] = useState(false);

  // Post detail modal
  const [modalPost, setModalPost] = useState<Post | null>(null);

  // Open modal when ?action=new_search
  useEffect(() => {
    if (actionParam === "new_search") {
      setShowCustomSearchModal(true);
      navigate("/library?tab=custom", { replace: true });
    }
  }, [actionParam, navigate]);

  // Reset subTab on tab change
  useEffect(() => {
    setSubTab("all");
  }, [activeTab]);

  // Load library data
  useEffect(() => {
    if (activeTab === "library" || activeTab === "portfolio") {
      setLoading(true);
      getLibrary(activeTab === "portfolio")
        .then((res) => setData(res))
        .catch((err) => setError(err.message || "Failed to load library"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [activeTab]);

  // Load accounts
  useEffect(() => {
    getAccounts().then((accounts) => {
      const { names, types, companyNames: cn, slugs } = buildAccountMaps(accounts);
      setAccountNames(names);
      setAccountTypes(types);
      setCompanyNames(cn);
      setPlayplaySlugs(slugs);
    });
  }, []);

  // Load favorite IDs
  useEffect(() => {
    getFavoriteIds().then((ids) => setFavoriteIds(new Set(ids))).catch(() => {});
  }, []);

  // Load favorite posts
  useEffect(() => {
    if (activeTab === "favorites") {
      getFavoritePosts().then(setFavoritePosts).catch(() => setFavoritePosts([]));
    }
  }, [activeTab]);

  // Load custom searches list (for landing page)
  useEffect(() => {
    if (activeTab === "custom") {
      listCustomSearches().then(setCustomSearches).catch(() => {});
    }
  }, [activeTab]);

  // Load specific custom search posts
  useEffect(() => {
    if (activeTab === "custom" && activeCustomSearchId) {
      setCustomSearchLoading(true);
      getCustomSearch(activeCustomSearchId)
        .then((result) => {
          setCustomSearchJob(result.job);
          setCustomSearchPosts(result.posts);
        })
        .catch(() => setCustomSearchPosts([]))
        .finally(() => setCustomSearchLoading(false));
    } else {
      setCustomSearchJob(null);
      setCustomSearchPosts([]);
    }
  }, [activeTab, activeCustomSearchId]);

  const postsToShow =
    activeTab === "favorites" ? favoritePosts
    : activeTab === "custom" ? customSearchPosts
    : (data?.posts ?? []);

  const allScores = useMemo(
    () => postsToShow.map((p) => p.engagement_score),
    [postsToShow]
  );

  const filtered = useMemo(() => {
    let result = postsToShow;
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
    if (filterAccountTypes.size > 0) {
      result = result.filter((p) => {
        const slug = (p.author_name || "").toLowerCase();
        const isPlayPlayPost = playplaySlugs.has(slug);
        const type = accountTypes.get(slug);
        if (filterAccountTypes.has("playplay") && isPlayPlayPost) return true;
        if (filterAccountTypes.has("company") && type === "company" && !isPlayPlayPost) return true;
        if (filterAccountTypes.has("person") && type === "person" && !isPlayPlayPost) return true;
        return false;
      });
    }
    if (filterParentAccounts.size > 0) {
      result = result.filter((p) => {
        const slug = (p.author_name || "").toLowerCase();
        const pa = companyNames.get(slug);
        return pa ? filterParentAccounts.has(pa) : false;
      });
    }
    if (filterPlayPlay.size > 0) {
      result = result.filter((p) => {
        if (filterPlayPlay.has("yes") && p.playplay_flag === true) return true;
        if (filterPlayPlay.has("no") && p.playplay_flag === false) return true;
        return false;
      });
    }
    if (subTab === "lastWeek") {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      result = result.filter((p) => p.publication_date && new Date(p.publication_date) >= oneWeekAgo);
    }
    return [...result].sort((a, b) => {
      const pa = getEngagementPriority(a, allScores);
      const pb = getEngagementPriority(b, allScores);
      if (pa !== pb) return pa - pb;
      return (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1);
    });
  }, [postsToShow, allScores, subTab, filterSectors, filterFormats, filterUseCases, filterAccountTypes, filterParentAccounts, filterPlayPlay, accountTypes, companyNames, playplaySlugs]);

  const hasActiveFilters = filterSectors.size > 0 || filterFormats.size > 0 || filterUseCases.size > 0 || filterAccountTypes.size > 0 || filterParentAccounts.size > 0 || filterPlayPlay.size > 0;
  const hasCustomDetailFilters = filterFormats.size > 0 || filterUseCases.size > 0;

  // Derive format/usecase options for custom search detail (must be before early returns)
  const customFormatFamilies = useMemo(() => {
    if (activeTab !== "custom" || !activeCustomSearchId) return [];
    const fmts = new Set<string>();
    for (const p of customSearchPosts) {
      const f = normalizeFormat(p.format_family);
      if (f) fmts.add(f);
    }
    return [...fmts].sort();
  }, [activeTab, activeCustomSearchId, customSearchPosts]);

  const customUseCases = useMemo(() => {
    if (activeTab !== "custom" || !activeCustomSearchId) return [];
    const ucs = new Set<string>();
    for (const p of customSearchPosts) {
      if (p.claude_use_case) ucs.add(p.claude_use_case);
    }
    return [...ucs].sort();
  }, [activeTab, activeCustomSearchId, customSearchPosts]);

  const parentAccountOptions = useMemo(() => {
    const opts = new Set<string>();
    for (const p of postsToShow) {
      const slug = (p.author_name || "").toLowerCase();
      const pa = companyNames.get(slug);
      if (pa) opts.add(pa);
    }
    return [...opts].sort();
  }, [postsToShow, companyNames]);

  const resetAllFilters = () => {
    setFilterSectors(new Set());
    setFilterFormats(new Set());
    setFilterUseCases(new Set());
    setFilterAccountTypes(new Set());
    setFilterParentAccounts(new Set());
    setFilterPlayPlay(new Set());
  };

  const resetCustomDetailFilters = () => {
    setFilterFormats(new Set());
    setFilterUseCases(new Set());
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const handleToggleFavorite = useCallback(async (postId: string) => {
    if (favoriteIds.has(postId)) {
      await removeFavorite(postId).catch(() => {});
      setFavoriteIds((prev) => { const n = new Set(prev); n.delete(postId); return n; });
      setFavoritePosts((prev) => prev.filter((p) => p.id !== postId));
    } else {
      await addFavorite(postId).catch(() => {});
      setFavoriteIds((prev) => new Set([...prev, postId]));
    }
  }, [favoriteIds]);

  const handleUpdatePost = useCallback((updated: Post) => {
    setModalPost(updated);
    setFavoritePosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setCustomSearchPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setData((prev) => prev
      ? { ...prev, posts: prev.posts.map((p) => p.id === updated.id ? updated : p) }
      : prev
    );
  }, []);

  const handleSetPlayPlayFlag = useCallback(async (flagType: "playplay" | "playplay_design", value: boolean) => {
    if (!modalPost) return;
    const optimisticPost = {
      ...modalPost,
      ...(flagType === "playplay" ? { playplay_flag: value } : { playplay_design_flag: value }),
    };
    handleUpdatePost(optimisticPost);
    try {
      const updated = await setPlayPlayFlag(modalPost.id, flagType, value);
      handleUpdatePost(updated);
    } catch {
      handleUpdatePost(modalPost);
    }
  }, [modalPost, handleUpdatePost]);

  // Derive filter options: from library API for library/portfolio, from posts for favorites
  const sectors = useMemo(() => {
    if (activeTab === "favorites") {
      const s = new Set<string>();
      for (const p of favoritePosts) if (p.sector) s.add(p.sector);
      return [...s].sort();
    }
    return data?.sectors ?? [];
  }, [activeTab, favoritePosts, data]);

  const formatFamilies = useMemo(() => {
    if (activeTab === "favorites") {
      const f = new Set<string>();
      for (const p of favoritePosts) { const fmt = normalizeFormat(p.format_family); if (fmt) f.add(fmt); }
      return [...f].sort();
    }
    return data?.format_families ?? [];
  }, [activeTab, favoritePosts, data]);

  const useCases = useMemo(() => {
    if (activeTab === "favorites") {
      const u = new Set<string>();
      for (const p of favoritePosts) if (p.claude_use_case) u.add(p.claude_use_case);
      return [...u].sort();
    }
    return data?.use_cases ?? [];
  }, [activeTab, favoritePosts, data]);

  if (loading && data === null && activeTab !== "favorites" && activeTab !== "custom") {
    return <p className="text-center text-gray-400 py-8 text-sm">Loading library...</p>;
  }

  if (error && data === null && (activeTab === "library" || activeTab === "portfolio")) {
    return <p className="text-center text-red-500 py-8 text-sm">{error}</p>;
  }

  // Active chips
  const activeChips: { key: string; label: string; color: string; onRemove: () => void }[] = [];
  if (activeTab !== "custom" || !activeCustomSearchId) {
    for (const s of filterSectors) {
      activeChips.push({ key: `sector-${s}`, label: s, color: "bg-white/60 text-gray-700 border-gray-200",
        onRemove: () => setFilterSectors((prev) => { const n = new Set(prev); n.delete(s); return n; }) });
    }
  }
  for (const f of filterFormats) {
    activeChips.push({ key: `fmt-${f}`, label: formatLabel(f), color: "bg-white/60 text-gray-700 border-gray-200",
      onRemove: () => setFilterFormats((prev) => { const n = new Set(prev); n.delete(f); return n; }) });
  }
  if (activeTab !== "custom" || !activeCustomSearchId) {
    for (const at of filterAccountTypes) {
      const accountTypeDisplay = (v: string) => v === "company" ? "Company" : v === "person" ? "Person" : "PlayPlay Client";
      activeChips.push({ key: `acct-${at}`, label: accountTypeDisplay(at), color: "bg-white/60 text-gray-700 border-gray-200",
        onRemove: () => setFilterAccountTypes((prev) => { const n = new Set(prev); n.delete(at); return n; }) });
    }
    for (const pa of filterParentAccounts) {
      activeChips.push({ key: `pa-${pa}`, label: pa, color: "bg-white/60 text-gray-700 border-gray-200",
        onRemove: () => setFilterParentAccounts((prev) => { const n = new Set(prev); n.delete(pa); return n; }) });
    }
    for (const pp of filterPlayPlay) {
      activeChips.push({ key: `pp-${pp}`, label: pp === "yes" ? "PlayPlay: Yes" : "PlayPlay: No",
        color: "bg-violet-50 text-violet-700 border-violet-200",
        onRemove: () => setFilterPlayPlay((prev) => { const n = new Set(prev); n.delete(pp); return n; }) });
    }
  }
  for (const uc of filterUseCases) {
    activeChips.push({ key: `uc-${uc}`, label: shortUseCaseName(uc), color: "bg-white/60 text-gray-700 border-gray-200",
      onRemove: () => setFilterUseCases((prev) => { const n = new Set(prev); n.delete(uc); return n; }) });
  }

  const heroTitle = activeTab === "portfolio" ? "My Portfolio"
    : activeTab === "favorites" ? "Favorites"
    : activeTab === "custom" && activeCustomSearchId
      ? (customSearchJob?.custom_account_name || customSearchJob?.custom_account_url || "Custom Search")
    : activeTab === "custom" ? "Custom Searches"
    : "Post Library";

  const subTabLabels = [
    { id: "lastWeek" as const, label: "Last Week" },
    { id: "all" as const, label: "All Posts" },
  ];

  // ── Custom Search landing page (no specific search selected) ──
  const isCustomLanding = activeTab === "custom" && !activeCustomSearchId;

  return (
    <div>
      {/* Hero header */}
      <div
        className="-mx-6 -mt-8 px-6 pt-8 pb-6 mb-6 rounded-b-2xl"
        style={{ background: "linear-gradient(135deg, #faeefa 0%, #ffeef1 50%, #fff4ec 100%)" }}
      >
        <h1 className="text-2xl font-bold text-gray-900">{heroTitle}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeTab === "portfolio"
            ? "Have a quick overview of your clients' posts"
            : activeTab === "favorites"
            ? "Create your custom library of posts"
            : activeTab === "custom" && activeCustomSearchId && customSearchJob
            ? `Launched on ${formatDateShort(customSearchJob.created_at)} · ${customSearchJob.total_posts ?? 0} posts scraped`
            : activeTab === "custom"
            ? "Launch and browse your own searches on any account"
            : "Browse posts from watched accounts"}
        </p>
      </div>

      {/* Modals */}
      {showCustomSearchModal && (
        <CustomSearchModal
          onClose={() => setShowCustomSearchModal(false)}
          onResult={(result: CustomSearchResult) => {
            setShowCustomSearchModal(false);
            setCustomSearches((prev) => [result.job, ...prev.filter((j) => j.id !== result.job.id)]);
            setCustomSearchJob(result.job);
            setCustomSearchPosts(result.posts);
            setActiveCustomSearch(result.job.id);
          }}
        />
      )}

      {showImportFavoriteModal && (
        <ImportFavoriteModal
          onClose={() => setShowImportFavoriteModal(false)}
          onSuccess={(post) => {
            setShowImportFavoriteModal(false);
            setFavoritePosts((prev) => [post, ...prev]);
            setFavoriteIds((prev) => new Set([...prev, post.id]));
          }}
        />
      )}

      {modalPost && (
        <PostDetailModal
          post={modalPost}
          allScores={allScores}
          accountTypes={accountTypes}
          accountNames={accountNames}
          playplaySlugs={playplaySlugs}
          isFavorite={favoriteIds.has(modalPost.id)}
          onToggleFavorite={handleToggleFavorite}
          onSetPlayPlayFlag={handleSetPlayPlayFlag}
          onClose={() => setModalPost(null)}
        />
      )}

      {/* ── Custom Search landing ── */}
      {isCustomLanding && (
        <>
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs text-gray-400">{customSearches.length} search{customSearches.length !== 1 ? "es" : ""}</span>
            <button
              onClick={() => setShowCustomSearchModal(true)}
              className="flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-violet-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Search
            </button>
          </div>

          {customSearches.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400 mb-1">No custom searches yet.</p>
              <button
                onClick={() => setShowCustomSearchModal(true)}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium"
              >
                Launch your first one →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {customSearches.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setActiveCustomSearch(job.id)}
                  className="text-left border border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md hover:border-violet-200 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate flex-1">
                      {job.custom_account_name || job.custom_account_url || "Search"}
                    </h3>
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      job.status === "completed" ? "bg-green-50 text-green-700"
                      : job.status === "failed" ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-600"
                    }`}>
                      {job.status === "completed" ? "Done" : job.status === "failed" ? "Failed" : "Running"}
                    </span>
                  </div>
                  {job.sector && (
                    <p className="text-xs text-gray-400 mb-3 truncate">{job.sector}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{job.total_posts ?? 0} posts</span>
                    <span className="text-gray-200">·</span>
                    <span>{new Date(job.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Favorites action bar (same level as Custom Search "New Search") ── */}
      {activeTab === "favorites" && (
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-gray-400">{favoritePosts.length} post{favoritePosts.length !== 1 ? "s" : ""}</span>
          <button
            onClick={() => setShowImportFavoriteModal(true)}
            className="flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-violet-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add a post from a link
          </button>
        </div>
      )}

      {/* ── Standard tabs (Library / Portfolio / Favorites) ── */}
      {activeTab !== "custom" && (
        <>
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 mb-8">
            {subTabLabels.map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  subTab === t.id
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter bar — 3 groups */}
          <div className="flex flex-col gap-1.5 pt-3">
            <div className="flex items-center gap-6">
              <div className="flex gap-1 flex-1 max-w-[260px]">
                <FilterDropdown label="Parent Account" className="flex-1"
                  options={parentAccountOptions} selected={filterParentAccounts}
                  onToggle={toggle(setFilterParentAccounts)} onClear={() => setFilterParentAccounts(new Set())} />
                <FilterDropdown label="Account" className="flex-1"
                  options={["company", "person", "playplay"]} selected={filterAccountTypes}
                  onToggle={toggle(setFilterAccountTypes)} onClear={() => setFilterAccountTypes(new Set())}
                  displayFn={(v) => v === "company" ? "Company" : v === "person" ? "Person" : "PlayPlay Client"} />
              </div>
              <div className="flex gap-1 flex-1 max-w-[260px]">
                <FilterDropdown label="Sector" className="flex-1"
                  options={sectors} selected={filterSectors}
                  onToggle={toggle(setFilterSectors)} onClear={() => setFilterSectors(new Set())} />
                <FilterDropdown label="Use Case" className="flex-1"
                  options={useCases} selected={filterUseCases}
                  onToggle={toggle(setFilterUseCases)} onClear={() => setFilterUseCases(new Set())}
                  displayFn={shortUseCaseName} />
              </div>
              <div className="flex gap-1 flex-1 max-w-[260px]">
                <FilterDropdown label="Format" className="flex-1"
                  options={formatFamilies} selected={filterFormats}
                  onToggle={toggle(setFilterFormats)} onClear={() => setFilterFormats(new Set())}
                  displayFn={formatLabel} />
                <FilterDropdown label="PlayPlay" className="flex-1"
                  options={["yes", "no"]} selected={filterPlayPlay}
                  onToggle={toggle(setFilterPlayPlay)} onClear={() => setFilterPlayPlay(new Set())}
                  displayFn={(v) => v === "yes" ? "Yes" : "No"} />
              </div>
              <button
                onClick={hasActiveFilters ? resetAllFilters : undefined}
                className={`text-[11px] transition-colors inline-flex items-center gap-0.5 ${
                  hasActiveFilters ? "text-gray-900 hover:text-black cursor-pointer" : "text-gray-400 cursor-default"
                }`}
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reset
              </button>
              <ViewSwitch value={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {/* Chips */}
          <div className="min-h-[28px] flex flex-wrap items-center gap-1 mt-2">
            {activeChips.length > 0 ? (
              activeChips.map((chip) => (
                <span key={chip.key} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chip.color}`}>
                  <span className="truncate max-w-[160px]">{chip.label}</span>
                  <button onClick={chip.onRemove} className="opacity-50 hover:opacity-100 ml-0.5">
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

          {/* Empty states */}
          {filtered.length === 0 && activeTab === "portfolio" && (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No accounts assigned to your portfolio yet.</p>
              <p className="text-xs text-gray-300 mt-1">Ask an admin to assign accounts to you.</p>
            </div>
          )}
          {filtered.length === 0 && activeTab === "favorites" && (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No favorites yet.</p>
              <p className="text-xs text-gray-300 mt-1">Click the star icon on any post to save it here, or import one by URL.</p>
            </div>
          )}
          {filtered.length === 0 && activeTab === "library" && !loading && (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No posts found.</p>
            </div>
          )}
        </>
      )}

      {/* ── Custom Search detail view ── */}
      {activeTab === "custom" && activeCustomSearchId && (
        <>
          {customSearchLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading posts...</p>
          ) : (
            <>
              {/* Minimal filter bar: Format + Use Case only */}
              <div className="flex items-center gap-3 pt-3 mb-2">
                <FilterDropdown label="Format"
                  options={customFormatFamilies} selected={filterFormats}
                  onToggle={toggle(setFilterFormats)} onClear={() => setFilterFormats(new Set())}
                  displayFn={formatLabel} />
                <FilterDropdown label="Use Case"
                  options={customUseCases} selected={filterUseCases}
                  onToggle={toggle(setFilterUseCases)} onClear={() => setFilterUseCases(new Set())}
                  displayFn={shortUseCaseName} />
                <button
                  onClick={hasCustomDetailFilters ? resetCustomDetailFilters : undefined}
                  className={`text-[11px] transition-colors inline-flex items-center gap-0.5 ${
                    hasCustomDetailFilters ? "text-gray-900 hover:text-black cursor-pointer" : "text-gray-400 cursor-default"
                  }`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reset
                </button>
                <div className="ml-auto">
                  <ViewSwitch value={viewMode} onChange={setViewMode} />
                </div>
              </div>

              <div className="min-h-[28px] flex flex-wrap items-center gap-1 mt-2">
                {activeChips.length > 0 ? (
                  activeChips.map((chip) => (
                    <span key={chip.key} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chip.color}`}>
                      <span className="truncate max-w-[160px]">{chip.label}</span>
                      <button onClick={chip.onRemove} className="opacity-50 hover:opacity-100 ml-0.5">
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

              {filtered.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm text-gray-400">No posts found for this search.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Posts grid (shared by all tabs with posts) ── */}
      {(activeTab !== "custom" || activeCustomSearchId) && !customSearchLoading && filtered.length > 0 && (
        <>
          {viewMode === "gallery" && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-4 transition-opacity duration-150 ${loading ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
              {filtered.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  allScores={allScores}
                  accountNames={accountNames}
                  accountTypes={accountTypes}
                  showSector
                  showUseCase
                  isFavorite={favoriteIds.has(post.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenModal={setModalPost}
                />
              ))}
            </div>
          )}
          {viewMode === "table" && (
            <div className={`pt-4 transition-opacity duration-150 ${loading ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
              <PostTable
                posts={filtered}
                accountNames={accountNames}
                accountTypes={accountTypes}
                companyNames={companyNames}
                onOpenModal={setModalPost}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

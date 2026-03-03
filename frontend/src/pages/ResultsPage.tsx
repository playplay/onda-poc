import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  getScrapeStatus,
  getPosts,
  getAccounts,
  getUseCasePivot,
  classifyUseCases,
} from "../api/client";
import type { ScrapeJob, Post, UseCasePivotResponse } from "../types";
import PostGallery from "../components/PostGallery";
import PostTable from "../components/PostTable";
import FilterDropdown from "../components/FilterDropdown";
import ViewSwitch from "../components/ViewSwitch";
import { normalizeFormat, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { mapLookup, setHas } from "../utils/maps";
import { getEngagementPriority } from "../utils/engagement";
import { buildAccountMaps } from "../utils/accounts";

// Module-level cache for completed job data — survives re-mounts
const jobDataCache = new Map<
  string,
  {
    posts: Post[];
    useCasePivot?: UseCasePivotResponse;
    accountNames: Map<string, string>;
    accountTypes: Map<string, "company" | "person">;
    companyNames: Map<string, string>;
    playplaySlugs: Set<string>;
  }
>();

// Sector-level accounts cache — shared across jobs of same sector
const accountsCache = new Map<
  string,
  { names: Map<string, string>; types: Map<string, "company" | "person">; companyNames: Map<string, string>; slugs: Set<string> }
>();

interface Props {
  jobs: ScrapeJob[];
  refreshJobs: () => Promise<void>;
}

const PLATFORM_OPTIONS = ["linkedin", "instagram", "tiktok"];
const platformDisplayFn = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const accountDisplayFn = (v: string) => v === "company" ? "Companies" : v === "person" ? "Persons" : "PlayPlay Client";

export default function ResultsPage({ jobs, refreshJobs }: Props) {
  const { jobId } = useParams<{ jobId: string }>();

  // Derive job from props — instant, no API call needed
  const job = useMemo(
    () => jobs.find((j) => j.id === jobId) ?? null,
    [jobs, jobId]
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");
  const [useCasePivot, setUseCasePivot] = useState<UseCasePivotResponse | null>(null);

  // Shared filter state
  const [filterPlatforms, setFilterPlatforms] = useState<Set<string>>(new Set());
  const [filterFormats, setFilterFormats] = useState<Set<string>>(new Set());
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());
  const [filterAccountType, setFilterAccountType] = useState<Set<string>>(new Set());

  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());
  const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(val)) next.delete(val);
        else next.add(val);
        return next;
      });
    },
    []
  );

  // Load completed job data (posts + pivot + accounts — all together)
  const loadCompletedData = useCallback(
    async (id: string, sector: string | null) => {
      // Load accounts from cache or API
      let accts = sector ? accountsCache.get(sector) : undefined;
      const acctPromise = (!accts && sector)
        ? getAccounts(sector).then((raw) => {
            const built = buildAccountMaps(raw);
            accountsCache.set(sector!, built);
            return built;
          })
        : Promise.resolve(accts || { names: new Map<string, string>(), types: new Map<string, "company" | "person">(), companyNames: new Map<string, string>(), slugs: new Set<string>() });

      const [postsData, pivotData, acctData] = await Promise.all([
        getPosts(id),
        getUseCasePivot(id),
        acctPromise,
      ]);

      // Deduplicate posts by post_url
      const seen = new Set<string>();
      const uniquePosts = postsData.filter((p) => {
        if (!p.post_url || seen.has(p.post_url)) return false;
        seen.add(p.post_url);
        return true;
      });

      // Set ALL state at once — no flash
      setPosts(uniquePosts);
      setUseCasePivot(pivotData);
      setAccountNames(acctData.names);
      setAccountTypes(acctData.types);
      setCompanyNames(acctData.companyNames);
      setPlayplaySlugs(acctData.slugs);

      // Populate cache
      jobDataCache.set(id, {
        posts: uniquePosts,
        useCasePivot: pivotData,
        accountNames: acctData.names,
        accountTypes: acctData.types,
        companyNames: acctData.companyNames,
        playplaySlugs: acctData.slugs,
      });

      // If no classifications yet, trigger in background
      if (pivotData.status !== "ready" && uniquePosts.length > 0) {
        classifyUseCases(id)
          .then(async () => {
            const [updated, refreshedPosts] = await Promise.all([
              getUseCasePivot(id),
              getPosts(id),
            ]);
            setUseCasePivot(updated);
            const refreshSeen = new Set<string>();
            const refreshedUnique = refreshedPosts.filter((p) => {
              if (!p.post_url || refreshSeen.has(p.post_url)) return false;
              refreshSeen.add(p.post_url);
              return true;
            });
            setPosts(refreshedUnique);
            if (jobDataCache.has(id)) {
              const cached = jobDataCache.get(id)!;
              jobDataCache.set(id, { ...cached, useCasePivot: updated, posts: refreshedUnique });
            }
          })
          .catch((err) => {
            console.error("Use case classification failed:", err);
            jobDataCache.delete(id);
          });
      }
    },
    []
  );

  // On jobId change: restore from cache or clear state
  useEffect(() => {
    const cached = jobId ? jobDataCache.get(jobId) : undefined;
    if (cached) {
      setPosts(cached.posts);
      setUseCasePivot(cached.useCasePivot ?? null);
      setAccountNames(cached.accountNames);
      setAccountTypes(cached.accountTypes);
      setCompanyNames(cached.companyNames);
      setPlayplaySlugs(cached.playplaySlugs);
    } else {
      setPosts([]);
      setUseCasePivot(null);
    }
  }, [jobId]);

  // Load data when job is completed — show cached posts instantly, classify in background
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    const cached = jobDataCache.get(jobId);
    if (cached) {
      if (cached.useCasePivot?.status !== "ready" && cached.posts.length > 0) {
        classifyUseCases(jobId)
          .then(async () => {
            const [updated, refreshedPosts] = await Promise.all([
              getUseCasePivot(jobId),
              getPosts(jobId),
            ]);
            setUseCasePivot(updated);
            const seen = new Set<string>();
            const uniquePosts = refreshedPosts.filter((p) => {
              if (!p.post_url || seen.has(p.post_url)) return false;
              seen.add(p.post_url);
              return true;
            });
            setPosts(uniquePosts);
            jobDataCache.set(jobId, { ...cached, useCasePivot: updated, posts: uniquePosts });
          })
          .catch((err) => {
            console.error("Use case classification failed:", err);
            jobDataCache.delete(jobId);
          });
      }
      return;
    }
    loadCompletedData(jobId, job?.sector ?? null);
  }, [jobId, job?.status, job?.sector, loadCompletedData]);

  // Poll only for in-progress jobs (triggers backend processing)
  useEffect(() => {
    if (!jobId || !job) return;
    if (job.status === "completed" || job.status === "failed") return;

    const interval = setInterval(async () => {
      const s = await getScrapeStatus(jobId);
      if (s.status === "completed" || s.status === "failed") {
        refreshJobs();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, job?.status, refreshJobs]);

  // Platform counts
  const platformCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const plat = p.platform || "linkedin";
      map.set(plat, (map.get(plat) || 0) + 1);
    }
    return map;
  }, [posts]);

  const allScores = useMemo(() => posts.map((p) => p.engagement_score), [posts]);

  // Format counts & options
  const formatCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const fmt = normalizeFormat(p.format_family);
      if (fmt) map.set(fmt, (map.get(fmt) || 0) + 1);
    }
    return map;
  }, [posts]);

  const formatOptions = useMemo(
    () => Array.from(formatCounts.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k),
    [formatCounts]
  );

  // Use case counts & options
  const useCaseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      if (p.claude_use_case) {
        map.set(p.claude_use_case, (map.get(p.claude_use_case) || 0) + 1);
      }
    }
    return map;
  }, [posts]);

  const useCaseOptions = useMemo(
    () => Array.from(useCaseCounts.keys()),
    [useCaseCounts]
  );

  // Account type counts & options
  const accountTypeCounts = useMemo(() => {
    const counts = { company: 0, person: 0, playplay: 0 };
    for (const p of posts) {
      const t = mapLookup(accountTypes, p.author_name || "");
      if (t === "company") counts.company++;
      else if (t === "person") counts.person++;
      if (setHas(playplaySlugs, p.author_name || "")) counts.playplay++;
    }
    return counts;
  }, [posts, accountTypes, playplaySlugs]);

  const accountOptions = useMemo(() => {
    const opts: string[] = [];
    if (accountTypeCounts.company > 0) opts.push("company");
    if (accountTypeCounts.person > 0) opts.push("person");
    if (accountTypeCounts.playplay > 0) opts.push("playplay");
    return opts;
  }, [accountTypeCounts]);

  const accountCountMap = useMemo(() => {
    const map = new Map<string, number>();
    map.set("company", accountTypeCounts.company);
    map.set("person", accountTypeCounts.person);
    map.set("playplay", accountTypeCounts.playplay);
    return map;
  }, [accountTypeCounts]);

  // Filtered + sorted posts for the Posts tab
  const filteredPosts = useMemo(() => {
    let result = posts;
    if (filterPlatforms.size > 0) {
      result = result.filter((p) => filterPlatforms.has(p.platform || "linkedin"));
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
    if (filterAccountType.size > 0) {
      result = result.filter((p) => {
        const author = p.author_name || "";
        for (const f of filterAccountType) {
          if (f === "playplay" && setHas(playplaySlugs, author)) return true;
          if (f === "company" && mapLookup(accountTypes, author) === "company") return true;
          if (f === "person" && mapLookup(accountTypes, author) === "person") return true;
        }
        return false;
      });
    }
    return [...result].sort((a, b) => {
      const pa = getEngagementPriority(a, allScores);
      const pb = getEngagementPriority(b, allScores);
      if (pa !== pb) return pa - pb;
      return (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1);
    });
  }, [posts, allScores, filterPlatforms, filterFormats, filterUseCases, filterAccountType, accountTypes, playplaySlugs]);

  const hasActivePostFilters = filterPlatforms.size > 0 || filterFormats.size > 0 || filterUseCases.size > 0 || filterAccountType.size > 0;

  const resetAllFilters = useCallback(() => {
    setFilterPlatforms(new Set());
    setFilterFormats(new Set());
    setFilterUseCases(new Set());
    setFilterAccountType(new Set());
  }, []);

  // Collect active chips for Posts tab
  const activeChips: { key: string; label: string; color: string; onRemove: () => void }[] = [];
  for (const plat of filterPlatforms) {
    activeChips.push({
      key: `plat-${plat}`,
      label: platformDisplayFn(plat),
      color: "bg-gray-50 text-gray-700 border-gray-200",
      onRemove: () => setFilterPlatforms((prev) => { const n = new Set(prev); n.delete(plat); return n; }),
    });
  }
  for (const uc of filterUseCases) {
    activeChips.push({
      key: `uc-${uc}`,
      label: shortUseCaseName(uc),
      color: "bg-gray-50 text-gray-700 border-gray-200",
      onRemove: () => setFilterUseCases((prev) => { const n = new Set(prev); n.delete(uc); return n; }),
    });
  }
  for (const at of filterAccountType) {
    activeChips.push({
      key: `acct-${at}`,
      label: accountDisplayFn(at),
      color: "bg-gray-50 text-gray-700 border-gray-200",
      onRemove: () => setFilterAccountType((prev) => { const n = new Set(prev); n.delete(at); return n; }),
    });
  }
  for (const f of filterFormats) {
    activeChips.push({
      key: `fmt-${f}`,
      label: formatLabel(f),
      color: "bg-gray-50 text-gray-700 border-gray-200",
      onRemove: () => setFilterFormats((prev) => { const n = new Set(prev); n.delete(f); return n; }),
    });
  }

  // Rotating scraping messages
  const scrapingMessages = [
    "Scraping LinkedIn posts...",
    "Scraping Instagram posts...",
    "Scraping TikTok posts...",
  ];
  const [scrapingMsgIndex, setScrapingMsgIndex] = useState(0);
  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "running")) return;
    const timer = setInterval(() => {
      setScrapingMsgIndex((i) => (i + 1) % scrapingMessages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [job?.status]);

  if (!job) {
    return <p className="text-center text-gray-400 py-8">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {job.sector || job.search_query}
          </h2>
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-gray-400">
              {posts.length} posts scraped
            </p>
            <div className="relative group/info">
              <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 group-hover/info:text-gray-600 group-hover/info:border-gray-400 inline-flex items-center justify-center text-[10px] font-medium transition-colors cursor-default">
                i
              </span>
              <div className="invisible opacity-0 group-hover/info:visible group-hover/info:opacity-100 transition-opacity absolute top-full left-0 mt-1.5 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80 text-xs text-gray-600 leading-relaxed">
                <p className="font-medium text-gray-900 mb-2">How posts are selected</p>
                <p className="mb-2">
                  Best 3 posts out of the 10 last posts of each account, ranked by engagement rate.
                </p>
                <p className="mb-2">
                  <span className="font-mono bg-gray-50 px-1 py-0.5 rounded text-gray-700">
                    Engagement Rate = (reactions + comments) / followers &times; 100
                  </span>
                </p>
                <p className="text-gray-500">All posts released less than 48 hours ago are excluded.</p>
              </div>
            </div>
          </div>
        </div>
        <span className="text-sm text-gray-400 shrink-0">
          {new Date(job.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      {/* Loading state: scraping */}
      {(job.status === "pending" || job.status === "running") && (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full mb-3" />
          <p className="text-gray-700 font-medium text-sm">
            {scrapingMessages[scrapingMsgIndex]}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            This may take a few minutes depending on the number of results.
          </p>
        </div>
      )}

      {/* Loading state: downloading videos */}
      {job.status === "downloading_videos" && (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full mb-3" />
          <p className="text-gray-700 font-medium text-sm">
            Downloading video URLs...
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Fetching direct MP4 links for {job.total_posts ?? 0} video posts.
          </p>
        </div>
      )}

      {/* Error state */}
      {job.status === "failed" && (
        <div className="border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-medium text-sm">Scrape failed</p>
          <p className="text-red-500 text-xs mt-1">{job.error_message}</p>
        </div>
      )}

      {/* Results */}
      {job.status === "completed" && (
        <div className="space-y-0">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <FilterDropdown
                  label="Platform"
                  options={PLATFORM_OPTIONS}
                  selected={filterPlatforms}
                  onToggle={toggle(setFilterPlatforms)}
                  onClear={() => setFilterPlatforms(new Set())}
                  displayFn={platformDisplayFn}
                  countMap={platformCountMap}
                />
                <FilterDropdown
                  label="Use Cases"
                  options={useCaseOptions}
                  selected={filterUseCases}
                  onToggle={toggle(setFilterUseCases)}
                  onClear={() => setFilterUseCases(new Set())}
                  displayFn={shortUseCaseName}
                  countMap={useCaseCounts}
                />
                <FilterDropdown
                  label="Account"
                  options={accountOptions}
                  selected={filterAccountType}
                  onToggle={toggle(setFilterAccountType)}
                  onClear={() => setFilterAccountType(new Set())}
                  displayFn={accountDisplayFn}
                  countMap={accountCountMap}
                />
                <FilterDropdown
                  label="Format"
                  options={formatOptions}
                  selected={filterFormats}
                  onToggle={toggle(setFilterFormats)}
                  onClear={() => setFilterFormats(new Set())}
                  displayFn={formatLabel}
                  countMap={formatCounts}
                />
                <button
                  onClick={hasActivePostFilters ? resetAllFilters : undefined}
                  className={`text-[11px] transition-colors inline-flex items-center gap-0.5 ${
                    hasActivePostFilters
                      ? "text-gray-500 hover:text-gray-700 cursor-pointer"
                      : "text-gray-300 cursor-default"
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

              {/* Chips area */}
              <div className="min-h-[28px] flex flex-wrap items-center gap-1 mt-1.5 mb-4">
                {activeChips.length > 0 ? (
                  activeChips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chip.color}`}
                    >
                      <span className="truncate max-w-[180px]">{chip.label}</span>
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
                  <span className="text-xs text-gray-400">{filteredPosts.length} posts</span>
                )}
              </div>

              {/* Gallery or Table */}
              {viewMode === "gallery" ? (
                <PostGallery
                  posts={filteredPosts}
                  allScores={allScores}
                  playplaySlugs={playplaySlugs}
                  accountNames={accountNames}
                  accountTypes={accountTypes}
                  showSector
                  showUseCase
                />
              ) : (
                <PostTable
                  posts={filteredPosts}
                  accountNames={accountNames}
                  accountTypes={accountTypes}
                  companyNames={companyNames}
                />
              )}
            </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  getScrapeStatus,
  getPosts,
  getAccounts,
  getUseCasePivot,
  classifyUseCases,
} from "../api/client";
import type { ScrapeJob, Post, UseCasePivotResponse, UseCasePivotRow } from "../types";
import PostGallery from "../components/PostGallery";
import UseCaseTable from "../components/UseCaseTable";
import PlatformToggle from "../components/PlatformToggle";
import FilterDropdown from "../components/FilterDropdown";
import { normalizeFormat, mapLookup, setHas } from "../components/PostCard";

// Module-level cache for completed job data — survives re-mounts
const jobDataCache = new Map<
  string,
  {
    posts: Post[];
    useCasePivot?: UseCasePivotResponse;
    accountNames: Map<string, string>;
    accountTypes: Map<string, "company" | "person">;
    playplaySlugs: Set<string>;
  }
>();

// Sector-level accounts cache — shared across jobs of same sector
const accountsCache = new Map<
  string,
  { names: Map<string, string>; types: Map<string, "company" | "person">; slugs: Set<string> }
>();

function buildAccountMaps(accounts: { name: string; type: "company" | "person"; linkedin_url?: string | null; instagram_url?: string | null; is_playplay_client?: boolean }[]) {
  const names = new Map<string, string>();
  const types = new Map<string, "company" | "person">();
  const slugs = new Set<string>();
  for (const a of accounts) {
    const match = a.linkedin_url?.match(/\/(in|company)\/([^/]+)/);
    const slug = match ? match[2] : "";
    if (slug) {
      names.set(slug, a.name);
      types.set(slug, a.type);
    }
    names.set(a.name, a.name);
    types.set(a.name, a.type);
    names.set(a.name.toLowerCase(), a.name);
    types.set(a.name.toLowerCase(), a.type);
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
      if (slug) slugs.add(slug);
      slugs.add(a.name);
      slugs.add(a.name.toLowerCase());
    }
  }
  return { names, types, slugs };
}

interface Props {
  jobs: ScrapeJob[];
  refreshJobs: () => Promise<void>;
}

export default function ResultsPage({ jobs, refreshJobs }: Props) {
  const { jobId } = useParams<{ jobId: string }>();

  // Derive job from props — instant, no API call needed
  const job = useMemo(
    () => jobs.find((j) => j.id === jobId) ?? null,
    [jobs, jobId]
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<"gallery" | "usecases">("gallery");
  const [useCasePivot, setUseCasePivot] = useState<UseCasePivotResponse | null>(null);

  // Gallery filters set from UseCaseTable navigation
  const [galleryFilterFormat, setGalleryFilterFormat] = useState<string | null>(null);
  const [galleryFilterUseCases, setGalleryFilterUseCases] = useState<Set<string>>(new Set());
  const [platformFilter, setPlatformFilter] = useState<"all" | "linkedin" | "instagram">("all");
  const [ucAccountFilter, setUcAccountFilter] = useState<Set<string>>(new Set());
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());

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
        : Promise.resolve(accts || { names: new Map<string, string>(), types: new Map<string, "company" | "person">(), slugs: new Set<string>() });

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
      setPlayplaySlugs(acctData.slugs);

      // Populate cache
      jobDataCache.set(id, {
        posts: uniquePosts,
        useCasePivot: pivotData,
        accountNames: acctData.names,
        accountTypes: acctData.types,
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
      setPlayplaySlugs(cached.playplaySlugs);
    } else {
      setPosts([]);
      setUseCasePivot(null);
    }
  }, [jobId]);

  // Load data when job is completed and not cached (or cache has stale classification)
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    const cached = jobDataCache.get(jobId);
    if (cached && cached.useCasePivot?.status === "ready") return;
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

  // Platform counts for toggle
  const platformCounts = useMemo(() => {
    const map = { linkedin: 0, instagram: 0 };
    for (const p of posts) {
      const plat = (p.platform || "linkedin") as "linkedin" | "instagram";
      if (plat in map) map[plat]++;
    }
    return map;
  }, [posts]);

  // Account type options & counts for the Use Cases tab filter
  const ucAccountOptions = useMemo(() => {
    const counts = { company: 0, person: 0, playplay: 0 };
    for (const p of posts) {
      const t = mapLookup(accountTypes, p.author_name || "");
      if (t === "company") counts.company++;
      else if (t === "person") counts.person++;
      if (setHas(playplaySlugs, p.author_name || "")) counts.playplay++;
    }
    const opts: string[] = [];
    if (counts.company > 0) opts.push("company");
    if (counts.person > 0) opts.push("person");
    if (counts.playplay > 0) opts.push("playplay");
    return { opts, counts };
  }, [posts, accountTypes, playplaySlugs]);

  const ucAccountCountMap = useMemo(() => {
    const map = new Map<string, number>();
    map.set("company", ucAccountOptions.counts.company);
    map.set("person", ucAccountOptions.counts.person);
    map.set("playplay", ucAccountOptions.counts.playplay);
    return map;
  }, [ucAccountOptions]);

  // When filters are active, recompute pivot from posts
  const hasUcFilters = platformFilter !== "all" || ucAccountFilter.size > 0;
  const filteredPivot = useMemo(() => {
    if (!hasUcFilters || !useCasePivot) return useCasePivot;
    let filtered = posts;
    if (platformFilter !== "all") {
      filtered = filtered.filter((p) => (p.platform || "linkedin") === platformFilter);
    }
    if (ucAccountFilter.size > 0) {
      filtered = filtered.filter((p) => {
        const author = p.author_name || "";
        for (const f of ucAccountFilter) {
          if (f === "playplay" && setHas(playplaySlugs, author)) return true;
          if (f === "company" && mapLookup(accountTypes, author) === "company") return true;
          if (f === "person" && mapLookup(accountTypes, author) === "person") return true;
        }
        return false;
      });
    }
    const byUseCase = new Map<string, { counts: Record<string, number>; total: number; bestUrl: string | null; bestEng: number }>();
    const fmtSet = new Set<string>();
    for (const p of filtered) {
      if (!p.claude_use_case) continue;
      let entry = byUseCase.get(p.claude_use_case);
      if (!entry) {
        entry = { counts: {}, total: 0, bestUrl: null, bestEng: -1 };
        byUseCase.set(p.claude_use_case, entry);
      }
      const fmt = normalizeFormat(p.format_family);
      if (fmt) {
        entry.counts[fmt] = (entry.counts[fmt] || 0) + 1;
        fmtSet.add(fmt);
      }
      entry.total++;
      if ((p.engagement_rate ?? 0) > entry.bestEng) {
        entry.bestEng = p.engagement_rate ?? 0;
        entry.bestUrl = p.post_url || null;
      }
    }
    const rows: UseCasePivotRow[] = Array.from(byUseCase.entries())
      .map(([uc, d]) => ({
        use_case: uc,
        total: d.total,
        counts_by_format: d.counts,
        best_post_url: d.bestUrl,
        best_post_engagement: d.bestEng,
      }))
      .sort((a, b) => b.total - a.total);
    return {
      rows,
      format_families: useCasePivot.format_families.filter((f) => fmtSet.has(f)),
      status: useCasePivot.status,
    } as UseCasePivotResponse;
  }, [hasUcFilters, platformFilter, ucAccountFilter, useCasePivot, posts, accountTypes, playplaySlugs]);

  const handleUseCaseCellClick = useCallback(
    (useCase: string | null, format: string | null) => {
      setGalleryFilterUseCases(useCase ? new Set([useCase]) : new Set());
      setGalleryFilterFormat(format);
      setTab("gallery");
    },
    []
  );

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
            Scraping LinkedIn posts...
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
        <>
          {/* Tabs + PlatformToggle */}
          <div className="flex items-center gap-4 border-b border-gray-200">
            <button
              onClick={() => setTab("gallery")}
              className={`px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "gallery"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              Posts
            </button>
            <button
              onClick={() => setTab("usecases")}
              className={`px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "usecases"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              Use Cases
            </button>
            <div className="ml-auto pb-1">
              <PlatformToggle
                value={platformFilter}
                onChange={setPlatformFilter}
                counts={platformCounts}
              />
            </div>
          </div>

          {tab === "usecases" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <FilterDropdown
                  label="Account"
                  options={ucAccountOptions.opts}
                  selected={ucAccountFilter}
                  onToggle={(val) => {
                    setUcAccountFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(val)) next.delete(val);
                      else next.add(val);
                      return next;
                    });
                  }}
                  onClear={() => setUcAccountFilter(new Set())}
                  displayFn={(v) => v === "company" ? "Companies" : v === "person" ? "Persons" : "PlayPlay Client"}
                  countMap={ucAccountCountMap}
                />
              </div>
              <UseCaseTable
                rows={filteredPivot?.rows ?? []}
                formatFamilies={filteredPivot?.format_families ?? []}
                status={filteredPivot?.status ?? "classifying"}
                onCellClick={handleUseCaseCellClick}
              />
            </div>
          )}
          {tab === "gallery" && (
            <PostGallery
              posts={posts}
              playplaySlugs={playplaySlugs}
              accountNames={accountNames}
              accountTypes={accountTypes}
              externalFilterFormat={galleryFilterFormat}
              externalFilterUseCases={galleryFilterUseCases}
              onFiltersApplied={() => { setGalleryFilterFormat(null); setGalleryFilterUseCases(new Set()); }}
              filterPlatform={platformFilter === "all" ? null : platformFilter}
              showSector
              showUseCase
            />
          )}
        </>
      )}
    </div>
  );
}

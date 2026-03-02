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
import { normalizeFormat } from "../components/PostCard";

// Module-level cache for completed job data — survives re-mounts
const jobDataCache = new Map<
  string,
  { posts: Post[]; useCasePivot?: UseCasePivotResponse }
>();

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
  const [ucPlatformFilter, setUcPlatformFilter] = useState<string | null>(null);
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());

  // Load completed job data
  const loadCompletedData = useCallback(
    async (id: string) => {
      const [postsData, pivotData] = await Promise.all([
        getPosts(id),
        getUseCasePivot(id),
      ]);
      // Deduplicate posts by post_url
      const seen = new Set<string>();
      const uniquePosts = postsData.filter((p) => {
        if (!p.post_url || seen.has(p.post_url)) return false;
        seen.add(p.post_url);
        return true;
      });
      setPosts(uniquePosts);
      setUseCasePivot(pivotData);

      // Populate cache
      jobDataCache.set(id, {
        posts: uniquePosts,
        useCasePivot: pivotData,
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
            // Refresh posts so claude_use_case is available for Gallery filter
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
            // Clear cache so next visit retries classification
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
    } else {
      setPosts([]);
      setUseCasePivot(null);
    }
  }, [jobId]);

  // Build account name map + PlayPlay slugs from watched accounts
  useEffect(() => {
    if (!job?.sector) return;
    getAccounts(job.sector).then((accounts) => {
      const names = new Map<string, string>();
      const slugs = new Set<string>();
      const types = new Map<string, "company" | "person">();
      for (const a of accounts) {
        const match = a.linkedin_url?.match(/\/(in|company)\/([^/]+)/);
        const slug = match ? match[2] : "";
        if (!slug) continue;
        // Map by slug (companies + new person scrapes use slug as author_name)
        names.set(slug, a.name);
        types.set(slug, a.type);
        // Also map by display name (old Apify person posts use full name as author_name)
        names.set(a.name, a.name);
        types.set(a.name, a.type);
        // Case-insensitive fallback for name mismatches (e.g. "Antoine le Nel" vs "Antoine Le Nel")
        names.set(a.name.toLowerCase(), a.name);
        types.set(a.name.toLowerCase(), a.type);
        // Map by Instagram username (IG posts use username as author_name)
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
  }, [job?.sector]);

  // Load data when job is completed and not cached (or cache has stale classification)
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    const cached = jobDataCache.get(jobId);
    if (cached && cached.useCasePivot?.status === "ready") return;
    loadCompletedData(jobId);
  }, [jobId, job?.status, loadCompletedData]);

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

  // Platform counts for the Use Cases tab filter
  const ucPlatformCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const plat = p.platform || "linkedin";
      map.set(plat, (map.get(plat) || 0) + 1);
    }
    return map;
  }, [posts]);

  // When a platform filter is active on Use Cases tab, recompute pivot from posts
  const filteredPivot = useMemo(() => {
    if (!ucPlatformFilter || !useCasePivot) return useCasePivot;
    const filtered = posts.filter((p) => (p.platform || "linkedin") === ucPlatformFilter);
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
  }, [ucPlatformFilter, useCasePivot, posts]);

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
          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-200">
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
          </div>

          {tab === "usecases" && (
            <div className="space-y-4">
              {/* Platform filter for Use Cases tab */}
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white px-2.5 py-0.5">
                <div className="py-1.5 flex items-center gap-2 min-h-[28px]">
                  <span className="w-[120px] shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-600 inline-flex items-center">
                    Platform
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1">
                    {([
                      { key: "linkedin", label: "LinkedIn", count: ucPlatformCounts.get("linkedin") || 0, active: "bg-blue-50 text-blue-700 border-blue-200" },
                      { key: "instagram", label: "Instagram", count: ucPlatformCounts.get("instagram") || 0, active: "bg-pink-50 text-pink-600 border-pink-200" },
                    ]).filter(({ count }) => count > 0).map(({ key, label, count, active }) => (
                      <button
                        key={key}
                        onClick={() => setUcPlatformFilter(ucPlatformFilter === key ? null : key)}
                        className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                          ucPlatformFilter === key
                            ? active
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                    {ucPlatformFilter && (
                      <button
                        onClick={() => setUcPlatformFilter(null)}
                        className="ml-auto text-[11px] text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-0.5"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reset
                      </button>
                    )}
                  </div>
                </div>
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
            />
          )}
        </>
      )}
    </div>
  );
}

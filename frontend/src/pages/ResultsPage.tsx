import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getScrapeStatus,
  getPosts,
  getRanking,
  startAnalysis,
  processNextAnalysis,
  getAnalysis,
  getAnalysesByJob,
  getAccounts,
  getUseCasePivot,
  classifyUseCases,
} from "../api/client";
import type { ScrapeJob, Post, RankedTrend, GeminiAnalysis, UseCasePivotResponse } from "../types";
import PostGallery from "../components/PostGallery";
import TrendRanking from "../components/TrendRanking";
import UseCaseTable from "../components/UseCaseTable";
import type { AnalysisStatus } from "../components/TrendRanking";

// Module-level cache for completed job data — survives re-mounts
const jobDataCache = new Map<
  string,
  { posts: Post[]; trends: RankedTrend[]; analyses: GeminiAnalysis[]; useCasePivot?: UseCasePivotResponse }
>();

interface Props {
  jobs: ScrapeJob[];
  refreshJobs: () => Promise<void>;
}

export default function ResultsPage({ jobs, refreshJobs }: Props) {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  // Derive job from props — instant, no API call needed
  const job = useMemo(
    () => jobs.find((j) => j.id === jobId) ?? null,
    [jobs, jobId]
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [trends, setTrends] = useState<RankedTrend[]>([]);
  const [tab, setTab] = useState<"gallery" | "usecases" | "trends">("gallery");
  const [useCasePivot, setUseCasePivot] = useState<UseCasePivotResponse | null>(null);

  // Gallery filters set from UseCaseTable navigation
  const [galleryFilterFormat, setGalleryFilterFormat] = useState<string | null>(null);
  const [galleryFilterUseCases, setGalleryFilterUseCases] = useState<Set<string>>(new Set());
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());

  // Analysis state per trend rank
  const [analysisStatus, setAnalysisStatus] = useState<Record<number, AnalysisStatus>>({});
  const [analyses, setAnalyses] = useState<GeminiAnalysis[]>([]);

  const allPostScores = useMemo(
    () => posts.map((p) => p.engagement_score),
    [posts]
  );

  // Helper: derive analysis status from trends + analyses
  const deriveAnalysisStatus = useCallback(
    (trendsData: RankedTrend[], existingAnalyses: GeminiAnalysis[]) => {
      if (existingAnalyses.length === 0) {
        setAnalysisStatus({});
        return;
      }
      const analyzedPostIds = new Set(existingAnalyses.map((a) => a.post_id));
      const statusMap: Record<number, AnalysisStatus> = {};
      for (const trend of trendsData) {
        const videoIds = trend.top_posts
          .filter((p) => p.video_url)
          .map((p) => p.id);
        if (videoIds.length > 0 && videoIds.every((id) => analyzedPostIds.has(id))) {
          statusMap[trend.rank] = "done";
        }
      }
      setAnalysisStatus(statusMap);
    },
    []
  );

  // Load completed job data + restore existing analyses from DB
  const loadCompletedData = useCallback(
    async (id: string) => {
      const [postsData, trendsData, existingAnalyses, pivotData] = await Promise.all([
        getPosts(id),
        getRanking(id),
        getAnalysesByJob(id),
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
      setTrends(trendsData);
      setAnalyses(existingAnalyses);
      setUseCasePivot(pivotData);
      deriveAnalysisStatus(trendsData, existingAnalyses);

      // Populate cache
      jobDataCache.set(id, {
        posts: uniquePosts,
        trends: trendsData,
        analyses: existingAnalyses,
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
    [deriveAnalysisStatus]
  );

  // On jobId change: restore from cache or clear state
  useEffect(() => {
    const cached = jobId ? jobDataCache.get(jobId) : undefined;
    if (cached) {
      setPosts(cached.posts);
      setTrends(cached.trends);
      setAnalyses(cached.analyses);
      setUseCasePivot(cached.useCasePivot ?? null);
      deriveAnalysisStatus(cached.trends, cached.analyses);
    } else {
      setPosts([]);
      setTrends([]);
      setAnalyses([]);
      setUseCasePivot(null);
      setAnalysisStatus({});
    }
  }, [jobId, deriveAnalysisStatus]);

  // Build account name map + PlayPlay slugs from watched accounts
  useEffect(() => {
    if (!job?.sector) return;
    getAccounts(job.sector).then((accounts) => {
      const names = new Map<string, string>();
      const slugs = new Set<string>();
      const types = new Map<string, "company" | "person">();
      for (const a of accounts) {
        const match = a.linkedin_url.match(/\/(in|company)\/([^/]+)/);
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

  // Launch analysis: one-at-a-time processing loop
  const handleLaunchAnalysis = useCallback(
    async (rank: number, postIds: string[]) => {
      setAnalysisStatus((prev) => ({ ...prev, [rank]: "analyzing" }));

      try {
        // Fetch existing analyses first
        const existingResults = await Promise.all(
          postIds.map((id) => getAnalysis(id))
        );
        const existing = existingResults.filter(
          (a): a is GeminiAnalysis => a !== null
        );
        if (existing.length > 0) {
          setAnalyses((prev) => {
            const ids = new Set(prev.map((a) => a.id));
            return [...prev, ...existing.filter((a) => !ids.has(a.id))];
          });
        }

        // Start analysis (returns counts)
        const existingPostIds = new Set(existing.map((a) => a.post_id));
        const toAnalyze = postIds.filter((id) => !existingPostIds.has(id));

        if (toAnalyze.length > 0) {
          await startAnalysis(toAnalyze);

          // Process one post at a time in a loop
          let done = false;
          while (!done) {
            const progress = await processNextAnalysis(toAnalyze);
            if (progress.current_analysis) {
              setAnalyses((prev) => {
                const ids = new Set(prev.map((a) => a.id));
                if (ids.has(progress.current_analysis!.id)) return prev;
                return [...prev, progress.current_analysis!];
              });
            }
            done = progress.all_done;
          }
        }

        setAnalysisStatus((prev) => ({ ...prev, [rank]: "done" }));

        // Update cache with new analyses
        if (jobId && jobDataCache.has(jobId)) {
          const cached = jobDataCache.get(jobId)!;
          jobDataCache.set(jobId, {
            ...cached,
            analyses: [...analyses, ...existing],
          });
        }
      } catch (err) {
        console.error("Analysis failed:", err);
        setAnalysisStatus((prev) => ({ ...prev, [rank]: "error" }));
      }
    },
    [jobId, analyses]
  );

  const handleNavigateToTrend = useCallback(
    (rank: number) => {
      navigate(`/results/${jobId}/trend/${rank}`);
    },
    [jobId, navigate]
  );

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
          <p className="text-sm text-gray-400">
            {posts.length} posts scraped
          </p>
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
            <button
              onClick={() => setTab("trends")}
              className={`px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "trends"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              Trend Ranking
            </button>
          </div>

          {tab === "usecases" && (
            <UseCaseTable
              rows={useCasePivot?.rows ?? []}
              formatFamilies={useCasePivot?.format_families ?? []}
              status={useCasePivot?.status ?? "classifying"}
              onCellClick={handleUseCaseCellClick}
            />
          )}
          {tab === "trends" && (
            <TrendRanking
              trends={trends}
              allPostScores={allPostScores}
              analyses={analyses}
              analysisStatus={analysisStatus}
              onLaunchAnalysis={handleLaunchAnalysis}
              onNavigateToTrend={handleNavigateToTrend}
            />
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

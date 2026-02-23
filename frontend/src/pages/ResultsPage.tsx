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
} from "../api/client";
import type { ScrapeJob, Post, RankedTrend, GeminiAnalysis } from "../types";
import PostGallery from "../components/PostGallery";
import TrendRanking from "../components/TrendRanking";
import type { AnalysisStatus } from "../components/TrendRanking";

// Module-level cache for completed job data — survives re-mounts
const jobDataCache = new Map<
  string,
  { posts: Post[]; trends: RankedTrend[]; analyses: GeminiAnalysis[] }
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
  const [tab, setTab] = useState<"trends" | "gallery">("gallery");
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());

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
      const [postsData, trendsData, existingAnalyses] = await Promise.all([
        getPosts(id),
        getRanking(id),
        getAnalysesByJob(id),
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
      deriveAnalysisStatus(trendsData, existingAnalyses);

      // Populate cache
      jobDataCache.set(id, {
        posts: uniquePosts,
        trends: trendsData,
        analyses: existingAnalyses,
      });
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
      deriveAnalysisStatus(cached.trends, cached.analyses);
    } else {
      setPosts([]);
      setTrends([]);
      setAnalyses([]);
      setAnalysisStatus({});
    }
  }, [jobId, deriveAnalysisStatus]);

  // Build account name map + PlayPlay slugs from watched accounts
  useEffect(() => {
    if (!job?.sector) return;
    getAccounts(job.sector).then((accounts) => {
      const names = new Map<string, string>();
      const slugs = new Set<string>();
      for (const a of accounts) {
        const match = a.linkedin_url.match(/\/(in|company)\/([^/]+)/);
        const slug = match ? match[2] : "";
        if (!slug) continue;
        names.set(slug, a.name);
        if (a.is_playplay_client) slugs.add(slug);
      }
      setAccountNames(names);
      setPlayplaySlugs(slugs);
    });
  }, [job?.sector]);

  // Load data when job is completed and not cached
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    if (jobDataCache.has(jobId)) return;
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
          {new Date(job.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
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
              Gallery
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
          {tab === "gallery" && <PostGallery posts={posts} playplaySlugs={playplaySlugs} accountNames={accountNames} />}
        </>
      )}
    </div>
  );
}

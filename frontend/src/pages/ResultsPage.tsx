import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getScrapeStatus,
  getPosts,
  getRanking,
  triggerAnalysis,
  getAnalysis,
} from "../api/client";
import type { ScrapeJob, Post, RankedTrend, GeminiAnalysis } from "../types";
import ResultsTable from "../components/ResultsTable";
import TrendRanking from "../components/TrendRanking";
import type { AnalysisStatus } from "../components/TrendRanking";
import AnalysisModal from "../components/AnalysisModal";

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [trends, setTrends] = useState<RankedTrend[]>([]);
  const [tab, setTab] = useState<"table" | "trends">("trends");

  // Analysis state per trend rank
  const [analysisStatus, setAnalysisStatus] = useState<Record<number, AnalysisStatus>>({});
  const [analyses, setAnalyses] = useState<GeminiAnalysis[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPosts, setModalPosts] = useState<Post[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      const status = await getScrapeStatus(jobId);
      setJob(status);

      if (status.status === "completed") {
        const [postsData, trendsData] = await Promise.all([
          getPosts(jobId),
          getRanking(jobId),
        ]);
        setPosts(postsData);
        setTrends(trendsData);
      }
    };

    poll();
    const interval = setInterval(async () => {
      const status = await getScrapeStatus(jobId);
      setJob(status);
      if (status.status === "completed" || status.status === "failed") {
        clearInterval(interval);
        if (status.status === "completed") {
          const [postsData, trendsData] = await Promise.all([
            getPosts(jobId),
            getRanking(jobId),
          ]);
          setPosts(postsData);
          setTrends(trendsData);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  // Launch analysis (button click -> loader)
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

        // Trigger analysis for posts that don't have results yet
        const existingPostIds = new Set(existing.map((a) => a.post_id));
        const toAnalyze = postIds.filter((id) => !existingPostIds.has(id));

        if (toAnalyze.length > 0) {
          const results = await triggerAnalysis(toAnalyze);
          setAnalyses((prev) => {
            const ids = new Set(prev.map((a) => a.id));
            return [...prev, ...results.filter((a) => !ids.has(a.id))];
          });
        }

        setAnalysisStatus((prev) => ({ ...prev, [rank]: "done" }));
      } catch (err) {
        console.error("Analysis failed:", err);
        setAnalysisStatus((prev) => ({ ...prev, [rank]: "error" }));
      }
    },
    []
  );

  // View analysis (green button -> open modal)
  const handleViewAnalysis = useCallback(
    (rank: number, postIds: string[]) => {
      const targetPosts = posts.filter((p) => postIds.includes(p.id));
      setModalPosts(targetPosts);
      setModalLoading(false);
      setModalOpen(true);
    },
    [posts]
  );

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  if (!job) {
    return <p className="text-center text-gray-500 py-8">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-blue-600 hover:underline text-sm">
            &larr; New Scrape
          </Link>
          <h2 className="text-xl font-bold mt-1">
            Results: &quot;{job.search_query}&quot;
          </h2>
          <p className="text-sm text-gray-500">
            {job.sector && `Sector: ${job.sector} · `}
            {job.content_type_filter && `Type: ${job.content_type_filter} · `}
            {job.total_posts ?? 0} posts scraped
          </p>
        </div>
        <div>
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              job.status === "completed"
                ? "bg-green-100 text-green-800"
                : job.status === "failed"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {job.status}
          </span>
        </div>
      </div>

      {/* Loading state */}
      {(job.status === "pending" || job.status === "running") && (
        <div className="bg-blue-50 rounded-lg p-8 text-center">
          <div className="animate-spin inline-block w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mb-3" />
          <p className="text-blue-700 font-medium">
            Scraping LinkedIn posts...
          </p>
          <p className="text-blue-500 text-sm mt-1">
            This may take a few minutes depending on the number of results.
          </p>
        </div>
      )}

      {/* Error state */}
      {job.status === "failed" && (
        <div className="bg-red-50 rounded-lg p-6">
          <p className="text-red-700 font-medium">Scrape failed</p>
          <p className="text-red-500 text-sm mt-1">{job.error_message}</p>
        </div>
      )}

      {/* Results */}
      {job.status === "completed" && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setTab("trends")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                tab === "trends"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Trend Ranking
            </button>
            <button
              onClick={() => setTab("table")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                tab === "table"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              All Posts ({posts.length})
            </button>
          </div>

          {tab === "trends" && (
            <TrendRanking
              trends={trends}
              allPostScores={posts.map((p) => p.engagement_score)}
              analysisStatus={analysisStatus}
              onLaunchAnalysis={handleLaunchAnalysis}
              onViewAnalysis={handleViewAnalysis}
            />
          )}
          {tab === "table" && <ResultsTable posts={posts} />}
        </>
      )}

      {/* Analysis Modal */}
      <AnalysisModal
        open={modalOpen}
        onClose={handleCloseModal}
        posts={modalPosts}
        analyses={analyses}
        loading={modalLoading}
      />
    </div>
  );
}

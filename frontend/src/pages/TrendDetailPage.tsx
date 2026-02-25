import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { getTrendDetail, streamTrendSummary } from "../api/client";
import type { Post, GeminiAnalysis, AnalysisRow } from "../types";
import AnalysisTable from "../components/AnalysisTable";
import AnalysisFilters from "../components/AnalysisFilters";
import { getEngagementLabel } from "../utils/engagement";
import {
  FAMILY_LABELS,
  ANALYSIS_FILTERABLE_FIELDS,
  type AnalysisFilterKey,
  type AnalysisFilterState,
} from "../types";

const EMPTY_FILTERS: AnalysisFilterState = Object.fromEntries(
  ANALYSIS_FILTERABLE_FIELDS.map((k) => [k, ""])
) as AnalysisFilterState;

export default function TrendDetailPage() {
  const { jobId, rank } = useParams<{ jobId: string; rank: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [analyses, setAnalyses] = useState<GeminiAnalysis[]>([]);
  const [trendInfo, setTrendInfo] = useState<{
    rank: number;
    format_family: string;
    post_count: number;
    avg_engagement_score: number;
  } | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AnalysisFilterState>(EMPTY_FILTERS);

  // Fetch trend posts + analyses
  useEffect(() => {
    if (!jobId || !rank) return;
    getTrendDetail(jobId, Number(rank)).then((data) => {
      setTrendInfo(data.trend);
      setPosts(data.posts);
      setAnalyses(data.analyses);
      setLoading(false);
    });
  }, [jobId, rank]);

  // Stream AI summary
  useEffect(() => {
    if (!jobId || !rank) return;
    setSummaryLoading(true);
    setSummary("");
    const cleanup = streamTrendSummary(
      jobId,
      Number(rank),
      (chunk) => setSummary((prev) => prev + chunk),
      () => setSummaryLoading(false),
      (err) => {
        setSummary((prev) => prev + `\n\nError: ${err}`);
        setSummaryLoading(false);
      }
    );
    return cleanup;
  }, [jobId, rank]);

  // Build analysis rows
  const rows: AnalysisRow[] = useMemo(() => {
    const analysisMap = new Map<string, GeminiAnalysis>();
    for (const a of analyses) analysisMap.set(a.post_id, a);
    return posts.map((post) => ({
      post,
      analysis: analysisMap.get(post.id) ?? null,
    }));
  }, [posts, analyses]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!row.analysis) return true;
      for (const key of ANALYSIS_FILTERABLE_FIELDS) {
        const filterVal = filters[key];
        if (!filterVal) continue;
        const cellVal = row.analysis[key as keyof GeminiAnalysis];
        if (typeof cellVal === "string" && cellVal !== filterVal) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const allScores = useMemo(
    () => posts.map((p) => p.engagement_score),
    [posts]
  );

  const avgEng = trendInfo
    ? getEngagementLabel(
        { engagement_rate: null, author_follower_count: null, engagement_score: trendInfo.avg_engagement_score },
        allScores,
      )
    : null;

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full mb-3" />
        <p className="text-gray-400 text-sm">Loading trend data...</p>
      </div>
    );
  }

  if (!trendInfo) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-400 text-sm">Trend not found.</p>
        <Link to={`/results/${jobId}`} className="text-gray-500 hover:text-gray-700 text-sm mt-2 inline-block">
          &larr; Back to results
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to={`/results/${jobId}`} className="text-gray-500 hover:text-gray-700 text-sm">
          &larr; Back to results
        </Link>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-3xl font-bold text-accent-500">
            #{trendInfo.rank}
          </span>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {FAMILY_LABELS[trendInfo.format_family] || trendInfo.format_family}
            </h2>
            <p className="text-sm text-gray-400">
              {trendInfo.post_count} posts
              {avgEng && (
                <span className={`ml-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${avgEng.className}`}>
                  {avgEng.label}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-gray-900">AI Summary</h3>
          {summaryLoading && (
            <div className="animate-spin w-3.5 h-3.5 border-2 border-accent-500 border-t-transparent rounded-full" />
          )}
        </div>
        {summary ? (
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
            {summary.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={i} className="text-gray-900">{part.slice(2, -2)}</strong>;
              }
              return <span key={i}>{part}</span>;
            })}
          </div>
        ) : summaryLoading ? (
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-5/6 animate-pulse" />
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No summary available.</p>
        )}
      </div>

      {/* Filters */}
      <div className="border border-gray-200 rounded-lg px-4 py-3 bg-white">
        <AnalysisFilters
          filters={filters}
          onChange={(key: AnalysisFilterKey, value: string) =>
            setFilters((prev) => ({ ...prev, [key]: value }))
          }
          onReset={() => setFilters(EMPTY_FILTERS)}
        />
      </div>

      {/* Posts Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Posts ({filteredRows.length} of {rows.length})
          </h3>
        </div>
        <AnalysisTable rows={filteredRows} />
      </div>
    </div>
  );
}

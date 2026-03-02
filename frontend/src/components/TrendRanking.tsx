import { FAMILY_LABELS, type RankedTrend, type GeminiAnalysis } from "../types";
import { getEngagementLabel } from "../utils/engagement";

export type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

interface Props {
  trends: RankedTrend[];
  allPostScores?: number[];
  analyses?: GeminiAnalysis[];
  analysisStatus?: Record<number, AnalysisStatus>;
  onLaunchAnalysis?: (rank: number, postIds: string[]) => void;
  onNavigateToTrend?: (rank: number) => void;
}

function getMode(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let max = 0;
  let result: string | null = null;
  for (const [k, c] of counts) {
    if (c > max) {
      max = c;
      result = k;
    }
  }
  return result;
}

export default function TrendRanking({
  trends,
  allPostScores,
  analyses = [],
  analysisStatus = {},
  onLaunchAnalysis,
  onNavigateToTrend,
}: Props) {
  const scores =
    allPostScores && allPostScores.length > 0
      ? allPostScores
      : trends.flatMap((t) => t.top_posts.map((p) => p.engagement_score));

  if (trends.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No trends yet.</p>;
  }

  const analysisMap = new Map<string, GeminiAnalysis>();
  for (const a of analyses) {
    analysisMap.set(a.post_id, a);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Top Trends by Format</h3>
      {trends.map((trend) => {
        const videoPostIds = trend.top_posts
          .filter((p) => p.video_url)
          .map((p) => p.id);
        const allPostIds = trend.top_posts.map((p) => p.id);
        const avgEng = getEngagementLabel(
          { engagement_rate: null, author_follower_count: null, engagement_score: trend.avg_engagement_rate },
          scores,
        );
        const status = analysisStatus[trend.rank] ?? "idle";

        const relevantAnalyses = allPostIds
          .map((id) => analysisMap.get(id))
          .filter((a): a is GeminiAnalysis => !!a);

        const primaryUseCase = getMode(relevantAnalyses.map((a) => a.use_case));
        const businessObjective = getMode(relevantAnalyses.map((a) => a.business_objective));
        const creativeExecution = getMode(relevantAnalyses.map((a) => a.creative_execution));
        const hasAnalysis = relevantAnalyses.length > 0;

        return (
          <div
            key={trend.rank}
            className={`border rounded-lg bg-white p-5 transition-colors ${
              trend.rank <= 3
                ? "border-l-4 border-l-accent-400 border-t-gray-200 border-r-gray-200 border-b-gray-200"
                : "border-gray-200"
            } ${onNavigateToTrend && status === "done" ? "hover:border-gray-300 cursor-pointer" : ""}`}
            onClick={() => {
              if (onNavigateToTrend && status === "done") {
                onNavigateToTrend(trend.rank);
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`text-2xl font-bold ${
                    trend.rank <= 3 ? "text-accent-500" : "text-gray-300"
                  }`}
                >
                  #{trend.rank}
                </span>
                <div>
                  <div className="font-medium text-gray-900">
                    {FAMILY_LABELS[trend.format_family] || trend.format_family}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {trend.post_count} posts
                  </div>
                </div>
              </div>
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${avgEng.className}`}
              >
                {avgEng.label}
              </span>
            </div>

            {hasAnalysis && (
              <div className="mt-3 space-y-2">
                {primaryUseCase && (
                  <p className="text-sm text-gray-600">
                    <span className="text-gray-400">Main use case:</span>{" "}
                    <span className="font-medium">{primaryUseCase}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {businessObjective && (
                    <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {businessObjective}
                    </span>
                  )}
                  {creativeExecution && (
                    <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {creativeExecution}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!hasAnalysis && status === "idle" && (
              <p className="mt-3 text-xs text-gray-400">
                Run analysis to see insights
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              {videoPostIds.length > 0 && (
                <>
                  {status === "idle" && onLaunchAnalysis && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchAnalysis(trend.rank, videoPostIds);
                      }}
                      className="bg-violet-600 text-white text-xs px-4 py-1.5 rounded hover:bg-violet-700 transition-colors"
                    >
                      Launch Analysis ({videoPostIds.length} videos)
                    </button>
                  )}
                  {status === "analyzing" && (
                    <button
                      disabled
                      className="bg-gray-200 text-gray-500 text-xs px-4 py-1.5 rounded flex items-center gap-2"
                    >
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full" />
                      Analyzing...
                    </button>
                  )}
                  {status === "done" && onNavigateToTrend && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToTrend(trend.rank);
                      }}
                      className="bg-violet-600 text-white text-xs px-4 py-1.5 rounded hover:bg-violet-700 transition-colors"
                    >
                      View Trend →
                    </button>
                  )}
                  {status === "error" && onLaunchAnalysis && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchAnalysis(trend.rank, videoPostIds);
                      }}
                      className="bg-red-50 text-red-700 text-xs px-4 py-1.5 rounded hover:bg-red-100 transition-colors"
                    >
                      Retry Analysis
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

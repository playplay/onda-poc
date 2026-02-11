import { useState } from "react";
import type { RankedTrend } from "../types";
import { getEngagementLabel } from "../utils/engagement";

export type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

interface Props {
  trends: RankedTrend[];
  allPostScores?: number[];
  analysisStatus?: Record<number, AnalysisStatus>;
  onLaunchAnalysis?: (rank: number, postIds: string[]) => void;
  onViewAnalysis?: (rank: number, postIds: string[]) => void;
}

const FAMILY_LABELS: Record<string, string> = {
  short_video: "Short Video (<90s)",
  long_video: "Long Video (>90s)",
  static: "Static (Image/Doc)",
  text: "Text Only",
  unknown: "Unknown",
};

export default function TrendRanking({
  trends,
  allPostScores,
  analysisStatus = {},
  onLaunchAnalysis,
  onViewAnalysis,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  // Fallback: derive scores from top_posts if allPostScores not provided
  const scores =
    allPostScores && allPostScores.length > 0
      ? allPostScores
      : trends.flatMap((t) => t.top_posts.map((p) => p.engagement_score));

  if (trends.length === 0) {
    return <p className="text-gray-500 text-center py-8">No trends yet.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Top Trends by Format</h3>
      {trends.map((trend) => {
        const isOpen = expanded === trend.rank;
        const videoPostIds = trend.top_posts
          .filter((p) => p.video_url)
          .map((p) => p.id);
        const avgEng = getEngagementLabel(trend.avg_engagement_score, scores);
        const status = analysisStatus[trend.rank] ?? "idle";

        return (
          <div
            key={trend.rank}
            className={`border rounded-lg overflow-hidden ${
              trend.rank <= 3
                ? "border-yellow-400 bg-yellow-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div
              className="flex items-center justify-between p-4 cursor-pointer"
              onClick={() => setExpanded(isOpen ? null : trend.rank)}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-2xl font-bold ${
                    trend.rank <= 3 ? "text-yellow-600" : "text-gray-400"
                  }`}
                >
                  #{trend.rank}
                </span>
                <div>
                  <div className="font-medium">
                    {FAMILY_LABELS[trend.format_family] || trend.format_family}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    {trend.post_count} posts · Avg engagement:{" "}
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${avgEng.className}`}
                    >
                      {avgEng.label}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
            </div>

            {isOpen && (
              <div className="border-t px-4 pb-4">
                <ul className="mt-2 space-y-2">
                  {trend.top_posts.map((post) => {
                    const eng = getEngagementLabel(
                      post.engagement_score,
                      scores
                    );
                    return (
                      <li
                        key={post.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="truncate max-w-md flex items-center gap-2">
                          {post.title?.slice(0, 60) || "—"}
                          <span
                            className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${eng.className}`}
                          >
                            {eng.label}
                          </span>
                        </div>
                        {post.post_url && (
                          <a
                            href={post.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline ml-2 shrink-0"
                          >
                            View
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {videoPostIds.length > 0 && (
                  <div className="mt-3">
                    {status === "idle" && onLaunchAnalysis && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunchAnalysis(trend.rank, videoPostIds);
                        }}
                        className="bg-purple-600 text-white text-sm px-4 py-1.5 rounded hover:bg-purple-700"
                      >
                        Launch AI Analysis ({videoPostIds.length} videos)
                      </button>
                    )}
                    {status === "analyzing" && (
                      <button
                        disabled
                        className="bg-purple-500 text-white text-sm px-4 py-1.5 rounded opacity-80 flex items-center gap-2"
                      >
                        <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                        Analyzing...
                      </button>
                    )}
                    {status === "done" && onViewAnalysis && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewAnalysis(trend.rank, videoPostIds);
                        }}
                        className="bg-green-600 text-white text-sm px-4 py-1.5 rounded hover:bg-green-700"
                      >
                        See Analysis
                      </button>
                    )}
                    {status === "error" && onLaunchAnalysis && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onLaunchAnalysis(trend.rank, videoPostIds);
                        }}
                        className="bg-red-600 text-white text-sm px-4 py-1.5 rounded hover:bg-red-700"
                      >
                        Retry Analysis
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

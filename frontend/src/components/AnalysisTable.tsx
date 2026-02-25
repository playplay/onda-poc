import { useMemo } from "react";
import type { AnalysisRow } from "../types";
import { getEngagementLabel } from "../utils/engagement";

interface Props {
  rows: AnalysisRow[];
  loading?: boolean;
}

const ENGAGEMENT_TOOLTIP = "Performance based on: (reactions + comments + shares + clicks) / impressions × 100";

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-2 py-2 text-xs whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}

function TextCell({ value, max = 60 }: { value: string | null; max?: number }) {
  const text = value || "—";
  const truncated = text.length > max ? text.slice(0, max) + "…" : text;
  return (
    <td className="px-2 py-2 text-xs max-w-[200px]" title={text}>
      <span className="block truncate">{truncated}</span>
    </td>
  );
}

function Badge({ value }: { value: string | boolean | null }) {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span className="capitalize">{value}</span>;
}

const HEADER_GROUPS = [
  { label: "Post Info", cols: ["Title", "Author", "Format"] },
  { label: "Metrics", cols: ["Eng.", "React.", "Comm.", "Shares", "Impr."] },
  { label: "Link", cols: [""] },
  { label: "Strategy", cols: ["Objective", "Use Case", "Audience", "ICP"] },
  { label: "Style", cols: ["Tone", "Content Style", "Story", "Execution"] },
  { label: "Script", cols: ["Hook", "Outline", "CTA"] },
  { label: "Technical", cols: ["Voice Lang", "Text Lang", "Interview", "Dynamism", "Media"] },
];

export default function AnalysisTable({ rows, loading }: Props) {
  const allScores = useMemo(
    () => rows.map((r) => r.post.engagement_score),
    [rows]
  );

  if (rows.length === 0 && !loading) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts to display.</p>;
  }

  return (
    <div className="overflow-auto max-h-[65vh]">
      <table className="min-w-max w-full text-left">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50">
            {HEADER_GROUPS.map((g) => (
              <th
                key={g.label}
                colSpan={g.cols.length}
                className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 last:border-r-0"
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="bg-white">
            {HEADER_GROUPS.flatMap((g) =>
              g.cols.map((col, i) => {
                if (g.label === "Metrics" && col === "Eng.") {
                  return (
                    <th
                      key={`${g.label}-${i}`}
                      className="px-2 py-1.5 text-[10px] font-medium text-gray-400 uppercase border-b border-gray-200 whitespace-nowrap group relative"
                    >
                      <span className="flex items-center gap-0.5">
                        {col}
                        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-gray-200 text-gray-500 text-[8px] font-bold cursor-help shrink-0">?</span>
                      </span>
                      <div className="invisible group-hover:visible absolute z-20 top-full left-0 mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg font-normal normal-case tracking-normal">
                        {ENGAGEMENT_TOOLTIP}
                      </div>
                    </th>
                  );
                }
                return (
                  <th
                    key={`${g.label}-${i}`}
                    className="px-2 py-1.5 text-[10px] font-medium text-gray-400 uppercase border-b border-gray-200 whitespace-nowrap"
                  >
                    {col}
                  </th>
                );
              })
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const { post, analysis } = row;
            const eng = getEngagementLabel(post, allScores);
            const a = analysis;
            const pending = !a && loading;

            return (
              <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                {/* Post Info */}
                <Cell className="max-w-[200px] font-medium text-gray-700">
                  <span className="block truncate" title={post.title || "—"}>
                    {post.title?.slice(0, 60) || "—"}
                  </span>
                </Cell>
                <Cell>{post.author_name || "—"}</Cell>
                <Cell>
                  <span className="inline-block bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded">
                    {post.format_family || "—"}
                  </span>
                </Cell>

                {/* Metrics */}
                <Cell>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${eng.className}`}>
                    {eng.label}
                  </span>
                </Cell>
                <Cell>{post.reactions}</Cell>
                <Cell>{post.comments}</Cell>
                <Cell>{post.shares}</Cell>
                <Cell>{post.impressions}</Cell>

                {/* Link */}
                <Cell>
                  {post.post_url ? (
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-900 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
                </Cell>

                {/* Analysis columns */}
                {pending ? (
                  <td colSpan={16} className="px-2 py-2 text-xs text-accent-600 italic">
                    Analyzing…
                  </td>
                ) : a ? (
                  <>
                    {/* Strategy */}
                    <Cell><Badge value={a.business_objective} /></Cell>
                    <Cell><Badge value={a.use_case} /></Cell>
                    <Cell><Badge value={a.audience_target} /></Cell>
                    <Cell><Badge value={a.icp} /></Cell>
                    {/* Style */}
                    <Cell><Badge value={a.tone_of_voice} /></Cell>
                    <Cell><Badge value={a.content_style} /></Cell>
                    <Cell><Badge value={a.storytelling_approach} /></Cell>
                    <Cell><Badge value={a.creative_execution} /></Cell>
                    {/* Script */}
                    <TextCell value={a.script_hook} />
                    <TextCell value={a.script_outline} />
                    <TextCell value={a.script_cta} />
                    {/* Technical */}
                    <Cell><Badge value={a.voice_language} /></Cell>
                    <Cell><Badge value={a.text_language} /></Cell>
                    <Cell><Badge value={a.contains_an_interview_footage} /></Cell>
                    <Cell><Badge value={a.video_dynamism} /></Cell>
                    <Cell>
                      {a.media_analyzed ? (
                        <span className="inline-block bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium">{a.media_analyzed}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </Cell>
                  </>
                ) : (
                  <td colSpan={16} className="px-2 py-2 text-xs text-gray-300">
                    No analysis
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

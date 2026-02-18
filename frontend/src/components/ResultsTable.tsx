import { useState, useMemo } from "react";
import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";

interface Props {
  posts: Post[];
  onSelectPost?: (postId: string) => void;
}

type SortKey = "engagement_score" | "reactions" | "comments" | "shares" | "impressions" | "publication_date";

const ENGAGEMENT_TOOLTIP = "Performance based on: (reactions + comments + shares + clicks) / impressions × 100";

export default function ResultsTable({ posts, onSelectPost }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("engagement_score");
  const [sortAsc, setSortAsc] = useState(false);

  const allScores = useMemo(
    () => posts.map((p) => p.engagement_score),
    [posts]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = [...posts].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortAsc
      ? Number(aVal) - Number(bVal)
      : Number(bVal) - Number(aVal);
  });

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600"
      onClick={() => handleSort(field)}
    >
      {label} {sortKey === field ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  if (posts.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
        <thead className="border-b border-gray-200">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Title
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Author
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Format
            </th>
            <th
              className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 group relative"
              onClick={() => handleSort("engagement_score")}
            >
              <span className="flex items-center gap-1">
                Engagement {sortKey === "engagement_score" ? (sortAsc ? "↑" : "↓") : ""}
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold cursor-help shrink-0">?</span>
              </span>
              <div className="invisible group-hover:visible absolute z-20 top-full left-0 mt-1 w-72 p-2 bg-gray-900 text-white text-xs rounded shadow-lg font-normal normal-case tracking-normal">
                {ENGAGEMENT_TOOLTIP}
              </div>
            </th>
            <SortHeader label="Reactions" field="reactions" />
            <SortHeader label="Comments" field="comments" />
            <SortHeader label="Shares" field="shares" />
            <SortHeader label="Impressions" field="impressions" />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Link
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((post) => {
            const eng = getEngagementLabel(post.engagement_score, allScores);
            return (
              <tr
                key={post.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectPost?.(post.id)}
              >
                <td className="px-3 py-2.5 text-sm max-w-xs truncate text-gray-700">
                  {post.title?.slice(0, 80) || "—"}
                </td>
                <td className="px-3 py-2.5 text-sm">
                  <div className="text-gray-700">{post.author_name || "—"}</div>
                  <div className="text-xs text-gray-400">
                    {post.author_company || ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-sm">
                  <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                    {post.format_family || "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${eng.className}`}
                  >
                    {eng.label}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {post.engagement_score.toFixed(0)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.reactions}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.comments}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.shares}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.impressions}</td>
                <td className="px-3 py-2.5 text-sm">
                  {post.post_url && (
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-900 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

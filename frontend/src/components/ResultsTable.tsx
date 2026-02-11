import { useState, useMemo } from "react";
import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";

interface Props {
  posts: Post[];
  onSelectPost?: (postId: string) => void;
}

type SortKey = "engagement_score" | "reactions" | "comments" | "shares" | "impressions" | "publication_date";

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
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      {label} {sortKey === field ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  if (posts.length === 0) {
    return <p className="text-gray-500 text-center py-8">No posts found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white rounded-lg shadow">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Title
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Author
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Format
            </th>
            <SortHeader label="Engagement" field="engagement_score" />
            <SortHeader label="Reactions" field="reactions" />
            <SortHeader label="Comments" field="comments" />
            <SortHeader label="Shares" field="shares" />
            <SortHeader label="Impressions" field="impressions" />
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Link
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sorted.map((post) => {
            const eng = getEngagementLabel(post.engagement_score, allScores);
            return (
              <tr
                key={post.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectPost?.(post.id)}
              >
                <td className="px-3 py-2 text-sm max-w-xs truncate">
                  {post.title?.slice(0, 80) || "—"}
                </td>
                <td className="px-3 py-2 text-sm">
                  <div>{post.author_name || "—"}</div>
                  <div className="text-xs text-gray-400">
                    {post.author_company || ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                    {post.format_family || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${eng.className}`}
                  >
                    {eng.label}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    score: {post.engagement_score.toFixed(0)}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm">{post.reactions}</td>
                <td className="px-3 py-2 text-sm">{post.comments}</td>
                <td className="px-3 py-2 text-sm">{post.shares}</td>
                <td className="px-3 py-2 text-sm">{post.impressions}</td>
                <td className="px-3 py-2 text-sm">
                  {post.post_url && (
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
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

import { useState } from "react";
import type { Post } from "../types";

interface Props {
  posts: Post[];
  onSelectPost?: (postId: string) => void;
  playplaySlugs?: Set<string>;
}

type SortKey = "reactions" | "comments" | "publication_date";

export default function ResultsTable({ posts, onSelectPost, playplaySlugs }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("reactions");
  const [sortAsc, setSortAsc] = useState(false);

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
              Content
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Author
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Format
            </th>
            <SortHeader label="Reactions" field="reactions" />
            <SortHeader label="Comments" field="comments" />
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Link
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((post) => (
              <tr
                key={post.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectPost?.(post.id)}
              >
                <td className="px-3 py-2.5 text-sm max-w-xs truncate text-gray-700">
                  {post.title?.split(/[.!?\n]/)[0] || "—"}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-700">
                  <span className="flex items-center gap-1.5">
                    {post.author_name || "—"}
                    {playplaySlugs?.has(post.author_name || "") && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium shrink-0">
                        PP
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm">
                  <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                    {post.format_family || "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.reactions}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600">{post.comments}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

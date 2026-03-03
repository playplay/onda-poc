import { useState, useMemo } from "react";
import type { Post } from "../types";
import { normalizeFormat, getFormatStyle, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { mapLookup } from "../utils/maps";
import { BuildingIcon, PersonIcon } from "./icons";
import { getEngagementLabel, getEngagementPriority } from "../utils/engagement";

interface Props {
  posts: Post[];
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  companyNames?: Map<string, string>;
}

type ColumnKey = "account" | "format" | "engagement" | "sector" | "useCase";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortDir,
  onSort,
}: {
  label: string;
  sortDir: SortDir | null;
  onSort: () => void;
}) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 select-none">
      <button
        onClick={onSort}
        className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
      >
        {label}
        {sortDir === "asc" ? (
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 13l5-5 5 5H5z" /></svg>
        ) : sortDir === "desc" ? (
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 5 5-5H5z" /></svg>
        ) : (
          <svg className="w-3 h-3 text-gray-300" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 7l3-3 3 3M7 13l3 3 3-3" /></svg>
        )}
      </button>
    </th>
  );
}

export default function PostTable({ posts, accountNames, accountTypes, companyNames }: Props) {
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDir>("asc");

  const allScores = useMemo(() => posts.map((p) => p.engagement_score), [posts]);

  const displayed = useMemo(() => {
    const sorted = [...posts];
    if (sortColumn) {
      sorted.sort((a, b) => {
        let cmp = 0;
        if (sortColumn === "engagement") {
          const pa = getEngagementPriority(a, allScores);
          const pb = getEngagementPriority(b, allScores);
          cmp = pa - pb || (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0);
        } else {
          const va = getColValue(a, sortColumn, accountNames).toLowerCase();
          const vb = getColValue(b, sortColumn, accountNames).toLowerCase();
          cmp = va < vb ? -1 : va > vb ? 1 : 0;
        }
        return sortDirection === "desc" ? -cmp : cmp;
      });
    } else {
      sorted.sort((a, b) => {
        const pa = getEngagementPriority(a, allScores);
        const pb = getEngagementPriority(b, allScores);
        if (pa !== pb) return pa - pb;
        return (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0);
      });
    }
    return sorted;
  }, [posts, sortColumn, sortDirection, accountNames, allScores]);

  function handleSort(col: ColumnKey) {
    if (sortColumn === col) {
      if (sortDirection === "asc") setSortDirection("desc");
      else { setSortColumn(null); setSortDirection("asc"); }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

  const columns: { key: ColumnKey; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "format", label: "Format" },
    { key: "engagement", label: "Engagement" },
    { key: "sector", label: "Sector" },
    { key: "useCase", label: "Use Case" },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  sortDir={sortColumn === col.key ? sortDirection : null}
                  onSort={() => handleSort(col.key)}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayed.map((post) => {
              const displayName = mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown";
              const authorType = mapLookup(accountTypes, post.author_name || "");
              const company = mapLookup(companyNames, post.author_name || "");
              const fmt = normalizeFormat(post.format_family);
              const style = fmt ? getFormatStyle(post.format_family) : null;
              const eng = getEngagementLabel(post, allScores);
              const engColor = eng.label === "Viral"
                ? "text-[#b94040]"
                : eng.label === "Engaging"
                  ? "text-[#2b7cb8]"
                  : "text-gray-400";

              return (
                <tr
                  key={post.id}
                  className="h-14 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    if (post.post_url) window.open(post.post_url, "_blank");
                  }}
                >
                  {/* Account */}
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1.5">
                      <div className="mt-0.5 shrink-0">
                        {authorType === "person" ? (
                          <PersonIcon className="w-3.5 h-3.5 text-gray-400" />
                        ) : authorType === "company" ? (
                          <BuildingIcon className="w-3.5 h-3.5 text-gray-400" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <span className="text-gray-900 truncate block max-w-[240px]">{displayName}</span>
                        {authorType === "person" && company && (
                          <span className="text-[11px] text-gray-400 truncate block max-w-[240px]">{company}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Format */}
                  <td className="px-3 py-2">
                    {fmt && style ? (
                      <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {formatLabel(fmt)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">&mdash;</span>
                    )}
                  </td>
                  {/* Engagement */}
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium ${engColor}`}>{eng.label}</span>
                  </td>
                  {/* Sector */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500 truncate max-w-[140px] block">{post.sector || "\u2014"}</span>
                  </td>
                  {/* Use Case */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500 truncate max-w-[160px] block">
                      {post.claude_use_case ? shortUseCaseName(post.claude_use_case) : "\u2014"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No posts match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getColValue(post: Post, col: ColumnKey, accountNames?: Map<string, string>): string {
  switch (col) {
    case "account":
      return mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown";
    case "format":
      return normalizeFormat(post.format_family) || "text";
    case "engagement":
      return "";
    case "sector":
      return post.sector || "";
    case "useCase":
      return post.claude_use_case ? shortUseCaseName(post.claude_use_case) : "";
  }
}

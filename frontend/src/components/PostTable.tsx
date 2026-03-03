import { useState, useMemo, useRef, useEffect } from "react";
import type { Post } from "../types";
import { normalizeFormat, getFormatStyle, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { mapLookup, setHas } from "../utils/maps";
import { LinkedInIcon, InstagramIcon, TikTokIcon, BuildingIcon, PersonIcon } from "./icons";
import { getEngagementLabel, getEngagementPriority } from "../utils/engagement";

interface Props {
  posts: Post[];
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  playplaySlugs?: Set<string>;
  filterPlatform?: string | null;
}

type ColumnKey = "account" | "platform" | "type" | "format" | "engagement" | "sector" | "useCase";
type SortDir = "asc" | "desc";

function getColumnValue(post: Post, col: ColumnKey, accountNames?: Map<string, string>, accountTypes?: Map<string, "company" | "person">, playplaySlugs?: Set<string>): string {
  switch (col) {
    case "account":
      return mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown";
    case "platform":
      return post.platform || "linkedin";
    case "type": {
      const t = mapLookup(accountTypes, post.author_name || "");
      return t || "unknown";
    }
    case "format":
      return normalizeFormat(post.format_family) || "text";
    case "engagement":
      return ""; // sorted numerically, not by string
    case "sector":
      return post.sector || "";
    case "useCase":
      return post.claude_use_case ? shortUseCaseName(post.claude_use_case) : "";
  }
}

function FilterableHeader({
  label,
  columnKey,
  options,
  activeFilters,
  onToggleFilter,
  sortDir,
  onSort,
  isOpen,
  onToggleOpen,
  searchable,
}: {
  label: string;
  columnKey: ColumnKey;
  options: string[];
  activeFilters: Set<string>;
  onToggleFilter: (col: ColumnKey, val: string) => void;
  sortDir: SortDir | null;
  onSort: (col: ColumnKey) => void;
  isOpen: boolean;
  onToggleOpen: (col: ColumnKey | null) => void;
  searchable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggleOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onToggleOpen]);

  const filtered = searchable && search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 relative select-none">
      <div ref={ref} className="inline-flex items-center gap-1">
        <button
          onClick={() => onToggleOpen(isOpen ? null : columnKey)}
          className={`hover:text-gray-700 transition-colors ${activeFilters.size > 0 ? "text-violet-600 font-semibold" : ""}`}
        >
          {label}
          {activeFilters.size > 0 && (
            <span className="ml-0.5 text-[10px] text-violet-500">({activeFilters.size})</span>
          )}
        </button>
        <button
          onClick={() => onSort(columnKey)}
          className="text-gray-300 hover:text-gray-500 transition-colors"
        >
          {sortDir === "asc" ? (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 13l5-5 5 5H5z" /></svg>
          ) : sortDir === "desc" ? (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 5 5-5H5z" /></svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7 7l3-3 3 3M7 13l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
          )}
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-[280px] overflow-auto">
            {searchable && (
              <div className="px-2 py-1.5 border-b border-gray-100">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-violet-300"
                  autoFocus
                />
              </div>
            )}
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.has(opt)}
                  onChange={() => onToggleFilter(columnKey, opt)}
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="truncate">{opt || "(empty)"}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        )}
      </div>
    </th>
  );
}

export default function PostTable({ posts, accountNames, accountTypes, playplaySlugs, filterPlatform }: Props) {
  const [filters, setFilters] = useState<Record<ColumnKey, Set<string>>>({
    account: new Set(),
    platform: new Set(),
    type: new Set(),
    format: new Set(),
    engagement: new Set(),
    sector: new Set(),
    useCase: new Set(),
  });
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDir>("asc");
  const [openFilter, setOpenFilter] = useState<ColumnKey | null>(null);

  const allScores = useMemo(() => posts.map((p) => p.engagement_score), [posts]);

  // Compute column options from all posts (before column filters, after platform filter)
  const platformFiltered = useMemo(() => {
    if (!filterPlatform) return posts;
    return posts.filter((p) => (p.platform || "linkedin") === filterPlatform);
  }, [posts, filterPlatform]);

  const columnOptions = useMemo(() => {
    const opts: Record<ColumnKey, Set<string>> = {
      account: new Set(),
      platform: new Set(),
      type: new Set(),
      format: new Set(),
      engagement: new Set(),
      sector: new Set(),
      useCase: new Set(),
    };
    for (const p of platformFiltered) {
      opts.account.add(getColumnValue(p, "account", accountNames, accountTypes, playplaySlugs));
      opts.platform.add(getColumnValue(p, "platform", accountNames, accountTypes, playplaySlugs));
      opts.type.add(getColumnValue(p, "type", accountNames, accountTypes, playplaySlugs));
      opts.format.add(getColumnValue(p, "format", accountNames, accountTypes, playplaySlugs));
      const eng = getEngagementLabel(p, allScores);
      opts.engagement.add(eng.label);
      const sector = p.sector || "(empty)";
      opts.sector.add(sector);
      const uc = p.claude_use_case ? shortUseCaseName(p.claude_use_case) : "(empty)";
      opts.useCase.add(uc);
    }
    return Object.fromEntries(
      Object.entries(opts).map(([k, s]) => [k, [...s].sort()])
    ) as Record<ColumnKey, string[]>;
  }, [platformFiltered, accountNames, accountTypes, playplaySlugs, allScores]);

  // Apply column filters + sort
  const displayed = useMemo(() => {
    let result = platformFiltered;

    // Apply column filters
    for (const col of Object.keys(filters) as ColumnKey[]) {
      const f = filters[col];
      if (f.size === 0) continue;
      result = result.filter((p) => {
        if (col === "engagement") {
          const eng = getEngagementLabel(p, allScores);
          return f.has(eng.label);
        }
        if (col === "sector") {
          const val = p.sector || "(empty)";
          return f.has(val);
        }
        if (col === "useCase") {
          const val = p.claude_use_case ? shortUseCaseName(p.claude_use_case) : "(empty)";
          return f.has(val);
        }
        const val = getColumnValue(p, col, accountNames, accountTypes, playplaySlugs);
        return f.has(val);
      });
    }

    // Sort
    const sorted = [...result];
    if (sortColumn) {
      sorted.sort((a, b) => {
        let cmp = 0;
        if (sortColumn === "engagement") {
          const pa = getEngagementPriority(a, allScores);
          const pb = getEngagementPriority(b, allScores);
          cmp = pa - pb || (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0);
        } else {
          const va = getColumnValue(a, sortColumn, accountNames, accountTypes, playplaySlugs).toLowerCase();
          const vb = getColumnValue(b, sortColumn, accountNames, accountTypes, playplaySlugs).toLowerCase();
          cmp = va < vb ? -1 : va > vb ? 1 : 0;
        }
        return sortDirection === "desc" ? -cmp : cmp;
      });
    } else {
      // Default: engagement priority then rate desc
      sorted.sort((a, b) => {
        const pa = getEngagementPriority(a, allScores);
        const pb = getEngagementPriority(b, allScores);
        if (pa !== pb) return pa - pb;
        return (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0);
      });
    }
    return sorted;
  }, [platformFiltered, filters, sortColumn, sortDirection, accountNames, accountTypes, playplaySlugs, allScores]);

  function handleToggleFilter(col: ColumnKey, val: string) {
    setFilters((prev) => {
      const next = { ...prev, [col]: new Set(prev[col]) };
      if (next[col].has(val)) next[col].delete(val);
      else next[col].add(val);
      return next;
    });
  }

  function handleSort(col: ColumnKey) {
    if (sortColumn === col) {
      if (sortDirection === "asc") setSortDirection("desc");
      else if (sortDirection === "desc") { setSortColumn(null); setSortDirection("asc"); }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

  const columns: { key: ColumnKey; label: string; searchable?: boolean }[] = [
    { key: "account", label: "Account", searchable: true },
    { key: "platform", label: "Platform" },
    { key: "type", label: "Type" },
    { key: "format", label: "Format" },
    { key: "engagement", label: "Engagement" },
    { key: "sector", label: "Sector", searchable: true },
    { key: "useCase", label: "Use Case", searchable: true },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <FilterableHeader
                  key={col.key}
                  label={col.label}
                  columnKey={col.key}
                  options={columnOptions[col.key]}
                  activeFilters={filters[col.key]}
                  onToggleFilter={handleToggleFilter}
                  sortDir={sortColumn === col.key ? sortDirection : null}
                  onSort={handleSort}
                  isOpen={openFilter === col.key}
                  onToggleOpen={setOpenFilter}
                  searchable={col.searchable}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayed.map((post) => {
              const displayName = mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown";
              const authorType = mapLookup(accountTypes, post.author_name || "");
              const fmt = normalizeFormat(post.format_family);
              const style = fmt ? getFormatStyle(post.format_family) : null;
              const eng = getEngagementLabel(post, allScores);
              const engColor = eng.label === "Viral"
                ? "text-[#b94040]"
                : eng.label === "Engaging"
                  ? "text-[#2b7cb8]"
                  : "text-gray-400";
              const platform = post.platform || "linkedin";

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
                    <div className="flex items-center gap-1.5">
                      {authorType === "person" ? (
                        <PersonIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      ) : authorType === "company" ? (
                        <BuildingIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      ) : null}
                      <span className="text-gray-900 truncate max-w-[180px]">{displayName}</span>
                    </div>
                  </td>
                  {/* Platform */}
                  <td className="px-3 py-2">
                    {platform === "tiktok" ? (
                      <TikTokIcon className="w-4 h-4 text-black" />
                    ) : platform === "instagram" ? (
                      <InstagramIcon className="w-4 h-4 text-[#E4405F]" />
                    ) : (
                      <LinkedInIcon className="w-4 h-4 text-[#0A66C2]" />
                    )}
                  </td>
                  {/* Type */}
                  <td className="px-3 py-2">
                    {authorType === "company" ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">Company</span>
                    ) : authorType === "person" ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">Person</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  {/* Format */}
                  <td className="px-3 py-2">
                    {fmt && style ? (
                      <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {formatLabel(fmt)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  {/* Engagement */}
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium ${engColor}`}>{eng.label}</span>
                  </td>
                  {/* Sector */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500 truncate max-w-[120px] block">{post.sector || "—"}</span>
                  </td>
                  {/* Use Case */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500 truncate max-w-[140px] block">
                      {post.claude_use_case ? shortUseCaseName(post.claude_use_case) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">
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

import { useState, useMemo, useRef, useEffect } from "react";
import type { Post } from "../types";
import PostCard, {
  normalizeFormat,
  getFormatStyle,
  formatLabel,
  BuildingIcon,
  PersonIcon,
  mapLookup,
  setHas,
} from "./PostCard";

interface Props {
  posts: Post[];
  playplaySlugs?: Set<string>;
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  externalFilterFormat?: string | null;
  externalFilterUseCases?: Set<string>;
  onFiltersApplied?: () => void;
}

export default function PostGallery({ posts, playplaySlugs, accountNames, accountTypes, externalFilterFormat, externalFilterUseCases, onFiltersApplied }: Props) {
  const [filterFormat, setFilterFormat] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterPlayPlay, setFilterPlayPlay] = useState(false);
  const [filterAccountType, setFilterAccountType] = useState<"company" | "person" | null>(null);
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());
  const [useCaseDropdownOpen, setUseCaseDropdownOpen] = useState(false);
  const useCaseDropdownRef = useRef<HTMLDivElement>(null);

  // Apply external filters from UseCaseTable navigation
  useEffect(() => {
    if (externalFilterFormat !== undefined && externalFilterFormat !== null) {
      setFilterFormat(externalFilterFormat);
    }
    if (externalFilterUseCases && externalFilterUseCases.size > 0) {
      setFilterUseCases(externalFilterUseCases);
    }
    if (
      (externalFilterFormat !== undefined && externalFilterFormat !== null) ||
      (externalFilterUseCases && externalFilterUseCases.size > 0)
    ) {
      onFiltersApplied?.();
    }
  }, [externalFilterFormat, externalFilterUseCases, onFiltersApplied]);

  const formatCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const fmt = normalizeFormat(p.format_family);
      if (fmt) map.set(fmt, (map.get(fmt) || 0) + 1);
    }
    return map;
  }, [posts]);

  const formats = useMemo(
    () => Array.from(formatCounts.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k),
    [formatCounts]
  );

  const platformCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      const plat = p.platform || "linkedin";
      map.set(plat, (map.get(plat) || 0) + 1);
    }
    return map;
  }, [posts]);

  const hasBothPlatforms = platformCounts.size > 1;

  const playplayCount = useMemo(
    () => playplaySlugs ? posts.filter((p) => setHas(playplaySlugs, p.author_name || "")).length : 0,
    [posts, playplaySlugs]
  );

  const accountTypeCounts = useMemo(() => {
    if (!accountTypes || accountTypes.size === 0) return { company: 0, person: 0 };
    let company = 0;
    let person = 0;
    for (const p of posts) {
      const t = mapLookup(accountTypes, p.author_name || "");
      if (t === "company") company++;
      else if (t === "person") person++;
    }
    return { company, person };
  }, [posts, accountTypes]);

  const hasAccountTypes = accountTypeCounts.company > 0 || accountTypeCounts.person > 0;

  const useCaseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      if (p.claude_use_case) {
        map.set(p.claude_use_case, (map.get(p.claude_use_case) || 0) + 1);
      }
    }
    return map;
  }, [posts]);

  const hasUseCases = useCaseCounts.size > 0;

  // Close dropdown on click outside
  useEffect(() => {
    if (!useCaseDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (useCaseDropdownRef.current && !useCaseDropdownRef.current.contains(e.target as Node)) {
        setUseCaseDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [useCaseDropdownOpen]);

  const allScores = useMemo(
    () => posts.map((p) => p.engagement_score),
    [posts]
  );

  const filtered = useMemo(() => {
    let result = [...posts].sort((a, b) => (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1));
    if (filterFormat) {
      result = result.filter((p) => normalizeFormat(p.format_family) === filterFormat);
    }
    if (filterPlatform) {
      result = result.filter((p) => (p.platform || "linkedin") === filterPlatform);
    }
    if (filterPlayPlay && playplaySlugs) {
      result = result.filter((p) => setHas(playplaySlugs, p.author_name || ""));
    }
    if (filterAccountType && accountTypes) {
      result = result.filter((p) => mapLookup(accountTypes, p.author_name || "") === filterAccountType);
    }
    if (filterUseCases.size > 0) {
      result = result.filter((p) => p.claude_use_case && filterUseCases.has(p.claude_use_case));
    }
    return result;
  }, [posts, filterFormat, filterPlatform, filterPlayPlay, filterAccountType, filterUseCases, playplaySlugs, accountTypes]);

  if (posts.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts found.</p>;
  }

  const hasActiveFilters = filterFormat !== null || filterPlatform !== null || filterAccountType !== null || filterPlayPlay || filterUseCases.size > 0;

  const resetAllFilters = () => {
    setFilterFormat(null);
    setFilterPlatform(null);
    setFilterAccountType(null);
    setFilterPlayPlay(false);
    setFilterUseCases(new Set());
  };

  return (
    <div className="space-y-4">
      {/* Filter container — matches Library style */}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white px-2.5 py-0.5">
        {/* Row 1: Platform */}
        <div className="py-1.5 flex items-center gap-2 min-h-[28px]">
          <span className="w-[120px] shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-600 inline-flex items-center">
            Platform
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {([
              { key: "linkedin", label: "LinkedIn", count: platformCounts.get("linkedin") || 0, active: "bg-blue-50 text-blue-700 border-blue-200" },
              { key: "instagram", label: "Instagram", count: platformCounts.get("instagram") || 0, active: "bg-pink-50 text-pink-600 border-pink-200" },
            ]).filter(({ count }) => count > 0).map(({ key, label, count, active }) => (
              <button
                key={key}
                onClick={() => setFilterPlatform(filterPlatform === key ? null : key)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                  filterPlatform === key
                    ? active
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {label} ({count})
              </button>
            ))}
            <button
              onClick={hasActiveFilters ? resetAllFilters : undefined}
              className={`ml-auto text-[11px] transition-colors inline-flex items-center gap-0.5 ${
                hasActiveFilters
                  ? "text-gray-500 hover:text-gray-700 cursor-pointer"
                  : "text-gray-300 cursor-default"
              }`}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset filters
            </button>
          </div>
        </div>

        {/* Row 2: Use Cases */}
        <div className="py-1.5 flex items-center gap-2 min-h-[28px]">
          <div className="relative w-[120px] shrink-0" ref={useCaseDropdownRef}>
            <button
              onClick={() => hasUseCases && setUseCaseDropdownOpen(!useCaseDropdownOpen)}
              className={`w-full px-2.5 py-1 text-xs rounded-md border transition-colors inline-flex items-center justify-between gap-1 ${
                !hasUseCases
                  ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                  : filterUseCases.size > 0
                    ? "bg-gray-50 text-gray-900 border-gray-300 font-medium"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="truncate">Use Cases{filterUseCases.size > 0 ? ` (${filterUseCases.size})` : ""}</span>
              <svg className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${useCaseDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {useCaseDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-80 max-h-72 overflow-y-auto">
                {Array.from(useCaseCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([uc, count]) => (
                    <label
                      key={uc}
                      className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={filterUseCases.has(uc)}
                        onChange={() => {
                          setFilterUseCases((prev) => {
                            const next = new Set(prev);
                            if (next.has(uc)) next.delete(uc);
                            else next.add(uc);
                            return next;
                          });
                        }}
                        className="rounded border-gray-300 text-gray-700 focus:ring-gray-400 w-3 h-3"
                      />
                      <span className="truncate flex-1 capitalize">{uc}</span>
                      <span className="text-gray-400 shrink-0 text-[10px]">{count}</span>
                    </label>
                  ))}
                {filterUseCases.size > 0 && (
                  <button
                    onClick={() => setFilterUseCases(new Set())}
                    className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                  >
                    Clear use cases
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
            {Array.from(filterUseCases).map((uc) => (
              <span
                key={uc}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full bg-gray-50 text-gray-700 border border-gray-200"
              >
                <span className="capitalize truncate max-w-[180px]">{uc}</span>
                <button
                  onClick={() => {
                    setFilterUseCases((prev) => {
                      const next = new Set(prev);
                      next.delete(uc);
                      return next;
                    });
                  }}
                  className="text-gray-400 hover:text-gray-700 ml-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Row 3: Account type — always visible */}
        <div className="py-1.5 flex items-center gap-2 min-h-[28px]">
          <span className={`w-[120px] shrink-0 px-2.5 py-1 text-xs rounded-md border inline-flex items-center ${
            hasAccountTypes ? "border-gray-200 bg-white text-gray-600" : "border-gray-100 bg-gray-50 text-gray-300"
          }`}>
            Account type
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {([
              { type: "company" as const, label: "Companies", count: accountTypeCounts.company, Icon: BuildingIcon, active: "bg-gray-100 text-gray-700 border-gray-300" },
              { type: "person" as const, label: "Persons", count: accountTypeCounts.person, Icon: PersonIcon, active: "bg-blue-50 text-blue-700 border-blue-200" },
            ])
              .sort((a, b) => b.count - a.count)
              .map(({ type, label, count, Icon, active }) => (
                <button
                  key={type}
                  onClick={() => hasAccountTypes && setFilterAccountType(filterAccountType === type ? null : type)}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                    !hasAccountTypes
                      ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                      : filterAccountType === type
                        ? active
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <Icon className="w-2.5 h-2.5" />
                    {label}{hasAccountTypes ? ` (${count})` : ""}
                  </span>
                </button>
              ))}
            {playplaySlugs && playplaySlugs.size > 0 && (
              <button
                onClick={() => setFilterPlayPlay(!filterPlayPlay)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                  filterPlayPlay
                    ? "bg-violet-50 text-violet-700 border-violet-200"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                PlayPlay Client ({playplayCount})
              </button>
            )}
          </div>
        </div>

        {/* Row 4: Format */}
        <div className="py-1.5 flex items-center gap-2 min-h-[28px]">
          <span className="w-[120px] shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-600 inline-flex items-center">
            Format
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {formats.map((fmt) => {
              const style = getFormatStyle(fmt);
              const active = filterFormat === fmt;
              return (
                <button
                  key={fmt}
                  onClick={() => setFilterFormat(active ? null : fmt)}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                    active
                      ? `${style.bg} ${style.text} ${style.border}`
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {formatLabel(fmt)} ({formatCounts.get(fmt) || 0})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            allScores={allScores}
            accountTypes={accountTypes}
            accountNames={accountNames}
            playplaySlugs={playplaySlugs}
          />
        ))}
      </div>
    </div>
  );
}

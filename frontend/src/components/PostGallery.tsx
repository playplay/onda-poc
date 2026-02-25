import { useState, useMemo, useRef, useEffect } from "react";
import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";

interface Props {
  posts: Post[];
  playplaySlugs?: Set<string>;
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  externalFilterFormat?: string | null;
  externalFilterUseCases?: Set<string>;
  onFiltersApplied?: () => void;
}

const FORMAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  video:     { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  carousel:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  image:     { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  images:    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  gif:       { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  text:      { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200" },
};

function normalizeFormat(format: string | null): string | null {
  if (!format) return null;
  const key = format.toLowerCase();
  if (key === "short_video" || key === "long_video") return "video";
  return key;
}

function getFormatStyle(format: string | null) {
  const key = normalizeFormat(format);
  if (!key) return FORMAT_COLORS.text;
  return FORMAT_COLORS[key] || FORMAT_COLORS.text;
}

function isVideoPost(post: Post) {
  if (post.video_url) return true;
  return normalizeFormat(post.format_family) === "video";
}

function computeEngagement(post: Post) {
  return post.reactions + post.comments * 3;
}

const FORMAT_LABELS: Record<string, string> = {
  image: "Image",
  images: "Images",
  gif: "GIF",
  video: "Video",
  carousel: "Carousel",
  text: "Text",
};

function formatLabel(fmt: string) {
  return FORMAT_LABELS[fmt] || fmt.charAt(0).toUpperCase() + fmt.slice(1);
}

function PersonIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
    </svg>
  );
}

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
    </svg>
  );
}

function mapLookup<T>(map: Map<string, T> | undefined, key: string): T | undefined {
  if (!map) return undefined;
  return map.get(key) ?? map.get(key.toLowerCase());
}

function setHas(set: Set<string> | undefined, key: string): boolean {
  if (!set) return false;
  return set.has(key) || set.has(key.toLowerCase());
}

export default function PostGallery({ posts, playplaySlugs, accountNames, accountTypes, externalFilterFormat, externalFilterUseCases, onFiltersApplied }: Props) {
  const [filterFormat, setFilterFormat] = useState<string | null>(null);
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
    () => Array.from(formatCounts.keys()).sort(),
    [formatCounts]
  );

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
    let result = [...posts].sort((a, b) => computeEngagement(b) - computeEngagement(a));
    if (filterFormat) {
      result = result.filter((p) => normalizeFormat(p.format_family) === filterFormat);
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
  }, [posts, filterFormat, filterPlayPlay, filterAccountType, filterUseCases, playplaySlugs, accountTypes]);

  if (posts.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts found.</p>;
  }

  const hasActiveFilters = filterFormat !== null || filterAccountType !== null || filterPlayPlay || filterUseCases.size > 0;

  const resetAllFilters = () => {
    setFilterFormat(null);
    setFilterAccountType(null);
    setFilterPlayPlay(false);
    setFilterUseCases(new Set());
  };

  return (
    <div className="space-y-4">
      {/* Top row: Use Cases dropdown + Reset filters */}
      <div className="flex items-center gap-3">
        <div className="relative inline-block" ref={useCaseDropdownRef}>
          <button
            onClick={() => hasUseCases && setUseCaseDropdownOpen(!useCaseDropdownOpen)}
            className={`px-4 py-2 text-sm rounded-lg border shadow-sm transition-colors inline-flex items-center gap-2 ${
              !hasUseCases
                ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                : filterUseCases.size > 0
                  ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-indigo-100"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:shadow-md"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            Use Cases{filterUseCases.size > 0 ? ` (${filterUseCases.size})` : ""}
            <svg className={`w-4 h-4 transition-transform ${useCaseDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
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
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
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
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="truncate flex-1 capitalize">{uc}</span>
                    <span className="text-gray-400 shrink-0 text-xs">{count}</span>
                  </label>
                ))}
              {filterUseCases.size > 0 && (
                <button
                  onClick={() => setFilterUseCases(new Set())}
                  className="w-full text-left px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 border-t border-gray-100"
                >
                  Clear use cases
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reset filters — always visible, right-aligned */}
        <button
          onClick={hasActiveFilters ? resetAllFilters : undefined}
          className={`ml-auto text-xs transition-colors inline-flex items-center gap-1 ${
            hasActiveFilters
              ? "text-gray-500 hover:text-gray-700 cursor-pointer"
              : "text-gray-300 cursor-default"
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reset filters
        </button>
      </div>

      {/* Category / format filters */}
      <div className="flex flex-wrap items-center gap-2">
        {hasAccountTypes && (
          <>
            <button
              onClick={() => setFilterAccountType(filterAccountType === "company" ? null : "company")}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filterAccountType === "company"
                  ? "bg-gray-100 text-gray-700 border-gray-300"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <BuildingIcon className="w-3 h-3" />
                Companies ({accountTypeCounts.company})
              </span>
            </button>
            <button
              onClick={() => setFilterAccountType(filterAccountType === "person" ? null : "person")}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filterAccountType === "person"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <PersonIcon className="w-3 h-3" />
                Persons ({accountTypeCounts.person})
              </span>
            </button>
          </>
        )}
        {playplaySlugs && playplaySlugs.size > 0 && (
          <button
            onClick={() => setFilterPlayPlay(!filterPlayPlay)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filterPlayPlay
                ? "bg-violet-50 text-violet-700 border-violet-200"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            PlayPlay Client ({playplayCount})
          </button>
        )}
        {formats.map((fmt) => {
          const style = getFormatStyle(fmt);
          const active = filterFormat === fmt;
          return (
            <button
              key={fmt}
              onClick={() => setFilterFormat(active ? null : fmt)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
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

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((post) => {
          const fmt = normalizeFormat(post.format_family);
          const style = getFormatStyle(post.format_family);
          const authorType = mapLookup(accountTypes, post.author_name || "");
          return (
            <a
              key={post.id}
              href={post.post_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`block bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden ${style.border}`}
            >
              {/* Preview */}
              <div className="aspect-[4/3] overflow-hidden relative bg-gray-50">
                {setHas(playplaySlugs, post.author_name || "") && (
                  <div className="absolute top-0 right-0 z-10 overflow-hidden w-24 h-24 pointer-events-none">
                    <div className="absolute top-[11px] right-[-26px] w-[120px] bg-violet-600 text-white text-[11px] font-semibold py-[1px] rotate-45 shadow-sm text-center pl-[20px]">
                      PlayPlay
                    </div>
                  </div>
                )}
                {post.image_url ? (
                  <>
                    <img
                      src={post.image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {isVideoPost(post) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                          <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </>
                ) : isVideoPost(post) ? (
                  <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                      <svg className="w-6 h-6 text-white/80 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-start p-5">
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-6">
                      {post.title || "No content"}
                    </p>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-gray-900 truncate flex items-center gap-1.5">
                    {authorType === "person" ? (
                      <PersonIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    ) : authorType === "company" ? (
                      <BuildingIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    ) : null}
                    <span className="truncate">
                      {mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown"}
                    </span>
                  </p>
                  {fmt && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                      {formatLabel(fmt)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                    </svg>
                    {post.reactions}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                    {post.comments}
                  </span>
                  {(() => {
                    const eng = getEngagementLabel(post, allScores);
                    const dotColor = eng.label === "Viral"
                      ? "bg-rose-800"
                      : eng.label === "Engaging"
                        ? "bg-blue-400"
                        : "bg-gray-300";
                    const textColor = eng.label === "Viral"
                      ? "text-rose-800"
                      : eng.label === "Engaging"
                        ? "text-blue-400"
                        : "text-gray-400";
                    return (
                      <span className={`flex items-center gap-1 ml-auto ${textColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        {eng.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

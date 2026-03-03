import { useState, useMemo, useEffect } from "react";
import type { Post } from "../types";
import PostCard, {
  normalizeFormat,
  getFormatStyle,
  formatLabel,
  shortUseCaseName,
  BuildingIcon,
  PersonIcon,
  mapLookup,
  setHas,
} from "./PostCard";
import FilterDropdown from "./FilterDropdown";
import { getEngagementPriority } from "../utils/engagement";

interface Props {
  posts: Post[];
  playplaySlugs?: Set<string>;
  accountNames?: Map<string, string>;
  accountTypes?: Map<string, "company" | "person">;
  externalFilterFormat?: string | null;
  externalFilterUseCases?: Set<string>;
  onFiltersApplied?: () => void;
  showSector?: boolean;
  showUseCase?: boolean;
  filterPlatform?: string | null;
}

export default function PostGallery({ posts, playplaySlugs, accountNames, accountTypes, externalFilterFormat, externalFilterUseCases, onFiltersApplied, showSector, showUseCase, filterPlatform }: Props) {
  const [filterFormat, setFilterFormat] = useState<string | null>(null);
  const [filterPlayPlay, setFilterPlayPlay] = useState(false);
  const [filterAccountType, setFilterAccountType] = useState<"company" | "person" | null>(null);
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());

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

  const useCaseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      if (p.claude_use_case) {
        map.set(p.claude_use_case, (map.get(p.claude_use_case) || 0) + 1);
      }
    }
    return map;
  }, [posts]);

  const useCaseOptions = useMemo(
    () => Array.from(useCaseCounts.keys()),
    [useCaseCounts]
  );

  const allScores = useMemo(
    () => posts.map((p) => p.engagement_score),
    [posts]
  );

  // Build account dropdown options and state
  const accountOptions = useMemo(() => {
    const opts: string[] = [];
    if (accountTypeCounts.company > 0) opts.push("company");
    if (accountTypeCounts.person > 0) opts.push("person");
    if (playplaySlugs && playplaySlugs.size > 0) opts.push("playplay");
    return opts;
  }, [accountTypeCounts, playplaySlugs]);

  const accountSelected = useMemo(() => {
    const s = new Set<string>();
    if (filterAccountType) s.add(filterAccountType);
    if (filterPlayPlay) s.add("playplay");
    return s;
  }, [filterAccountType, filterPlayPlay]);

  const accountCountMap = useMemo(() => {
    const map = new Map<string, number>();
    map.set("company", accountTypeCounts.company);
    map.set("person", accountTypeCounts.person);
    map.set("playplay", playplayCount);
    return map;
  }, [accountTypeCounts, playplayCount]);

  // Format filter as single-select via Set
  const formatSelected = useMemo(() => filterFormat ? new Set([filterFormat]) : new Set<string>(), [filterFormat]);

  const filtered = useMemo(() => {
    let result = [...posts].sort((a, b) => {
      const pa = getEngagementPriority(a, allScores);
      const pb = getEngagementPriority(b, allScores);
      if (pa !== pb) return pa - pb;
      return (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1);
    });
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
  }, [posts, allScores, filterFormat, filterPlatform, filterPlayPlay, filterAccountType, filterUseCases, playplaySlugs, accountTypes]);

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

  const handleAccountToggle = (val: string) => {
    if (val === "playplay") {
      setFilterPlayPlay(!filterPlayPlay);
    } else {
      const t = val as "company" | "person";
      setFilterAccountType(filterAccountType === t ? null : t);
    }
  };

  const handleAccountClear = () => {
    setFilterAccountType(null);
    setFilterPlayPlay(false);
  };

  const accountDisplayFn = (val: string) => {
    if (val === "company") return "Companies";
    if (val === "person") return "Persons";
    if (val === "playplay") return "PlayPlay Client";
    return val;
  };
  const handleFormatToggle = (val: string) => setFilterFormat(filterFormat === val ? null : val);
  const handleFormatClear = () => setFilterFormat(null);

  // Collect active chips
  const activeChips: { key: string; label: string; color: string; onRemove: () => void }[] = [];
  for (const uc of filterUseCases) {
    activeChips.push({
      key: `uc-${uc}`,
      label: shortUseCaseName(uc),
      color: "bg-gray-50 text-gray-700 border-gray-200",
      onRemove: () => setFilterUseCases((prev) => { const n = new Set(prev); n.delete(uc); return n; }),
    });
  }
  if (filterAccountType) {
    activeChips.push({
      key: `acct-${filterAccountType}`,
      label: filterAccountType === "company" ? "Companies" : "Persons",
      color: filterAccountType === "company" ? "bg-gray-50 text-gray-700 border-gray-200" : "bg-blue-50 text-blue-700 border-blue-200",
      onRemove: () => setFilterAccountType(null),
    });
  }
  if (filterPlayPlay) {
    activeChips.push({
      key: "playplay",
      label: "PlayPlay Client",
      color: "bg-violet-50 text-violet-700 border-violet-200",
      onRemove: () => setFilterPlayPlay(false),
    });
  }
  if (filterFormat) {
    const style = getFormatStyle(filterFormat);
    activeChips.push({
      key: `fmt-${filterFormat}`,
      label: formatLabel(filterFormat),
      color: `${style.bg} ${style.text} ${style.border}`,
      onRemove: () => setFilterFormat(null),
    });
  }

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Use Cases"
          options={useCaseOptions}
          selected={filterUseCases}
          onToggle={(val) => {
            setFilterUseCases((prev) => {
              const next = new Set(prev);
              if (next.has(val)) next.delete(val);
              else next.add(val);
              return next;
            });
          }}
          onClear={() => setFilterUseCases(new Set())}
          displayFn={shortUseCaseName}
          countMap={useCaseCounts}
        />
        <FilterDropdown
          label="Account"
          options={accountOptions}
          selected={accountSelected}
          onToggle={handleAccountToggle}
          onClear={handleAccountClear}
          displayFn={accountDisplayFn}
          countMap={accountCountMap}
        />
        <FilterDropdown
          label="Format"
          options={formats}
          selected={formatSelected}
          onToggle={handleFormatToggle}
          onClear={handleFormatClear}
          displayFn={formatLabel}
          countMap={formatCounts}
        />
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

      {/* Chips area — always reserved so the page doesn't jump */}
      <div className="min-h-[28px] flex flex-wrap items-center gap-1 mt-1.5 mb-4">
        {activeChips.length > 0 ? (
          activeChips.map((chip) => (
            <span
              key={chip.key}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border ${chip.color}`}
            >
              <span className="truncate max-w-[180px]">{chip.label}</span>
              <button
                onClick={chip.onRemove}
                className="opacity-50 hover:opacity-100 ml-0.5"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-400">{filtered.length} posts</span>
        )}
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
            showSector={showSector}
            showUseCase={showUseCase}
          />
        ))}
      </div>
    </div>
  );
}

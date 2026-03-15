import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScrapeJob, Post } from "../types";
import { getScrapeStatus, getPosts, getAccounts, getFavoriteIds, addFavorite, removeFavorite, setPlayPlayFlag } from "../api/client";
import PostCard from "../components/PostCard";
import PostDetailModal from "../components/PostDetailModal";
import PostTable from "../components/PostTable";
import FilterDropdown from "../components/FilterDropdown";
import ViewSwitch from "../components/ViewSwitch";
import { normalizeFormat, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { buildAccountMaps } from "../utils/accounts";
import { getEngagementPriority } from "../utils/engagement";

const IN_PROGRESS_STATUSES = ["pending", "running", "downloading_videos"];

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function durationMinutes(job: ScrapeJob): string | null {
  if (!job.completed_at || !job.created_at) return null;
  const ms = new Date(job.completed_at).getTime() - new Date(job.created_at).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "< 1 min";
  return `${mins} min`;
}

function jobTitle(job: ScrapeJob): string {
  if (!job.is_custom_search) {
    return `Weekly Scrape — ${formatDateShort(job.created_at)}`;
  }
  if (job.custom_account_name === "Imported post") {
    const url = job.custom_account_url ?? "";
    const short = url.length > 50 ? url.slice(0, 50) + "…" : url;
    return `Imported post${short ? " — " + short : ""}`;
  }
  return job.custom_account_name || job.custom_account_url || "Custom Search";
}

function jobSubtitle(job: ScrapeJob): string {
  const parts: string[] = [];
  if (job.total_posts != null) parts.push(`${job.total_posts} posts`);
  if (job.scraper_backend) parts.push(job.scraper_backend);
  const status = job.status === "completed" ? "Completed" : job.status === "failed" ? "Failed" : "Running";
  const dur = durationMinutes(job);
  if (dur && job.status === "completed") {
    parts.push(`${status} in ${dur}`);
  } else {
    parts.push(status);
  }
  return parts.join(" · ");
}

export default function ScrapeHistoryDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormats, setFilterFormats] = useState<Set<string>>(new Set());
  const [filterUseCases, setFilterUseCases] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");
  const [modalPost, setModalPost] = useState<Post | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [accountTypes, setAccountTypes] = useState<Map<string, "company" | "person">>(new Map());
  const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());
  const [playplaySlugs, setPlayplaySlugs] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    Promise.all([
      getScrapeStatus(jobId),
      getPosts(jobId, { limit: 200 }),
    ])
      .then(([j, p]) => { setJob(j); setPosts(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    getAccounts().then((accounts) => {
      const { names, types, companyNames: cn, slugs } = buildAccountMaps(accounts);
      setAccountNames(names);
      setAccountTypes(types);
      setCompanyNames(cn);
      setPlayplaySlugs(slugs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getFavoriteIds().then((ids) => setFavoriteIds(new Set(ids))).catch(() => {});
  }, []);

  // Auto-poll if running
  useEffect(() => {
    if (!jobId || !job) return;
    const isRunning = IN_PROGRESS_STATUSES.includes(job.status);
    if (isRunning) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          getScrapeStatus(jobId).then((j) => {
            setJob(j);
            if (!IN_PROGRESS_STATUSES.includes(j.status)) {
              getPosts(jobId, { limit: 200 }).then(setPosts).catch(() => {});
            }
          }).catch(() => {});
        }, 8000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [job, jobId]);

  const allScores = useMemo(() => posts.map((p) => p.engagement_score), [posts]);

  const formatFamilies = useMemo(() => {
    const fmts = new Set<string>();
    for (const p of posts) { const f = normalizeFormat(p.format_family); if (f) fmts.add(f); }
    return [...fmts].sort();
  }, [posts]);

  const useCases = useMemo(() => {
    const ucs = new Set<string>();
    for (const p of posts) if (p.claude_use_case) ucs.add(p.claude_use_case);
    return [...ucs].sort();
  }, [posts]);

  const filtered = useMemo(() => {
    let result = posts;
    if (filterFormats.size > 0) {
      result = result.filter((p) => { const f = normalizeFormat(p.format_family); return f && filterFormats.has(f); });
    }
    if (filterUseCases.size > 0) {
      result = result.filter((p) => p.claude_use_case && filterUseCases.has(p.claude_use_case));
    }
    return [...result].sort((a, b) => {
      const pa = getEngagementPriority(a, allScores);
      const pb = getEngagementPriority(b, allScores);
      if (pa !== pb) return pa - pb;
      return (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1);
    });
  }, [posts, allScores, filterFormats, filterUseCases]);

  const hasFilters = filterFormats.size > 0 || filterUseCases.size > 0;
  const resetFilters = () => { setFilterFormats(new Set()); setFilterUseCases(new Set()); };

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => {
    setter((prev) => { const n = new Set(prev); if (n.has(val)) n.delete(val); else n.add(val); return n; });
  };

  const handleToggleFavorite = useCallback(async (postId: string) => {
    if (favoriteIds.has(postId)) {
      await removeFavorite(postId).catch(() => {});
      setFavoriteIds((prev) => { const n = new Set(prev); n.delete(postId); return n; });
    } else {
      await addFavorite(postId).catch(() => {});
      setFavoriteIds((prev) => new Set([...prev, postId]));
    }
  }, [favoriteIds]);

  const handleUpdatePost = useCallback((updated: Post) => {
    setModalPost(updated);
    setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
  }, []);

  const handleSetPlayPlayFlag = useCallback(async (flagType: "playplay" | "playplay_design", value: boolean) => {
    if (!modalPost) return;
    const optimistic = { ...modalPost, ...(flagType === "playplay" ? { playplay_flag: value } : { playplay_design_flag: value }) };
    handleUpdatePost(optimistic);
    try {
      const updated = await setPlayPlayFlag(modalPost.id, flagType, value);
      handleUpdatePost(updated);
    } catch {
      handleUpdatePost(modalPost);
    }
  }, [modalPost, handleUpdatePost]);

  if (loading) {
    return (
      <div>
        <div className="-mx-6 -mt-8 px-6 pt-8 pb-6 mb-6 rounded-b-2xl" style={{ background: "linear-gradient(135deg, #faeefa 0%, #ffeef1 50%, #fff4ec 100%)" }}>
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-400">Job not found.</p>
        <button onClick={() => navigate("/scrape-history")} className="mt-2 text-xs text-violet-600 hover:text-violet-800">
          ← Back to Scrape History
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Hero header */}
      <div
        className="-mx-6 -mt-8 px-6 pt-8 pb-6 mb-6 rounded-b-2xl"
        style={{ background: "linear-gradient(135deg, #faeefa 0%, #ffeef1 50%, #fff4ec 100%)" }}
      >
        <button
          onClick={() => navigate("/scrape-history")}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{jobTitle(job)}</h1>
        <p className="text-sm text-gray-500 mt-1">{jobSubtitle(job)}</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 pt-3 mb-2">
        <FilterDropdown
          label="Format"
          options={formatFamilies}
          selected={filterFormats}
          onToggle={toggle(setFilterFormats)}
          onClear={() => setFilterFormats(new Set())}
          displayFn={formatLabel}
        />
        <FilterDropdown
          label="Use Case"
          options={useCases}
          selected={filterUseCases}
          onToggle={toggle(setFilterUseCases)}
          onClear={() => setFilterUseCases(new Set())}
          displayFn={shortUseCaseName}
        />
        <button
          onClick={hasFilters ? resetFilters : undefined}
          className={`text-[11px] transition-colors inline-flex items-center gap-0.5 ${
            hasFilters ? "text-gray-900 hover:text-black cursor-pointer" : "text-gray-400 cursor-default"
          }`}
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reset
        </button>
        <div className="ml-auto">
          <ViewSwitch value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="min-h-[28px] flex items-center mb-2">
        <span className="text-xs text-gray-500">{filtered.length} posts</span>
      </div>

      {/* Post detail modal */}
      {modalPost && (
        <PostDetailModal
          post={modalPost}
          allScores={allScores}
          accountTypes={accountTypes}
          accountNames={accountNames}
          playplaySlugs={playplaySlugs}
          isFavorite={favoriteIds.has(modalPost.id)}
          onToggleFavorite={handleToggleFavorite}
          onSetPlayPlayFlag={handleSetPlayPlayFlag}
          onClose={() => setModalPost(null)}
        />
      )}

      {/* Posts */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400">No posts found for this job.</p>
        </div>
      ) : (
        <>
          {viewMode === "gallery" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-4">
              {filtered.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  allScores={allScores}
                  accountNames={accountNames}
                  accountTypes={accountTypes}
                  showSector
                  showUseCase
                  isFavorite={favoriteIds.has(post.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenModal={setModalPost}
                />
              ))}
            </div>
          )}
          {viewMode === "table" && (
            <div className="pt-4">
              <PostTable
                posts={filtered}
                accountNames={accountNames}
                accountTypes={accountTypes}
                companyNames={companyNames}
                onOpenModal={setModalPost}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

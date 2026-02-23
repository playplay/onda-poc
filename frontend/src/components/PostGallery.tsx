import { useState, useMemo } from "react";
import type { Post } from "../types";

interface Props {
  posts: Post[];
  playplaySlugs?: Set<string>;
  accountNames?: Map<string, string>;
}

const FORMAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  video:     { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  carousel:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  image:     { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
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

export default function PostGallery({ posts, playplaySlugs, accountNames }: Props) {
  const [filterFormat, setFilterFormat] = useState<string | null>(null);
  const [filterPlayPlay, setFilterPlayPlay] = useState(false);

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
    () => playplaySlugs ? posts.filter((p) => playplaySlugs.has(p.author_name || "")).length : 0,
    [posts, playplaySlugs]
  );

  const filtered = useMemo(() => {
    let result = [...posts].sort((a, b) => computeEngagement(b) - computeEngagement(a));
    if (filterFormat) {
      result = result.filter((p) => normalizeFormat(p.format_family) === filterFormat);
    }
    if (filterPlayPlay && playplaySlugs) {
      result = result.filter((p) => playplaySlugs.has(p.author_name || ""));
    }
    return result;
  }, [posts, filterFormat, filterPlayPlay, playplaySlugs]);

  if (posts.length === 0) {
    return <p className="text-gray-400 text-center py-8 text-sm">No posts found.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterFormat(null)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            filterFormat === null
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}
        >
          All ({posts.length})
        </button>
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
              {fmt} ({formatCounts.get(fmt) || 0})
            </button>
          );
        })}

      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((post) => {
          const fmt = normalizeFormat(post.format_family);
          const style = getFormatStyle(post.format_family);
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
                {playplaySlugs?.has(post.author_name || "") && (
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
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {accountNames?.get(post.author_name || "") || post.author_name || "Unknown"}
                  </p>
                  {fmt && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                      {fmt}
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
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

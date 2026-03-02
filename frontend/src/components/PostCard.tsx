import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";

// --- Shared utilities (also used by PostGallery for filter logic) ---

export const FORMAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  video:     { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  carousel:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  image:     { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  images:    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  gif:       { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  text:      { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200" },
};

export function normalizeFormat(format: string | null): string | null {
  if (!format) return null;
  const key = format.toLowerCase();
  if (key === "short_video" || key === "long_video") return "video";
  return key;
}

export function getFormatStyle(format: string | null) {
  const key = normalizeFormat(format);
  if (!key) return FORMAT_COLORS.text;
  return FORMAT_COLORS[key] || FORMAT_COLORS.text;
}

export function isVideoPost(post: Post) {
  if (post.video_url) return true;
  return normalizeFormat(post.format_family) === "video";
}

export function computeEngagement(post: Post) {
  return post.reactions + post.comments * 3;
}

export const FORMAT_LABELS: Record<string, string> = {
  image: "Image",
  images: "Images",
  gif: "GIF",
  video: "Video",
  carousel: "Carousel",
  text: "Text",
};

export function formatLabel(fmt: string) {
  return FORMAT_LABELS[fmt] || fmt.charAt(0).toUpperCase() + fmt.slice(1);
}

export function PersonIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
    </svg>
  );
}

export function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
    </svg>
  );
}

export function mapLookup<T>(map: Map<string, T> | undefined, key: string): T | undefined {
  if (!map) return undefined;
  return map.get(key) ?? map.get(key.toLowerCase());
}

export function setHas(set: Set<string> | undefined, key: string): boolean {
  if (!set) return false;
  return set.has(key) || set.has(key.toLowerCase());
}

// --- PostCard component ---

interface PostCardProps {
  post: Post;
  allScores: number[];
  accountTypes?: Map<string, "company" | "person">;
  accountNames?: Map<string, string>;
  playplaySlugs?: Set<string>;
  showSector?: boolean;
}

export default function PostCard({ post, allScores, accountTypes, accountNames, playplaySlugs, showSector }: PostCardProps) {
  const fmt = normalizeFormat(post.format_family);
  const style = getFormatStyle(post.format_family);
  const authorType = mapLookup(accountTypes, post.author_name || "");

  return (
    <a
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
          <div className="min-w-0 flex-1">
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
            {showSector && post.sector && (
              <p className="text-[11px] text-gray-400 truncate">{post.sector}</p>
            )}
          </div>
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
}

import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";
import { normalizeFormat, getFormatStyle, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { mapLookup, setHas } from "../utils/maps";
import { PersonIcon, BuildingIcon, LinkedInIcon, InstagramIcon, TikTokIcon } from "./icons";

// Re-exports so existing imports from PostCard keep working
export { FORMAT_COLORS, normalizeFormat, getFormatStyle, FORMAT_LABELS, formatLabel } from "../utils/format";
export { shortUseCaseName } from "../utils/useCase";
export { mapLookup, setHas } from "../utils/maps";
export { PersonIcon, BuildingIcon, LinkedInIcon, InstagramIcon, TikTokIcon } from "./icons";

export function isVideoPost(post: Post) {
  if (post.video_url) return true;
  return normalizeFormat(post.format_family) === "video";
}

export function computeEngagement(post: Post) {
  return post.reactions + post.comments * 3;
}

// --- PostCard component ---

interface PostCardProps {
  post: Post;
  allScores: number[];
  accountTypes?: Map<string, "company" | "person">;
  accountNames?: Map<string, string>;
  playplaySlugs?: Set<string>;
  showSector?: boolean;
  showUseCase?: boolean;
}

export default function PostCard({ post, allScores, accountTypes, accountNames, playplaySlugs, showSector, showUseCase }: PostCardProps) {
  const fmt = normalizeFormat(post.format_family);
  const style = getFormatStyle(post.format_family);
  const authorType = mapLookup(accountTypes, post.author_name || "");
  const isPlayPlay = setHas(playplaySlugs, post.author_name || "");

  return (
    <a
      href={post.post_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2.5">
        {/* Line 1: name + format pill + platform icon */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5 min-w-0 flex-1">
            {authorType === "person" ? (
              <PersonIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : authorType === "company" ? (
              <BuildingIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : null}
            <span className="truncate">
              {mapLookup(accountNames, post.author_name || "") || post.author_name || "Unknown"}
            </span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {fmt && (
              <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                {formatLabel(fmt)}
              </span>
            )}
            {post.platform === "tiktok" ? (
              <TikTokIcon className="w-3.5 h-3.5 text-black" />
            ) : post.platform === "instagram" ? (
              <InstagramIcon className="w-3.5 h-3.5 text-[#E4405F]" />
            ) : (
              <LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" />
            )}
          </div>
        </div>
        {/* Line 2: sector + use case */}
        <div className="flex items-center justify-between mt-1">
          {showSector && post.sector ? (
            <p className="text-[10px] text-gray-400 truncate">{post.sector}</p>
          ) : <span />}
          {showUseCase && post.claude_use_case && (
            <span className="text-[10px] text-gray-400 shrink-0 truncate max-w-[140px]">
              <span className="opacity-50">&#x25CE;</span> {shortUseCaseName(post.claude_use_case)}
            </span>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="aspect-[4/3] overflow-hidden relative bg-gray-50">
        {post.image_url ? (
          <>
            <img
              src={post.image_url}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                const fallback = img.parentElement?.querySelector<HTMLElement>("[data-img-fallback]");
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div
              data-img-fallback
              className="absolute inset-0 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200"
              style={{ display: "none" }}
            >
              {post.platform === "tiktok" ? (
                <TikTokIcon className="w-10 h-10 text-gray-300" />
              ) : post.platform === "instagram" ? (
                <InstagramIcon className="w-10 h-10 text-gray-300" />
              ) : (
                <LinkedInIcon className="w-10 h-10 text-gray-300" />
              )}
            </div>
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

      {/* Footer — engagement (colored) + PlayPlay Client */}
      {(() => {
        const eng = getEngagementLabel(post, allScores);
        const engColor = eng.label === "Viral"
          ? "text-[#b94040]"
          : eng.label === "Engaging"
            ? "text-[#2b7cb8]"
            : "text-gray-400";
        return (
          <div className="px-4 py-3.5 flex items-center gap-4 text-xs">
            <span className={`flex items-center gap-1 ${engColor}`}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              {post.reactions}
            </span>
            <span className={`flex items-center gap-1 ${engColor}`}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
              {post.comments}
            </span>
            {isPlayPlay && (
              <span className="ml-auto text-[10px] text-violet-400">PlayPlay Client</span>
            )}
          </div>
        );
      })()}
    </a>
  );
}

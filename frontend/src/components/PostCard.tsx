import type { Post } from "../types";
import { getEngagementLabel } from "../utils/engagement";
import { normalizeFormat, getFormatStyle, formatLabel } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { mapLookup } from "../utils/maps";
import { PersonIcon, BuildingIcon, LinkedInIcon, InstagramIcon, TikTokIcon } from "./icons";

function isVideoPost(post: Post) {
  if (post.video_url) return true;
  return normalizeFormat(post.format_family) === "video";
}

interface PostCardProps {
  post: Post;
  allScores: number[];
  accountTypes?: Map<string, "company" | "person">;
  accountNames?: Map<string, string>;
  showSector?: boolean;
  showUseCase?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (postId: string) => void;
  onOpenModal?: (post: Post) => void;
}

export default function PostCard({
  post, allScores, accountTypes, accountNames,
  showSector, showUseCase, isFavorite, onToggleFavorite, onOpenModal,
}: PostCardProps) {
  const fmt = normalizeFormat(post.format_family);
  const style = getFormatStyle(post.format_family);
  const authorType = mapLookup(accountTypes, post.author_name || "");
  const isFlaggedPlayPlay = !!(post.playplay_flag || post.playplay_design_flag);

  return (
    <div
      className="relative bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer border border-gray-200"
      onClick={() => onOpenModal?.(post)}
    >
      {/* Favorite button */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(post.id); }}
          className="w-7 h-7 rounded-full bg-white/90 shadow-sm border border-gray-200 flex items-center justify-center hover:bg-white transition-colors"
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? (
            <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          )}
        </button>
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5 min-w-0 flex-1">
            {authorType === "person" ? (
              <PersonIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : authorType === "company" ? (
              <BuildingIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : null}
            <span className="truncate">
              {mapLookup(accountNames, post.author_name || "") || post.author_company || post.author_name || "Unknown"}
            </span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0 mr-8">
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
        <div className="flex items-center justify-between mt-1">
          {showSector && post.sector ? (
            <p className="text-[10px] text-gray-400 truncate">{post.sector}</p>
          ) : null}
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
            {isFlaggedPlayPlay && (
              <div className="absolute bottom-2 right-2 z-10">
                <img
                  src="/playplay-logo.jpeg"
                  alt="PlayPlay"
                  className="w-8 h-8 rounded-md shadow-md object-cover"
                />
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

      {/* Footer */}
      {(() => {
        const eng = getEngagementLabel(post, allScores);
        const dotColor = eng.label === "Viral"
          ? "bg-[#b94040]"
          : eng.label === "Engaging"
            ? "bg-[#2b7cb8]"
            : "bg-gray-300";
        const textColor = eng.label === "Viral"
          ? "text-[#b94040]"
          : eng.label === "Engaging"
            ? "text-[#2b7cb8]"
            : "text-gray-400";
        return (
          <div className="px-4 py-3.5 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              {post.reactions}
            </span>
            <span className="flex items-center gap-1 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
              {post.comments}
            </span>
            <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${textColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              {eng.label}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

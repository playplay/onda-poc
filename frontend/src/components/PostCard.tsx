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

export function LinkedInIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

export function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

// --- Use case short names ---

const USE_CASE_SHORT_NAMES: Record<string, string> = {
  "announce an event": "Event announce",
  "recap an event": "Event recap",
  "present a webinar/program": "Webinar / Program",
  "share internal initiative": "Internal initiative",
  "promote open positions": "Job opening",
  "welcome new employee": "New hire welcome",
  "spotlight an employee/team": "Employee spotlight",
  "present an offer/product": "Product presentation",
  "showcase a customer success story": "Customer story",
  "present company strategy": "Company strategy",
  "share results or statistics or performance": "Results & stats",
  "share company values": "Company values",
  "share tips and tricks": "Tips & tricks",
  "promote a product": "Product promo",
  "share news": "Company news",
  "explain a process": "Process explainer",
  "train employees": "Employee training",
  "educate on a topic": "Education",
  "share a testimonial": "Testimonial",
  "introduce a new tool or feature": "New tool / Feature",
  "react to current events": "Current events",
  "celebrate milestone": "Milestone",
  "tutorial": "Tutorial",
  "express opinion (pov)": "Opinion / POV",
  "promote a service": "Service promo",
  "other": "Other",
};

export function shortUseCaseName(fullName: string): string {
  return USE_CASE_SHORT_NAMES[fullName] || fullName;
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
            {post.platform === "instagram" ? (
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
              {post.platform === "instagram" ? (
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

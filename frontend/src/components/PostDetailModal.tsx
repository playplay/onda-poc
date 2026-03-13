import { useEffect, useRef, useState } from "react";
import type { Post } from "../types";
import { mapLookup, setHas } from "../utils/maps";
import { normalizeFormat, formatLabel, getFormatStyle } from "../utils/format";
import { shortUseCaseName } from "../utils/useCase";
import { getEngagementLabel } from "../utils/engagement";
import { PersonIcon, BuildingIcon, LinkedInIcon, InstagramIcon, TikTokIcon } from "./icons";

interface Props {
  post: Post;
  allScores: number[];
  accountTypes?: Map<string, "company" | "person">;
  accountNames?: Map<string, string>;
  playplaySlugs?: Set<string>;
  isFavorite: boolean;
  onToggleFavorite: (postId: string) => void;
  onSetPlayPlayFlag: (flagType: "playplay" | "playplay_design", value: boolean) => void;
  onClose: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function isVideoPost(post: Post) {
  if (post.video_url) return true;
  return normalizeFormat(post.format_family) === "video";
}

function isTextPost(post: Post) {
  return !post.image_url && !isVideoPost(post);
}

export default function PostDetailModal({
  post, allScores, accountTypes, accountNames, playplaySlugs,
  isFavorite, onToggleFavorite, onSetPlayPlayFlag, onClose,
}: Props) {
  const authorType = mapLookup(accountTypes, post.author_name || "");
  const displayName = mapLookup(accountNames, post.author_name || "") || post.author_company || post.author_name || "Unknown";
  const isPlayPlayClient = setHas(playplaySlugs, post.author_name || "");
  const fmt = normalizeFormat(post.format_family);
  const style = fmt ? getFormatStyle(post.format_family) : null;
  const eng = getEngagementLabel(post, allScores);
  const dotColor = eng.label === "Viral" ? "bg-[#b94040]" : eng.label === "Engaging" ? "bg-[#2b7cb8]" : "bg-gray-300";
  const textColor = eng.label === "Viral" ? "text-[#b94040]" : eng.label === "Engaging" ? "text-[#2b7cb8]" : "text-gray-400";

  // Local state — undefined = never set, true = yes, false = no
  // Only re-init when the post ID changes (different post opened)
  const [ppFlag, setPpFlag] = useState<boolean | undefined>(
    () => post.playplay_flag_by ? post.playplay_flag : undefined
  );
  const postIdRef = useRef(post.id);
  useEffect(() => {
    if (post.id !== postIdRef.current) {
      postIdRef.current = post.id;
      setPpFlag(post.playplay_flag_by ? post.playplay_flag : undefined);
    }
  }, [post.id, post.playplay_flag, post.playplay_flag_by]);
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!post.post_url) return;
    navigator.clipboard.writeText(post.post_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleFlag = (value: boolean) => {
    setPpFlag(value);
    onSetPlayPlayFlag("playplay", value);
  };

  const ppFlagBy = post.playplay_flag_name;
  const ppFlagAt = post.playplay_flag_at;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* Fixed-height modal — same size for all post types */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ height: "clamp(440px, 80vh, 560px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex-none flex items-start justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {authorType === "person" ? (
                <PersonIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              ) : authorType === "company" ? (
                <BuildingIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              ) : null}
              <h2 className="text-sm font-semibold text-gray-900 truncate">{displayName}</h2>
              {post.platform === "tiktok" ? (
                <TikTokIcon className="w-3.5 h-3.5 text-black shrink-0" />
              ) : post.platform === "instagram" ? (
                <InstagramIcon className="w-3.5 h-3.5 text-[#E4405F] shrink-0" />
              ) : null}
            </div>
            {post.sector && (
              <p className="text-[10px] text-gray-400 mt-0.5">{post.sector}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex min-h-0">

          {/* Left — preview + text */}
          <div className="flex-1 min-w-0 flex flex-col px-5 py-4 gap-2 overflow-hidden">

            {/* Format + use case row — above the preview, same codes as gallery card */}
            <div className="flex-none flex items-center gap-2 h-5">
              {fmt && style && (
                <span className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                  {formatLabel(fmt)}
                </span>
              )}
              {post.claude_use_case && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="opacity-50 text-[11px]">&#x25CE;</span>
                  {shortUseCaseName(post.claude_use_case)}
                </span>
              )}
            </div>

            {isTextPost(post) ? (
              /* ── Text post: large scrollable body + stats below ── */
              <>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gray-50 rounded-lg p-4">
                  {post.title ? (
                    <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">{post.title}</p>
                  ) : (
                    <p className="text-sm text-gray-300 italic">No text content</p>
                  )}
                </div>
                {/* Stats row — below the text block */}
                <div className="flex-none flex items-center gap-4 text-xs">
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
                  {post.publication_date && (
                    <span className="text-gray-300">{formatDate(post.publication_date)}</span>
                  )}
                  <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${textColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {eng.label}
                  </span>
                </div>
              </>
            ) : (
              /* ── Media post: preview + stats + scrollable text ── */
              <>
                {/* Preview — fixed height, no overlay */}
                <div className="flex-none relative rounded-lg overflow-hidden bg-gray-50 h-44">
                  {post.image_url ? (
                    <>
                      <img
                        src={post.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.style.display = "none";
                          const fb = img.parentElement?.querySelector<HTMLElement>("[data-img-fallback]");
                          if (fb) fb.style.display = "flex";
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
                  ) : (
                    /* video with no image */
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                        <svg className="w-6 h-6 text-white/80 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex-none flex items-center gap-4 text-xs">
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
                  {post.publication_date && (
                    <span className="text-gray-300">{formatDate(post.publication_date)}</span>
                  )}
                  <span className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${textColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {eng.label}
                  </span>
                </div>

                {/* Text content — scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gray-50 rounded-lg p-3">
                  {post.title ? (
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{post.title}</p>
                  ) : (
                    <p className="text-sm text-gray-300 italic">No text content</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="flex-none w-px bg-gray-100 my-4" />

          {/* Right — actions */}
          <div className="flex-none w-52 flex flex-col">
            {/* Action buttons — outside overflow so tooltips are never clipped */}
            <div className="flex-none flex items-center justify-center gap-3 px-5 pt-4 pb-3">
              {/* View on LinkedIn */}
              {post.post_url && (
                <div className="group relative">
                  <a
                    href={post.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-9 h-9 rounded-full border border-[#0A66C2]/30 bg-[#0A66C2]/5 text-[#0A66C2] flex items-center justify-center hover:bg-[#0A66C2]/15 transition-colors"
                  >
                    <LinkedInIcon className="w-4 h-4" />
                  </a>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                    View on LinkedIn
                  </div>
                </div>
              )}

              {/* Copy link */}
              {post.post_url && (
                <div className="group relative">
                  <button
                    onClick={handleCopy}
                    className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  >
                    {copied ? (
                      <svg className="w-4 h-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    )}
                  </button>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                    {copied ? "Copied!" : "Copy link"}
                  </div>
                </div>
              )}

              {/* Favorite */}
              <div className="group relative">
                <button
                  onClick={() => onToggleFavorite(post.id)}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
                    isFavorite
                      ? "bg-amber-50 border-amber-200 hover:bg-amber-100"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <svg
                    className={`w-4 h-4 ${isFavorite ? "text-amber-400" : "text-gray-300"}`}
                    viewBox="0 0 20 20"
                    fill={isFavorite ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={isFavorite ? 0 : 1.5}
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                  {isFavorite ? "Saved" : "Save"}
                </div>
              </div>
            </div>

            {/* Scrollable content below buttons */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">

            {/* PlayPlay section — shown on all posts */}
            <div className="border-t border-gray-100 pt-3 space-y-2.5">
              {isPlayPlayClient && (
                <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full">
                  PlayPlay Client
                </span>
              )}

              <PlayPlaySelector
                value={ppFlag}
                flagBy={ppFlagBy}
                flagAt={ppFlagAt}
                onChange={handleFlag}
              />

              {/* Logo — grayed until flagged */}
              <div className="flex justify-center pt-4 pb-1">
                <img
                  src="/playplay-logo.jpeg"
                  alt="PlayPlay"
                  className={`w-20 h-20 rounded-2xl shadow-sm transition-all duration-200 ${
                    ppFlag === true ? "" : "grayscale opacity-40"
                  }`}
                />
              </div>
            </div>
            </div>{/* end scrollable content */}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayPlaySelector({
  value, flagBy, flagAt, onChange,
}: {
  value: boolean | undefined;
  flagBy?: string | null;
  flagAt?: string | null;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // mousedown so it fires before any blur/focus effects
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const triggerClass =
    value === true
      ? "border-violet-300 bg-violet-500 text-white"
      : value === false
      ? "border-gray-300 bg-white text-gray-900"
      : "border-gray-200 bg-gray-50 text-gray-400";

  const label =
    value === true ? "Made with PP"
    : value === false ? "Not made with PP"
    : "Made with PP ?";

  const select = (v: boolean) => {
    setOpen(false);
    onChange(v);
  };

  return (
    <div className="relative" ref={ref}>
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${triggerClass}`}
        >
          <span className={`text-[11px] ${value === false ? "font-bold" : value === true ? "font-medium" : "font-normal"}`}>
            {label}
          </span>
          <svg className={`w-2.5 h-2.5 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${value === true ? "text-white/70" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* "Set by" info — shown inline below button to avoid overflow clipping */}
        {value !== undefined && flagBy && (
          <p className="text-[9px] text-gray-400 text-center mt-1 leading-tight">
            {value ? "Confirmed" : "Denied"} by {flagBy.split(" ")[0]}
            {flagAt ? ` · ${formatDate(flagAt)}` : ""}
          </p>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <button
            onMouseDown={(e) => { e.preventDefault(); select(true); }}
            className={`w-full text-left px-3 py-2 text-[11px] hover:bg-violet-50 transition-colors ${
              value === true ? "text-violet-700 font-semibold bg-violet-50" : "text-gray-700"
            }`}
          >
            Made with PP
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); select(false); }}
            className={`w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50 transition-colors border-t border-gray-100 ${
              value === false ? "text-gray-900 font-bold" : "text-gray-700"
            }`}
          >
            Not made with PP
          </button>
        </div>
      )}
    </div>
  );
}

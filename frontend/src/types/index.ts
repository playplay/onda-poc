export interface ScrapeRequest {
  sector: string;
}

export interface WatchedAccount {
  id: string;
  name: string;
  type: "company";
  linkedin_url: string;
  sector: string;
  is_playplay_client: boolean;
  created_at: string;
}

export interface WatchedAccountCreate {
  name: string;
  type: "company";
  linkedin_url: string;
  sector: string;
  is_playplay_client?: boolean;
}

export interface WatchedAccountUpdate {
  name?: string;
  type?: "company";
  linkedin_url?: string;
  sector?: string;
  is_playplay_client?: boolean;
}

export interface ScrapeJob {
  id: string;
  search_query: string;
  sector: string | null;
  status: "pending" | "running" | "downloading_videos" | "completed" | "failed";
  total_posts: number | null;
  apify_run_id: string | null;
  apify_run_ids: string[] | null;
  video_download_run_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Post {
  id: string;
  scrape_job_id: string;
  title: string | null;
  author_name: string | null;
  author_company: string | null;
  sector: string | null;
  platform: string;
  content_type: string | null;
  format_family: string | null;
  format_variation: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  impressions: number;
  engagement_score: number;
  post_url: string | null;
  video_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  publication_date: string | null;
  created_at: string;
}

export interface RankedTrend {
  rank: number;
  format_family: string;
  post_count: number;
  avg_engagement_score: number;
  top_posts: Post[];
}

export interface GeminiAnalysis {
  id: string;
  post_id: string;
  business_objective: string | null;
  use_case: string | null;
  audience_target: string | null;
  tone_of_voice: string | null;
  content_style: string | null;
  storytelling_approach: string | null;
  creative_execution: string | null;
  icp: string | null;
  script_hook: string | null;
  script_outline: string | null;
  script_cta: string | null;
  voice_language: string | null;
  text_language: string | null;
  contains_an_interview_footage: boolean | null;
  video_dynamism: string | null;
  media_analyzed: string | null;
  full_analysis: Record<string, unknown> | null;
  created_at: string;
}

// --- Analysis progress types ---

export interface AnalysisStartResult {
  total: number;
  pending: number;
}

export interface AnalysisProgressResult {
  processed: number;
  total: number;
  all_done: boolean;
  current_analysis: GeminiAnalysis | null;
}

// --- Analysis table types ---

export interface AnalysisRow {
  post: Post;
  analysis: GeminiAnalysis | null;
}

// --- Trend detail types ---

export interface TrendDetailResponse {
  trend: {
    rank: number;
    format_family: string;
    post_count: number;
    avg_engagement_score: number;
  } | null;
  posts: Post[];
  analyses: GeminiAnalysis[];
}

export const ANALYSIS_FILTERABLE_FIELDS = [
  "business_objective",
  "use_case",
  "audience_target",
  "tone_of_voice",
  "content_style",
  "storytelling_approach",
  "creative_execution",
  "icp",
  "voice_language",
  "text_language",
  "video_dynamism",
] as const;

export type AnalysisFilterKey = (typeof ANALYSIS_FILTERABLE_FIELDS)[number];
export type AnalysisFilterState = Record<AnalysisFilterKey, string>;

export const ANALYSIS_FILTER_LABELS: Record<AnalysisFilterKey, string> = {
  business_objective: "Objective",
  use_case: "Use Case",
  audience_target: "Audience",
  tone_of_voice: "Tone",
  content_style: "Style",
  storytelling_approach: "Story",
  creative_execution: "Execution",
  icp: "ICP",
  voice_language: "Voice Lang",
  text_language: "Text Lang",
  video_dynamism: "Dynamism",
};

export const ANALYSIS_ENUM_OPTIONS: Record<AnalysisFilterKey, string[]> = {
  business_objective: [
    "awareness", "engagement", "education", "conversion", "loyalty",
    "onboarding", "retention", "internal alignment", "internal training",
    "thought leadership", "brand employer visibility", "advocacy",
    "recruitment", "brand culture or initiatives", "other",
  ],
  use_case: [
    "announce an event", "recap an event", "present a webinar/program",
    "share internal initiative", "promote open positions", "welcome new employee",
    "spotlight an employee/team", "present an offer/product",
    "showcase a customer success story", "present company strategy",
    "share results or statistics or performance", "share company values",
    "share tips and tricks", "promote a product", "share news",
    "explain a process", "train employees", "educate on a topic",
    "share a testimonial", "introduce a new tool or feature",
    "react to current events", "celebrate milestone", "tutorial",
    "express opinion (pov)", "promote a service", "other",
  ],
  audience_target: [
    "employees (internal video)", "customers", "prospects", "partners",
    "candidates", "investors", "media", "general public",
    "leadership/executives", "community (fans/followers)", "students", "other",
  ],
  tone_of_voice: [
    "none", "friendly", "formal", "inspirational", "corporate", "fun",
    "educational", "dynamic", "empowering", "trustworthy", "humorous",
    "empathetic", "authoritative", "celebratory", "provocative", "neutral", "other",
  ],
  content_style: [
    "none", "informative", "narrative/personal journey", "instructional",
    "entertaining", "persuasive", "reactive", "explainer", "highlight reel",
    "testimonial", "interview-based", "trend-based", "emotional", "other",
  ],
  storytelling_approach: [
    "text-based/motion based", "footage based", "voiceover-based", "music-based",
  ],
  creative_execution: [
    "report presentation", "multi-single person snippets", "q&a solo talking",
    "short documentary", "multi-interview snippets", "highlight reel",
    "music based teaser", "long documentary", "two person interview",
    "animated explainer", "expert walkthrough", "snack solo talking",
    "video commentary", "embodied news", "voice-over on media",
    "tutorial, screencast", "webinar recording", "testimonial self-recorded",
    "speaking with animated waveform", "other",
  ],
  icp: [
    "community management", "corporate communication", "hr & employer brand",
    "internal communication", "marketing", "training", "sales",
    "media journalist", "other",
  ],
  voice_language: ["none", "en-us", "fr-fr", "de-de", "others"],
  text_language: ["en-us", "fr-fr", "de-de", "others", "none"],
  video_dynamism: ["slow", "medium", "fast"],
};

export const FAMILY_LABELS: Record<string, string> = {
  video: "Video",
  static: "Static (Image/Doc)",
  text: "Text Only",
  unknown: "Unknown",
};

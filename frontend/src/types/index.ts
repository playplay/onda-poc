export interface ScrapeRequest {
  sector?: string | null;
  posts_per_account?: number;
  by_date?: boolean;
}

export interface CustomSearchCreate {
  account_id?: string | null;
  account_url?: string | null;
  account_name?: string | null;
  posts_limit?: number;
  account_type?: string;
  date_since_months?: number | null;
}

export interface CustomSearchInfo {
  id: string;
  custom_account_name: string | null;
  custom_account_url: string | null;
  status: string;
  total_posts: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface CustomSearchResult {
  job: ScrapeJob;
  posts: Post[];
}

export interface WatchedAccount {
  id: string;
  name: string;
  type: "company" | "person";
  linkedin_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  sector: string;
  company_name: string | null;
  is_playplay_client: boolean;
  assigned_cs_email: string | null;
  created_at: string;
}

export interface WatchedAccountCreate {
  name: string;
  type: "company" | "person";
  linkedin_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  sector: string;
  company_name?: string | null;
  is_playplay_client?: boolean;
  assigned_cs_email?: string | null;
}

export interface WatchedAccountUpdate {
  name?: string;
  type?: "company" | "person";
  linkedin_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  sector?: string;
  company_name?: string | null;
  is_playplay_client?: boolean;
  assigned_cs_email?: string | null;
}

export interface UserInfo {
  email: string;
  name: string;
  role: string;
}

export interface CollectionInfo {
  id: number;
  name: string;
  post_count: number;
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
  is_custom_search?: boolean | null;
  custom_account_name?: string | null;
  custom_account_url?: string | null;
  user_email?: string | null;
  custom_account_type?: string | null;
  date_since_months?: number | null;
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
  author_follower_count: number | null;
  engagement_rate: number | null;
  post_url: string | null;
  video_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  publication_date: string | null;
  claude_use_case: string | null;
  created_at: string;
  playplay_flag?: boolean;
  playplay_flag_by?: string | null;
  playplay_flag_name?: string | null;
  playplay_flag_at?: string | null;
  playplay_design_flag?: boolean;
  playplay_design_flag_by?: string | null;
  playplay_design_flag_name?: string | null;
  playplay_design_flag_at?: string | null;
}

export interface LibraryResponse {
  posts: Post[];
  sectors: string[];
  format_families: string[];
  use_cases: string[];
  platforms: string[];
}

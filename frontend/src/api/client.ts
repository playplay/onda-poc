import axios from "axios";
import type {
  ScrapeRequest,
  ScrapeJob,
  Post,
  RankedTrend,
  GeminiAnalysis,
} from "../types";

const api = axios.create({
  baseURL: "/api",
});

export async function triggerScrape(params: ScrapeRequest): Promise<ScrapeJob> {
  const { data } = await api.post<ScrapeJob>("/scrape", params);
  return data;
}

export async function getScrapeStatus(jobId: string): Promise<ScrapeJob> {
  const { data } = await api.get<ScrapeJob>(`/scrape/${jobId}`);
  return data;
}

export async function getPosts(
  jobId: string,
  opts?: {
    sector?: string;
    format_family?: string;
    sort_by?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Post[]> {
  const { data } = await api.get<Post[]>("/posts", {
    params: { scrape_job_id: jobId, ...opts },
  });
  return data;
}

export async function getRanking(
  jobId: string,
  limit = 10
): Promise<RankedTrend[]> {
  const { data } = await api.get<RankedTrend[]>("/posts/ranking", {
    params: { scrape_job_id: jobId, limit },
  });
  return data;
}

export async function triggerAnalysis(
  postIds: string[]
): Promise<GeminiAnalysis[]> {
  const { data } = await api.post<GeminiAnalysis[]>("/analysis", {
    post_ids: postIds,
  });
  return data;
}

export async function getAnalysis(
  postId: string
): Promise<GeminiAnalysis | null> {
  try {
    const { data } = await api.get<GeminiAnalysis>(`/analysis/${postId}`);
    return data;
  } catch {
    return null;
  }
}

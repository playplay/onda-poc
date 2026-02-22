import axios from "axios";
import type {
  ScrapeRequest,
  ScrapeJob,
  Post,
  RankedTrend,
  GeminiAnalysis,
  AnalysisStartResult,
  AnalysisProgressResult,
  TrendDetailResponse,
  WatchedAccount,
  WatchedAccountCreate,
  WatchedAccountUpdate,
} from "../types";

const api = axios.create({
  baseURL: "/api",
});

export async function listScrapeJobs(limit = 20): Promise<ScrapeJob[]> {
  const { data } = await api.get<ScrapeJob[]>("/scrape", { params: { limit } });
  return data;
}

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

export async function startAnalysis(
  postIds: string[]
): Promise<AnalysisStartResult> {
  const { data } = await api.post<AnalysisStartResult>("/analysis", {
    post_ids: postIds,
  });
  return data;
}

export async function processNextAnalysis(
  postIds: string[]
): Promise<AnalysisProgressResult> {
  const { data } = await api.post<AnalysisProgressResult>(
    "/analysis/process-next",
    { post_ids: postIds }
  );
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

export async function getAnalysesByJob(
  jobId: string
): Promise<GeminiAnalysis[]> {
  const { data } = await api.get<GeminiAnalysis[]>("/analysis", {
    params: { scrape_job_id: jobId },
  });
  return data;
}

export async function getTrendDetail(
  jobId: string,
  rank: number
): Promise<TrendDetailResponse> {
  const { data } = await api.get<TrendDetailResponse>(
    `/trends/${jobId}/rank/${rank}/posts`
  );
  return data;
}

// --- Accounts ---

// Pre-fetch sectors at module load so they're cached before any component mounts
let _sectorsCache: string[] | null = null;
let _sectorsFetch: Promise<string[]> | null = null;

function _fetchSectors(): Promise<string[]> {
  if (!_sectorsFetch) {
    _sectorsFetch = api
      .get<string[]>("/accounts/sectors")
      .then(({ data }) => {
        _sectorsCache = data;
        return data;
      })
      .catch(() => {
        _sectorsFetch = null; // allow retry on failure
        return [];
      });
  }
  return _sectorsFetch;
}

// Fire immediately on import
_fetchSectors();

export function getCachedSectors(): string[] | null {
  return _sectorsCache;
}

export async function getSectors(): Promise<string[]> {
  if (_sectorsCache) return _sectorsCache;
  return _fetchSectors();
}

export async function getAccounts(sector?: string): Promise<WatchedAccount[]> {
  const { data } = await api.get<WatchedAccount[]>("/accounts", {
    params: sector ? { sector } : {},
  });
  return data;
}

export async function createAccount(body: WatchedAccountCreate): Promise<WatchedAccount> {
  const { data } = await api.post<WatchedAccount>("/accounts", body);
  return data;
}

export async function updateAccount(id: string, body: WatchedAccountUpdate): Promise<WatchedAccount> {
  const { data } = await api.put<WatchedAccount>(`/accounts/${id}`, body);
  return data;
}

export async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/accounts/${id}`);
}

export function streamTrendSummary(
  jobId: string,
  rank: number,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): () => void {
  const eventSource = new EventSource(`/api/trends/${jobId}/rank/${rank}/summary`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "chunk") {
        onChunk(data.content);
      } else if (data.type === "done") {
        onDone();
        eventSource.close();
      } else if (data.type === "error") {
        onError(data.message);
        eventSource.close();
      }
    } catch {
      // ignore parse errors
    }
  };

  eventSource.onerror = () => {
    onError("Connection lost");
    eventSource.close();
  };

  return () => eventSource.close();
}

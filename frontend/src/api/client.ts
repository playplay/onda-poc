import axios from "axios";
import type {
  ScrapeRequest,
  ScrapeJob,
  Post,
  WatchedAccount,
  WatchedAccountCreate,
  WatchedAccountUpdate,
  LibraryResponse,
  UserInfo,
  CollectionInfo,
  CustomSearchCreate,
  CustomSearchResult,
} from "../types";

const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  withCredentials: true,
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

export async function deleteScrapeJob(jobId: string): Promise<void> {
  await api.delete(`/scrape/${jobId}`);
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

export async function getSectors(forceRefresh = false): Promise<string[]> {
  if (forceRefresh) {
    _sectorsFetch = null;
    _sectorsCache = null;
  }
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

// --- Library ---

export async function getLibrary(portfolio = false): Promise<LibraryResponse> {
  const { data } = await api.get<LibraryResponse>("/library", {
    params: portfolio ? { portfolio: true } : {},
  });
  return data;
}

// --- Users ---

export async function getUsers(): Promise<UserInfo[]> {
  const { data } = await api.get<UserInfo[]>("/accounts/users");
  return data;
}

export async function createUser(name: string, email: string): Promise<UserInfo> {
  const { data } = await api.post<UserInfo>("/accounts/users", { name, email });
  return data;
}

// --- Collections ---

export async function getCollections(): Promise<CollectionInfo[]> {
  const { data } = await api.get<CollectionInfo[]>("/collections");
  return data;
}

export async function createCollection(name: string): Promise<CollectionInfo> {
  const { data } = await api.post<CollectionInfo>("/collections", { name });
  return data;
}

export async function deleteCollection(id: number): Promise<void> {
  await api.delete(`/collections/${id}`);
}

export async function addPostToCollection(collectionId: number, postId: string): Promise<void> {
  await api.post(`/collections/${collectionId}/posts`, { post_id: postId });
}

export async function removePostFromCollection(collectionId: number, postId: string): Promise<void> {
  await api.delete(`/collections/${collectionId}/posts/${postId}`);
}

export async function getCollectionPosts(collectionId: number): Promise<Post[]> {
  const { data } = await api.get<Post[]>(`/collections/${collectionId}/posts`);
  return data;
}

export async function getSavedPostIds(): Promise<Record<number, string[]>> {
  const { data } = await api.get<Record<number, string[]>>("/collections/saved-post-ids");
  return data;
}

// --- Favorites ---

export async function getFavoriteIds(): Promise<string[]> {
  const { data } = await api.get<string[]>("/favorites/ids");
  return data;
}

export async function getFavoritePosts(): Promise<Post[]> {
  const { data } = await api.get<Post[]>("/favorites/posts");
  return data;
}

export async function addFavorite(postId: string): Promise<void> {
  await api.post("/favorites", { post_id: postId });
}

export async function removeFavorite(postId: string): Promise<void> {
  await api.delete(`/favorites/${postId}`);
}

export async function importFavoriteByUrl(url: string): Promise<Post> {
  const { data } = await api.post<Post>("/favorites/import", { url }, { timeout: 90_000 });
  return data;
}

export async function setPlayPlayFlag(
  postId: string,
  flagType: "playplay" | "playplay_design",
  value: boolean
): Promise<Post> {
  const { data } = await api.patch<Post>(`/posts/${postId}/playplay-flag`, {
    flag_type: flagType,
    value,
  });
  return data;
}

// --- Custom Search ---

export async function createCustomSearch(body: CustomSearchCreate): Promise<ScrapeJob> {
  const { data } = await api.post<ScrapeJob>("/custom-search", body);
  return data;
}

export async function listCustomSearches(): Promise<ScrapeJob[]> {
  const { data } = await api.get<ScrapeJob[]>("/custom-search");
  return data;
}

export async function getCustomSearch(jobId: string): Promise<CustomSearchResult> {
  const { data } = await api.get<CustomSearchResult>(`/custom-search/${jobId}`);
  return data;
}


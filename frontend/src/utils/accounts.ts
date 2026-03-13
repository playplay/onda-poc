import type { WatchedAccount } from "../types";

export function sortAccounts(list: WatchedAccount[], currentUserEmail?: string): WatchedAccount[] {
  return [...list].sort((a, b) => {
    if (currentUserEmail) {
      const aIsMe = a.assigned_cs_email === currentUserEmail ? 0 : 1;
      const bIsMe = b.assigned_cs_email === currentUserEmail ? 0 : 1;
      if (aIsMe !== bIsMe) return aIsMe - bIsMe;
    }
    const csA = a.assigned_cs_email ?? "";
    const csB = b.assigned_cs_email ?? "";
    if (csA < csB) return -1;
    if (csA > csB) return 1;
    return a.name.localeCompare(b.name);
  });
}

interface AccountInput {
  name: string;
  type: "company" | "person";
  linkedin_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  company_name?: string | null;
  is_playplay_client?: boolean;
  assigned_cs_email?: string | null;
}

export interface AccountMaps {
  names: Map<string, string>;
  types: Map<string, "company" | "person">;
  companyNames: Map<string, string>;
  slugs: Set<string>;
  csmEmails: Map<string, string>;
}

export function buildAccountMaps(accounts: AccountInput[]): AccountMaps {
  const names = new Map<string, string>();
  const types = new Map<string, "company" | "person">();
  const companyNames = new Map<string, string>();
  const slugs = new Set<string>();
  const csmEmails = new Map<string, string>();

  function setCsm(key: string, email: string | null | undefined) {
    if (email) csmEmails.set(key, email);
  }

  for (const a of accounts) {
    const match = a.linkedin_url?.match(/\/(in|company)\/([^/]+)/);
    const slug = match ? match[2] : "";
    if (slug) {
      names.set(slug, a.name);
      types.set(slug, a.type);
      if (a.company_name) companyNames.set(slug, a.company_name);
      setCsm(slug, a.assigned_cs_email);
    }
    names.set(a.name, a.name);
    types.set(a.name, a.type);
    names.set(a.name.toLowerCase(), a.name);
    types.set(a.name.toLowerCase(), a.type);
    setCsm(a.name, a.assigned_cs_email);
    setCsm(a.name.toLowerCase(), a.assigned_cs_email);
    if (a.company_name) {
      companyNames.set(a.name, a.company_name);
      companyNames.set(a.name.toLowerCase(), a.company_name);
    }

    if (a.instagram_url) {
      const igMatch = a.instagram_url.match(/instagram\.com\/([^/?\s]+)/);
      if (igMatch) {
        const igUser = igMatch[1].toLowerCase();
        names.set(igUser, a.name);
        types.set(igUser, a.type);
        if (a.company_name) companyNames.set(igUser, a.company_name);
        setCsm(igUser, a.assigned_cs_email);
        if (a.is_playplay_client) slugs.add(igUser);
      }
    }

    if (a.tiktok_url) {
      const ttMatch = a.tiktok_url.match(/tiktok\.com\/@([^/?\s]+)/);
      if (ttMatch) {
        const ttUser = ttMatch[1].toLowerCase();
        names.set(ttUser, a.name);
        types.set(ttUser, a.type);
        if (a.company_name) companyNames.set(ttUser, a.company_name);
        setCsm(ttUser, a.assigned_cs_email);
        if (a.is_playplay_client) slugs.add(ttUser);
      }
    }

    if (a.is_playplay_client) {
      if (slug) slugs.add(slug);
      slugs.add(a.name);
      slugs.add(a.name.toLowerCase());
    }
  }

  return { names, types, companyNames, slugs, csmEmails };
}

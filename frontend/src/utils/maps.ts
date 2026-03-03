export function mapLookup<T>(map: Map<string, T> | undefined, key: string): T | undefined {
  if (!map) return undefined;
  return map.get(key) ?? map.get(key.toLowerCase());
}

export function setHas(set: Set<string> | undefined, key: string): boolean {
  if (!set) return false;
  return set.has(key) || set.has(key.toLowerCase());
}

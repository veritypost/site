const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

export function parseAnonReads(cookieValue: string | null | undefined): string[] {
  if (!cookieValue) return [];
  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return parsed.filter(
      (entry): entry is string =>
        typeof entry === 'string' && new Date(entry).getTime() >= cutoff,
    );
  } catch {
    return [];
  }
}

export function getAnonReadCount(cookieValue: string | null | undefined): number {
  return parseAnonReads(cookieValue).length;
}

export function incrementAnonRead(cookieValue: string | null | undefined): string {
  const reads = parseAnonReads(cookieValue);
  reads.push(new Date().toISOString());
  const trimmed = reads.slice(-MAX_ENTRIES);
  return serializeAnonReads(trimmed);
}

export function serializeAnonReads(reads: string[]): string {
  return encodeURIComponent(JSON.stringify(reads));
}

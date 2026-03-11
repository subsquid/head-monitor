export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRetryAfterMs(response: Response, defaultMs: number): number {
  const header = response.headers.get('Retry-After');
  if (header == null) return defaultMs;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), defaultMs);

  return defaultMs;
}
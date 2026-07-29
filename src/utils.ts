export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function toMilliseconds(timestamp: number): number {
  if (timestamp < 1e12) {
    return timestamp * 1000;
  }
  return timestamp;
}

/**
 * Per-endpoint exponential backoff.
 *
 * Reference endpoints are probed once per block, so a fast failure (an unresolvable
 * name NXDOMAINs in ~1ms) turns into a retry loop that runs at chain head rate. Skipping
 * the request entirely while an endpoint is in backoff is what keeps that off the wire —
 * a request that is never issued costs no DNS lookup and logs nothing.
 */
export class EndpointBackoff {
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly state = new Map<string, { failures: number; nextAttemptMs: number }>();

  constructor(baseMs = 1000, maxMs = 60000) {
    this.baseMs = baseMs;
    this.maxMs = maxMs;
  }

  shouldSkip(url: string, now: number = Date.now()): boolean {
    const entry = this.state.get(url);
    return entry !== undefined && now < entry.nextAttemptMs;
  }

  /** Returns the delay applied, so the caller can log the transition once per window. */
  recordFailure(url: string, now: number = Date.now()): number {
    const failures = (this.state.get(url)?.failures ?? 0) + 1;
    const delayMs = Math.min(this.baseMs * 2 ** (failures - 1), this.maxMs);
    this.state.set(url, { failures, nextAttemptMs: now + delayMs });
    return delayMs;
  }

  recordSuccess(url: string): void {
    this.state.delete(url);
  }

  failureCount(url: string): number {
    return this.state.get(url)?.failures ?? 0;
  }
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
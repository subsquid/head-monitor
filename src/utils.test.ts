import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRetryAfterMs } from './utils';

function mockResponse(retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) {
    headers.set('Retry-After', retryAfter);
  }
  return { headers } as Response;
}

describe('getRetryAfterMs', () => {
  it('returns default when no Retry-After header', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse(), 1000), 1000);
  });

  it('parses Retry-After as seconds', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse('5'), 1000), 5000);
  });

  it('parses Retry-After as zero seconds', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse('0'), 1000), 0);
  });

  it('parses Retry-After as fractional seconds', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse('1.5'), 1000), 1500);
  });

  it('parses Retry-After as HTTP-date in the future', () => {
    const futureDate = new Date(Date.now() + 3000).toUTCString();
    const result = getRetryAfterMs(mockResponse(futureDate), 1000);
    // Should be roughly 3000ms, allow tolerance for date rounding
    assert.ok(result >= 2000 && result <= 4000, `expected ~3000, got ${result}`);
  });

  it('returns default for HTTP-date in the past', () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString();
    const result = getRetryAfterMs(mockResponse(pastDate), 1000);
    assert.strictEqual(result, 1000);
  });

  it('returns default for unparseable value', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse('garbage'), 1000), 1000);
  });

  it('uses provided default value', () => {
    assert.strictEqual(getRetryAfterMs(mockResponse(), 2500), 2500);
  });
});

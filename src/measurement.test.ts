import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getRetryAfterMs } from './utils';

// Test the retry logic extracted into getRetryAfterMs.
// HeadMonitor itself starts an infinite loop in its constructor,
// making it impractical to unit test directly without refactoring.
// These tests verify the retry delay calculation that drives the backoff behavior.

function mockResponse(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

describe('503 retry delay calculation', () => {
  it('uses 1s default when portal returns 503 without Retry-After', () => {
    const resp = mockResponse(503);
    const delay = getRetryAfterMs(resp, 1000);
    assert.strictEqual(delay, 1000);
  });

  it('respects Retry-After seconds header on 503', () => {
    const resp = mockResponse(503, { 'Retry-After': '5' });
    const delay = getRetryAfterMs(resp, 1000);
    assert.strictEqual(delay, 5000);
  });

  it('respects Retry-After: 0', () => {
    const resp = mockResponse(503, { 'Retry-After': '0' });
    const delay = getRetryAfterMs(resp, 1000);
    assert.strictEqual(delay, 0);
  });

  it('respects Retry-After with HTTP-date in the future', () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const resp = mockResponse(503, { 'Retry-After': futureDate });
    const delay = getRetryAfterMs(resp, 1000);
    assert.ok(delay >= 9000 && delay <= 11000, `expected ~10000, got ${delay}`);
  });

  it('clamps to default when Retry-After date is in the past', () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString();
    const resp = mockResponse(503, { 'Retry-After': pastDate });
    const delay = getRetryAfterMs(resp, 1000);
    assert.strictEqual(delay, 1000);
  });

  it('falls back to default for invalid Retry-After', () => {
    const resp = mockResponse(503, { 'Retry-After': 'not-a-number' });
    const delay = getRetryAfterMs(resp, 1000);
    assert.strictEqual(delay, 1000);
  });
});

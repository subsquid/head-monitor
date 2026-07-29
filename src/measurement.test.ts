import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getRetryAfterMs, EndpointBackoff } from './utils';

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

describe('reference endpoint backoff', () => {
  const URL_A = 'http://a.evm-hotblocks';
  const URL_B = 'http://b.evm-hotblocks';

  it('does not skip an endpoint that has never failed', () => {
    const backoff = new EndpointBackoff();
    assert.strictEqual(backoff.shouldSkip(URL_A, 0), false);
  });

  it('skips for the backoff window after a failure, then retries', () => {
    const backoff = new EndpointBackoff(1000, 60000);
    assert.strictEqual(backoff.recordFailure(URL_A, 0), 1000);
    assert.strictEqual(backoff.shouldSkip(URL_A, 999), true);
    assert.strictEqual(backoff.shouldSkip(URL_A, 1000), false);
  });

  it('doubles the delay on consecutive failures', () => {
    const backoff = new EndpointBackoff(1000, 60000);
    assert.strictEqual(backoff.recordFailure(URL_A, 0), 1000);
    assert.strictEqual(backoff.recordFailure(URL_A, 1000), 2000);
    assert.strictEqual(backoff.recordFailure(URL_A, 3000), 4000);
    assert.strictEqual(backoff.recordFailure(URL_A, 7000), 8000);
  });

  it('caps the delay at maxMs', () => {
    const backoff = new EndpointBackoff(1000, 5000);
    let delay = 0;
    for (let i = 0; i < 20; i++) delay = backoff.recordFailure(URL_A, 0);
    assert.strictEqual(delay, 5000);
  });

  it('resets to no backoff after a success', () => {
    const backoff = new EndpointBackoff(1000, 60000);
    backoff.recordFailure(URL_A, 0);
    backoff.recordFailure(URL_A, 0);
    backoff.recordSuccess(URL_A);
    assert.strictEqual(backoff.shouldSkip(URL_A, 0), false);
    assert.strictEqual(backoff.failureCount(URL_A), 0);
    // and the next failure starts from the base delay again
    assert.strictEqual(backoff.recordFailure(URL_A, 0), 1000);
  });

  it('tracks endpoints independently', () => {
    const backoff = new EndpointBackoff(1000, 60000);
    backoff.recordFailure(URL_A, 0);
    assert.strictEqual(backoff.shouldSkip(URL_A, 0), true);
    assert.strictEqual(backoff.shouldSkip(URL_B, 0), false);
  });

  it('bounds a permanently dead endpoint to maxMs, not chain-head rate', () => {
    // The regression this guards: a dead reference used to be re-probed once per
    // block. Over 10 minutes at 20 blocks/s that is 12000 attempts.
    const backoff = new EndpointBackoff(1000, 60000);
    const windowMs = 10 * 60 * 1000;
    let attempts = 0;
    for (let now = 0; now < windowMs; now += 50) {
      if (backoff.shouldSkip(URL_A, now)) continue;
      attempts++;
      backoff.recordFailure(URL_A, now);
    }
    assert.ok(attempts <= 15, `expected <=15 attempts in 10min, got ${attempts}`);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { RedirectCache, SlidingWindowRateLimiter } from './rateLimiter';

test('RedirectCache caches values, respects TTL, and supports invalidation', () => {
  const cache = new RedirectCache<string>(2, 5000);
  const t0 = 1_000_000;

  assert.equal(cache.get('promo', t0), undefined);
  cache.set('promo', 'https://example.com', 5000, t0);
  assert.equal(cache.get('promo', t0 + 1000), 'https://example.com');
  assert.equal(cache.get('promo', t0 + 6000), undefined);

  cache.set('a', 'https://a.com', 5000, t0);
  cache.set('b', 'https://b.com', 5000, t0);
  cache.set('c', 'https://c.com', 5000, t0);
  assert.equal(cache.size(), 2);
  assert.equal(cache.get('a', t0), undefined);

  cache.invalidate('b');
  assert.equal(cache.get('b', t0), undefined);
});

test('SlidingWindowRateLimiter enforces request limit within window', () => {
  const limiter = new SlidingWindowRateLimiter(10_000, 3);
  const t0 = 500_000;

  assert.equal(limiter.check('1.2.3.4', t0).allowed, true);
  assert.equal(limiter.check('1.2.3.4', t0 + 100).allowed, true);
  assert.equal(limiter.check('1.2.3.4', t0 + 200).allowed, true);

  const blocked = limiter.check('1.2.3.4', t0 + 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);

  // After window expires, requests are allowed again
  const unblocked = limiter.check('1.2.3.4', t0 + 10_500);
  assert.equal(unblocked.allowed, true);
});

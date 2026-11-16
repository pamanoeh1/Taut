import test from 'node:test';
import assert from 'node:assert/strict';
import { formatShortUrl, normalizeAndValidateDomain } from './customDomain';

test('normalizeAndValidateDomain validates subdomains and strips accidental protocols', () => {
  const ok = normalizeAndValidateDomain('https://go.mydomain.com/path');
  assert.equal(ok.valid, true);
  assert.equal(ok.domain, 'go.mydomain.com');

  const badSingle = normalizeAndValidateDomain('localhost');
  assert.equal(badSingle.valid, false);

  const badIp = normalizeAndValidateDomain('192.168.1.1');
  assert.equal(badIp.valid, false);

  const badPort = normalizeAndValidateDomain('go.mydomain.com:8080');
  assert.equal(badPort.valid, false);
});

test('formatShortUrl formats custom domains cleanly vs default /s/ path', () => {
  assert.equal(
    formatShortUrl('promo-12', 'go.mydomain.com', 'https://app.local'),
    'https://go.mydomain.com/promo-12'
  );
  assert.equal(
    formatShortUrl('promo-12', '', 'https://app.local'),
    'https://app.local/s/promo-12'
  );
});

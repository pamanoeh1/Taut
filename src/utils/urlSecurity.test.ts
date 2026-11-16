import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateShortSlug,
  isLinkExpired,
  normalizeAndValidateUrl,
  screenUrlSafety,
  validateSlug,
} from './urlSecurity';

test('normalizeAndValidateUrl accepts valid http/https and rejects javascript/data schemes', () => {
  const ok = normalizeAndValidateUrl('tokopedia.com/promo-akhir-tahun');
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedUrl, 'https://tokopedia.com/promo-akhir-tahun');

  const xss = normalizeAndValidateUrl('javascript:alert(1)');
  assert.equal(xss.valid, false);

  const dataUri = normalizeAndValidateUrl('data:text/html,<script>alert(1)</script>');
  assert.equal(dataUri.valid, false);
});

test('screenUrlSafety flags phishing keywords, punycode, and userinfo spoofing', () => {
  const safe = screenUrlSafety('https://developer.mozilla.org/en-US/docs/Web');
  assert.equal(safe.status, 'safe');
  assert.ok(safe.score >= 80);

  const phishing = screenUrlSafety('https://dana-kaget.claim-now.tk/login');
  assert.equal(phishing.status, 'blocked');
  assert.ok(phishing.reasons.length >= 1);

  const spoofed = screenUrlSafety('https://bankbca.co.id@evil-site.com/auth');
  assert.equal(spoofed.status, 'blocked');
});

test('validateSlug enforces allowed characters, length, and reserved paths', () => {
  assert.equal(validateSlug('promo-desember').valid, true);
  assert.equal(validateSlug('ab').valid, false);
  assert.equal(validateSlug('api').valid, false);
  assert.equal(validateSlug('promo desember!').valid, false);
});

test('generateShortSlug produces valid lowercase alphanumeric slug of requested length', () => {
  const slug = generateShortSlug(7);
  assert.equal(slug.length, 7);
  assert.match(slug, /^[a-z0-9]{7}$/);
});

test('isLinkExpired accurately evaluates ISO timestamps', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(isLinkExpired('', now), false);
  assert.equal(isLinkExpired('2026-11-15T10:00:00Z', now), true);
  assert.equal(isLinkExpired('2026-11-17T10:00:00Z', now), false);
});

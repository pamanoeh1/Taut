import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendUtmParams,
  buildRedirectBridgeHtml,
  buildVCardPayload,
  isLinkQuotaExceeded,
  pickAbVariant,
  resolveTargetDestination,
} from './routingAndUtm';
import type { ShortLinkItem } from '../types/shortlink';

test('appendUtmParams merges UTM query parameters safely while preserving existing params', () => {
  const result = appendUtmParams('https://tokopedia.com/promo?ref=home#section', {
    source: 'instagram',
    medium: 'bio',
    campaign: 'ramadan_sale',
  });
  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get('ref'), 'home');
  assert.equal(parsed.searchParams.get('utm_source'), 'instagram');
  assert.equal(parsed.searchParams.get('utm_medium'), 'bio');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'ramadan_sale');
  assert.equal(parsed.hash, '#section');
});

test('resolveTargetDestination applies Time > Geo > Device > A/B priority and appends UTM', () => {
  const link: Pick<
    ShortLinkItem,
    'targetUrl' | 'utm' | 'geoRules' | 'deviceRules' | 'abVariants' | 'timeRule'
  > = {
    targetUrl: 'https://default.example.com',
    utm: { source: 'tautkilat', campaign: 'launch' },
    geoRules: [
      { countryCode: 'ID', targetUrl: 'https://shopee.co.id/promo' },
      { countryCode: 'US', targetUrl: 'https://amazon.com/promo' },
    ],
    deviceRules: {
      iosUrl: 'https://apps.apple.com/app/id123',
      androidUrl: 'https://play.google.com/store/apps/details?id=com.demo',
    },
    abVariants: [
      { label: 'LP-A', targetUrl: 'https://a.example.com', weight: 50 },
      { label: 'LP-B', targetUrl: 'https://b.example.com', weight: 50 },
    ],
    timeRule: {
      switchAt: '2026-12-31T23:59:00.000Z',
      afterTargetUrl: 'https://flashsale-ended.example.com',
    },
  };

  // Before switchAt, ID visitor gets Geo rule
  const geoRes = resolveTargetDestination(link, {
    countryCode: 'ID',
    os: 'Android',
    nowMs: Date.parse('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(geoRes.routedBy, 'geo');
  assert.ok(geoRes.finalUrl.startsWith('https://shopee.co.id/promo'));
  assert.ok(geoRes.finalUrl.includes('utm_source=tautkilat'));

  // Visitor from unmatched country with iOS gets Device rule
  const iosRes = resolveTargetDestination(link, {
    countryCode: 'JP',
    os: 'iOS',
    nowMs: Date.parse('2026-11-01T00:00:00.000Z'),
  });
  assert.equal(iosRes.routedBy, 'device');
  assert.ok(iosRes.finalUrl.startsWith('https://apps.apple.com/app/id123'));

  // After switchAt, Time rule wins
  const timeRes = resolveTargetDestination(link, {
    countryCode: 'ID',
    nowMs: Date.parse('2027-01-01T01:00:00.000Z'),
  });
  assert.equal(timeRes.routedBy, 'time');
  assert.ok(timeRes.finalUrl.startsWith('https://flashsale-ended.example.com'));
});

test('pickAbVariant splits traffic proportionally by weight', () => {
  const variants = [
    { label: 'A', targetUrl: 'https://a.example.com', weight: 50 },
    { label: 'B', targetUrl: 'https://b.example.com', weight: 50 },
  ];
  assert.equal(pickAbVariant(variants, 0.25)?.label, 'A');
  assert.equal(pickAbVariant(variants, 0.75)?.label, 'B');
});

test('isLinkQuotaExceeded checks maxClicks threshold accurately', () => {
  assert.equal(isLinkQuotaExceeded(99, 100), false);
  assert.equal(isLinkQuotaExceeded(100, 100), true);
  assert.equal(isLinkQuotaExceeded(500, null), false);
});

test('buildVCardPayload generates valid vCard 3.0 payload', () => {
  const vcf = buildVCardPayload({
    fullName: 'Budi Santoso',
    organization: 'PT Nusantara',
    role: 'CTO',
    phone: '+628123456789',
    email: 'budi@nusantara.id',
  });
  assert.ok(vcf.includes('BEGIN:VCARD'));
  assert.ok(vcf.includes('FN:Budi Santoso'));
  assert.ok(vcf.includes('TEL;TYPE=CELL:+628123456789'));
  assert.ok(vcf.includes('END:VCARD'));
});

test('buildRedirectBridgeHtml injects Open Graph tags, Pixels, and 3s interstitial countdown', () => {
  const html = buildRedirectBridgeHtml({
    link: {
      slug: 'promo',
      ownerId: 'admin',
      targetUrl: 'https://example.com',
      title: 'Judul Asli',
      redirectType: 302,
      isActive: true,
      hasPassword: false,
      passwordHash: '',
      expiresAt: '',
      safetyStatus: 'safe',
      safetyReason: 'Aman',
      clickCount: 0,
      createdAt: '',
      updatedAt: '',
      ogMeta: {
        title: 'Promo Spesial WA',
        description: 'Diskon hingga 50%',
        imageUrl: 'https://cdn.example.com/thumb.jpg',
      },
      trackingPixels: {
        facebookPixelId: '1234567890',
        googleTagId: 'G-TEST1234',
      },
      interstitialEnabled: true,
    },
    destinationUrl: 'https://example.com/deal',
    interstitialSeconds: 3,
  });

  assert.ok(html.includes('property="og:title" content="Promo Spesial WA"'));
  assert.ok(html.includes('property="og:image" content="https://cdn.example.com/thumb.jpg"'));
  assert.ok(html.includes("fbq('init','1234567890')"));
  assert.ok(html.includes("gtag('config','G-TEST1234')"));
  assert.ok(html.includes('Anda sedang meninggalkan platform kami'));
});

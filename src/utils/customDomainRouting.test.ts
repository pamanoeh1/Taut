import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPublicRouteFromLocation,
  isPublicShortlinkCandidatePath,
  pickBestLinkForHost,
} from './customDomainRouting.ts';
import { validateBioImageSource } from './imageProcessor.ts';

test('isPublicShortlinkCandidatePath accepts custom domain root slugs and /s/:slug', () => {
  assert.equal(isPublicShortlinkCandidatePath('/promo-desember'), true);
  assert.equal(isPublicShortlinkCandidatePath('/s/promo-desember'), true);
  assert.equal(isPublicShortlinkCandidatePath('/katalog_2026/'), true);

  assert.equal(isPublicShortlinkCandidatePath('/'), false);
  assert.equal(isPublicShortlinkCandidatePath('/login'), false);
  assert.equal(isPublicShortlinkCandidatePath('/api/links'), false);
  assert.equal(isPublicShortlinkCandidatePath('/assets/index-123.js'), false);
  assert.equal(isPublicShortlinkCandidatePath('/favicon.ico'), false);
  assert.equal(isPublicShortlinkCandidatePath('/u/nusantarastudio'), false);
});

test('extractPublicRouteFromLocation routes custom domain root slug directly without dashboard login', () => {
  assert.deepEqual(
    extractPublicRouteFromLocation('/promo-desember', 'go.brandanda.com'),
    { kind: 'shortlink', slug: 'promo-desember' }
  );
  assert.deepEqual(
    extractPublicRouteFromLocation('/s/vip-akses', 'tautkilat.id'),
    { kind: 'shortlink', slug: 'vip-akses' }
  );
  assert.deepEqual(
    extractPublicRouteFromLocation('/u/toko-maju', 'tautkilat.id'),
    { kind: 'bio', handle: 'toko-maju' }
  );
  assert.deepEqual(
    extractPublicRouteFromLocation('/', 'bio.brandanda.com', [
      { handle: 'brandanda', customDomain: 'bio.brandanda.com' },
    ]),
    { kind: 'bio', handle: 'brandanda' }
  );
  assert.deepEqual(extractPublicRouteFromLocation('/', 'tautkilat.id'), { kind: 'app' });
});

test('pickBestLinkForHost prefers matching customDomain but falls back to slug match on shared app domains', () => {
  const links = [
    { slug: 'promo-desember', customDomain: 'go.brandanda.com', targetUrl: 'https://brand.com' },
    { slug: 'katalog-2026', customDomain: '', targetUrl: 'https://katalog.com' },
  ];
  assert.equal(pickBestLinkForHost(links, 'promo-desember', 'go.brandanda.com')?.targetUrl, 'https://brand.com');
  assert.equal(pickBestLinkForHost(links, 'promo-desember', 'otherdomain.com')?.targetUrl, 'https://brand.com');
  assert.equal(pickBestLinkForHost(links, 'katalog-2026', 'otherdomain.com')?.targetUrl, 'https://katalog.com');
  assert.equal(pickBestLinkForHost(links, 'missing', 'otherdomain.com'), undefined);
});

test('validateBioImageSource allows valid HTTP/HTTPS, relative paths, and compressed data URIs while blocking scripts', () => {
  assert.equal(validateBioImageSource('https://cdn.site/avatar.jpg').valid, true);
  assert.equal(validateBioImageSource('/src/assets/images/avatar.jpg').valid, true);
  assert.equal(validateBioImageSource('data:image/jpeg;base64,/9j/4AAQSkZJRg==').valid, true);
  assert.equal(validateBioImageSource('javascript:alert(1)').valid, false);
  assert.equal(validateBioImageSource('ftp://files.site/a.png').valid, false);
});

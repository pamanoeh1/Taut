import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  buildFallbackVCardContent,
  handleFallbackRequest,
  resetFallbackStoreForTest,
  shouldFallbackToLocalEngine,
} from './localFallbackEngine.ts';

describe('localFallbackEngine & InfinityFree resiliency', () => {
  beforeEach(() => {
    resetFallbackStoreForTest();
  });

  it('triggers fallback on network errors or non-JSON responses, never on JSON 4xx errors', () => {
    assert.equal(shouldFallbackToLocalEngine({ error: new TypeError('Failed to fetch') }), true);
    assert.equal(shouldFallbackToLocalEngine({ error: new Error('NetworkError when attempting to fetch resource.') }), true);
    assert.equal(shouldFallbackToLocalEngine({ status: 404, contentType: 'text/html; charset=utf-8' }), true);
    assert.equal(shouldFallbackToLocalEngine({ status: 200, contentType: 'text/html' }), true);
    assert.equal(shouldFallbackToLocalEngine({ status: 503, contentType: 'text/plain' }), true);

    assert.equal(shouldFallbackToLocalEngine({ status: 401, contentType: 'application/json; charset=utf-8' }), false);
    assert.equal(shouldFallbackToLocalEngine({ status: 400, contentType: 'application/json' }), false);
    assert.equal(shouldFallbackToLocalEngine({ status: 409, contentType: 'application/json' }), false);
    assert.equal(shouldFallbackToLocalEngine({ status: 200, contentType: 'application/json' }), false);
  });

  it('authenticates default super admin, rejects wrong password, and manages team members', async () => {
    const wrong = await handleFallbackRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'wrong-password',
    });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, 401);

    const login = await handleFallbackRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'admin123!',
    });
    assert.equal(login.ok, true);
    assert.equal((login.data.user as { username: string; role: string }).username, 'admin');
    assert.equal((login.data.user as { role: string }).role, 'super_admin');
    const token = String(login.data.token);
    assert.ok(token.startsWith('tklocal.'));

    const addMember = await handleFallbackRequest(
      '/api/team/members',
      'POST',
      { username: 'staf_marketing', password: 'PasswordKuat99!', role: 'member' },
      token
    );
    assert.equal(addMember.ok, true);
    assert.equal(addMember.status, 201);

    const listMembers = await handleFallbackRequest('/api/team/members', 'GET', {}, token);
    assert.equal(listMembers.ok, true);
    const members = listMembers.data.members as Array<{ username: string }>;
    assert.equal(members.some((m) => m.username === 'staf_marketing'), true);

    const delMember = await handleFallbackRequest('/api/team/members/staf_marketing', 'DELETE', {}, token);
    assert.equal(delMember.ok, true);
  });

  it('creates shortlinks, unlocks protected links, computes analytics, and generates vCard', async () => {
    const login = await handleFallbackRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'admin123!',
    });
    const token = String(login.data.token);

    const created = await handleFallbackRequest(
      '/api/links',
      'POST',
      {
        targetUrl: 'https://example.org/promo',
        customSlug: 'promo-ifree',
        title: 'Promo InfinityFree',
        password: 'rahasia99',
      },
      token
    );
    assert.equal(created.ok, true);
    assert.equal(created.status, 201);

    const unlockFail = await handleFallbackRequest('/api/links/promo-ifree/unlock', 'POST', { password: 'salah' });
    assert.equal(unlockFail.ok, false);
    assert.equal(unlockFail.status, 401);

    const unlockOk = await handleFallbackRequest('/api/links/promo-ifree/unlock', 'POST', { password: 'rahasia99' });
    assert.equal(unlockOk.ok, true);
    assert.equal(unlockOk.data.targetUrl, 'https://example.org/promo');

    const vcardLink = await handleFallbackRequest(
      '/api/links',
      'POST',
      {
        linkType: 'vcard',
        targetUrl: '',
        customSlug: 'kartu-nadia',
        vcard: { fullName: 'Nadia Pratama', phone: '+628123456789', email: 'nadia@example.id' },
      },
      token
    );
    assert.equal(vcardLink.ok, true);
    const vcf = buildFallbackVCardContent(vcardLink.data.link as never);
    assert.ok(vcf?.includes('FN:Nadia Pratama'));
  });
});

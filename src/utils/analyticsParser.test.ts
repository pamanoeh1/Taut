import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeoFromHeaders, parseRefererSource, parseUserAgent } from './analyticsParser';

test('parseUserAgent accurately identifies mobile, desktop, tablet, and bots', () => {
  const iphone = parseUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  );
  assert.equal(iphone.device, 'Mobile');
  assert.equal(iphone.os, 'iOS');
  assert.equal(iphone.browser, 'Safari');

  const winChrome = parseUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  assert.equal(winChrome.device, 'Desktop');
  assert.equal(winChrome.os, 'Windows');
  assert.equal(winChrome.browser, 'Chrome');

  const bot = parseUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)');
  assert.equal(bot.device, 'Bot');
});

test('parseGeoFromHeaders maps country codes and falls back safely for local IPs', () => {
  const sg = parseGeoFromHeaders({ 'cf-ipcountry': 'SG' });
  assert.equal(sg.country, 'Singapura');
  assert.equal(sg.city, 'Singapore');

  const local = parseGeoFromHeaders({}, '127.0.0.1');
  assert.equal(local.country, 'Indonesia');
  assert.equal(local.city, 'Jakarta');
});

test('parseRefererSource normalizes common traffic channels', () => {
  assert.equal(parseRefererSource(''), 'Langsung');
  assert.equal(parseRefererSource('https://l.instagram.com/?u=https://taut.id'), 'Instagram');
  assert.equal(parseRefererSource('https://www.google.com/search?q=promo'), 'Google');
  assert.equal(parseRefererSource('https://wa.me/628123456'), 'WhatsApp');
});

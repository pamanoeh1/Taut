import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStyledQrSvg } from './customQrSvg';

test('buildStyledQrSvg renders styled dots, colors, and center logo monogram', () => {
  const svg = buildStyledQrSvg({
    data: 'https://go.mydomain.com/promo',
    fgColor: '#1E40AF',
    bgColor: '#FFFFFF',
    dotStyle: 'dots',
    eyeStyle: 'rounded',
    logoText: 'TK',
  });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('<circle'));
  assert.ok(svg.includes('#1E40AF'));
  assert.ok(svg.includes('>TK</text>'));
});

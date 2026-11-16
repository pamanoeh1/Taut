import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseBulkSpreadsheet } from './bulkImportParser';

test('parseBulkSpreadsheet parses CSV with headers, auto-generates missing slugs, and flags invalid URLs', () => {
  const csv = [
    'url,slug,title,redirect_type',
    'https://nextjs.org/docs,next-docs,Next.js Docs,301',
    'https://react.dev/learn,,React Learn,302',
    'javascript:alert(1),bad-xss,XSS,302',
    'https://example.com/dup,next-docs,Duplicate Slug,302',
  ].join('\n');

  const buf = new TextEncoder().encode(csv).buffer;
  const rows = parseBulkSpreadsheet(buf);

  assert.equal(rows.length, 4);
  assert.equal(rows[0].status, 'ready');
  assert.equal(rows[0].slug, 'next-docs');
  assert.equal(rows[0].redirectType, 301);

  assert.equal(rows[1].status, 'ready');
  assert.equal(rows[1].slugMode, 'generated');
  assert.match(rows[1].slug, /^[a-z0-9]{6}$/);

  assert.equal(rows[2].status, 'error');
  assert.equal(rows[3].status, 'error');
});

test('parseBulkSpreadsheet parses binary XLSX workbook buffers accurately', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['target_url', 'custom_slug', 'label'],
    ['https://nodejs.org/en', 'node-home', 'Node.js'],
    ['https://vitejs.dev', '', 'Vite'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Links');
  const xlsxUint8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const rows = parseBulkSpreadsheet(xlsxUint8);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].slug, 'node-home');
  assert.equal(rows[0].status, 'ready');
  assert.equal(rows[1].slugMode, 'generated');
  assert.equal(rows[1].title, 'Vite');
});

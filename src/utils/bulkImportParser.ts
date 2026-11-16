import * as XLSX from 'xlsx';
import type { RedirectType } from '../types/shortlink';
import {
  generateShortSlug,
  normalizeAndValidateUrl,
  screenUrlSafety,
  validateSlug,
} from './urlSecurity';

export interface ParsedBulkRow {
  rowNumber: number;
  targetUrl: string;
  slug: string;
  slugMode: 'custom' | 'generated';
  title: string;
  redirectType: RedirectType;
  status: 'ready' | 'warning' | 'error';
  reason: string;
}

const URL_HEADER_KEYS = ['url', 'target_url', 'targeturl', 'original_url', 'originalurl', 'link', 'destination', 'tujuan'];
const SLUG_HEADER_KEYS = ['slug', 'custom_slug', 'customslug', 'short_code', 'shortcode', 'alias'];
const TITLE_HEADER_KEYS = ['title', 'judul', 'label', 'name', 'nama'];
const REDIRECT_HEADER_KEYS = ['redirect_type', 'redirecttype', 'redirect', 'status_code', 'type'];

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function looksLikeUrlOrDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed);
}

export function parseBulkSpreadsheet(buffer: ArrayBuffer): ParsedBulkRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!matrix || matrix.length === 0) {
    return [];
  }

  const firstRow = matrix[0] || [];
  const normalizedFirstRow = firstRow.map(normalizeHeader);

  let urlCol = normalizedFirstRow.findIndex((h) => URL_HEADER_KEYS.includes(h));
  let slugCol = normalizedFirstRow.findIndex((h) => SLUG_HEADER_KEYS.includes(h));
  let titleCol = normalizedFirstRow.findIndex((h) => TITLE_HEADER_KEYS.includes(h));
  let redirectCol = normalizedFirstRow.findIndex((h) => REDIRECT_HEADER_KEYS.includes(h));

  // Detect whether row 0 is a header row or raw URL data
  const hasExplicitHeader = urlCol !== -1 || slugCol !== -1;
  let startIndex = 0;

  if (hasExplicitHeader) {
    startIndex = 1;
    if (urlCol === -1) urlCol = 0;
  } else {
    // Check if first row looks like header text rather than a URL
    const firstCell = String(firstRow[0] ?? '').trim();
    if (firstCell && !looksLikeUrlOrDomain(firstCell) && matrix.length > 1) {
      startIndex = 1;
    }
    urlCol = 0;
    slugCol = 1;
    titleCol = 2;
    redirectCol = 3;
  }

  const parsedRows: ParsedBulkRow[] = [];
  const seenSlugs = new Set<string>();

  for (let i = startIndex; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const rawUrl = String(row[urlCol] ?? '').trim();
    const rawSlug = slugCol >= 0 ? String(row[slugCol] ?? '').trim() : '';
    const rawTitle = titleCol >= 0 ? String(row[titleCol] ?? '').trim() : '';
    const rawRedirect = redirectCol >= 0 ? String(row[redirectCol] ?? '').trim() : '';

    // Skip completely empty rows
    if (!rawUrl && !rawSlug && !rawTitle) continue;

    const rowNumber = i + 1;
    const urlCheck = normalizeAndValidateUrl(rawUrl);

    if (!urlCheck.valid) {
      parsedRows.push({
        rowNumber,
        targetUrl: rawUrl,
        slug: rawSlug.toLowerCase(),
        slugMode: rawSlug ? 'custom' : 'generated',
        title: rawTitle,
        redirectType: rawRedirect === '301' ? 301 : 302,
        status: 'error',
        reason: urlCheck.error || 'URL tidak valid.',
      });
      continue;
    }

    const safety = screenUrlSafety(urlCheck.normalizedUrl);
    if (safety.status === 'blocked') {
      parsedRows.push({
        rowNumber,
        targetUrl: urlCheck.normalizedUrl,
        slug: rawSlug.toLowerCase(),
        slugMode: rawSlug ? 'custom' : 'generated',
        title: rawTitle,
        redirectType: rawRedirect === '301' ? 301 : 302,
        status: 'error',
        reason: safety.reasons[0] || 'URL diblokir karena berisiko phishing.',
      });
      continue;
    }

    let finalSlug = '';
    let slugMode: 'custom' | 'generated' = 'generated';

    if (rawSlug) {
      slugMode = 'custom';
      const slugCheck = validateSlug(rawSlug);
      if (!slugCheck.valid) {
        parsedRows.push({
          rowNumber,
          targetUrl: urlCheck.normalizedUrl,
          slug: rawSlug,
          slugMode,
          title: rawTitle,
          redirectType: rawRedirect === '301' ? 301 : 302,
          status: 'error',
          reason: slugCheck.error || 'Slug kustom tidak valid.',
        });
        continue;
      }
      finalSlug = slugCheck.normalizedSlug;
    } else {
      do {
        finalSlug = generateShortSlug(6);
      } while (seenSlugs.has(finalSlug));
    }

    if (seenSlugs.has(finalSlug)) {
      parsedRows.push({
        rowNumber,
        targetUrl: urlCheck.normalizedUrl,
        slug: finalSlug,
        slugMode,
        title: rawTitle,
        redirectType: rawRedirect === '301' ? 301 : 302,
        status: 'error',
        reason: `Duplikat slug "${finalSlug}" di dalam file unggahan.`,
      });
      continue;
    }

    seenSlugs.add(finalSlug);

    let defaultTitle = rawTitle;
    if (!defaultTitle) {
      try {
        defaultTitle = new URL(urlCheck.normalizedUrl).hostname;
      } catch {
        defaultTitle = finalSlug;
      }
    }

    parsedRows.push({
      rowNumber,
      targetUrl: urlCheck.normalizedUrl,
      slug: finalSlug,
      slugMode,
      title: defaultTitle.slice(0, 120),
      redirectType: rawRedirect === '301' ? 301 : 302,
      status: safety.status === 'warning' ? 'warning' : 'ready',
      reason: safety.status === 'warning' ? safety.reasons[0] : 'Siap dibuat',
    });
  }

  return parsedRows;
}

export function generateSampleCsvContent(): string {
  return [
    'url,slug,title,redirect_type',
    'https://tokopedia.com/promo-flash-sale,flash-sale-nov,Promo Flash Sale November,302',
    'https://developer.mozilla.org/en-US/docs/Web/HTTP,http-docs,Dokumentasi HTTP MDN,301',
    'https://react.dev/reference/react,,Referensi React (Slug Otomatis),302',
  ].join('\n');
}

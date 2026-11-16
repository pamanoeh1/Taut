import { validateSlug } from './urlSecurity';

export type PublicRouteResolution =
  | { kind: 'shortlink'; slug: string }
  | { kind: 'bio'; handle: string }
  | { kind: 'app' };

const NON_SLUG_PREFIXES = [
  '/api/',
  '/assets/',
  '/src/',
  '/@',
  '/node_modules/',
  '/.well-known/',
];

const RESERVED_APP_PATHS = new Set([
  'api',
  's',
  'u',
  'admin',
  'login',
  'logout',
  'register',
  'dashboard',
  'analytics',
  'bio',
  'settings',
  'assets',
  'static',
  'health',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'index.html',
]);

/**
 * Determines whether an incoming single-segment URL path (e.g. "/promo-desember" on a custom domain
 * or "/s/promo-desember" on the default domain) is a public shortlink candidate that should bypass
 * the dashboard login screen.
 */
export function isPublicShortlinkCandidatePath(pathname: string): boolean {
  const cleanPath = (pathname || '/').split('?')[0].split('#')[0];
  if (cleanPath === '/' || cleanPath === '') return false;
  if (cleanPath.startsWith('/s/')) return true;
  for (const prefix of NON_SLUG_PREFIXES) {
    if (cleanPath.startsWith(prefix)) return false;
  }

  const trimmed = cleanPath.replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('/')) return false;
  if (trimmed.includes('.')) return false; // Exclude static files like .js, .css, .png, .php, .html
  if (RESERVED_APP_PATHS.has(trimmed.toLowerCase())) return false;

  const slugCheck = validateSlug(trimmed);
  return slugCheck.valid;
}

/**
 * Extracts public route intent from window.location.pathname and hostname BEFORE checking auth.
 * Ensures custom domain shortlinks (e.g. https://go.brand.com/promo-desember) and /s/:slug or /u/:handle
 * resolve directly without redirecting visitors to LoginPage.
 */
export function extractPublicRouteFromLocation(
  pathname: string,
  hostname: string = '',
  bioProfiles: Array<{ handle: string; customDomain?: string }> = []
): PublicRouteResolution {
  const cleanPath = (pathname || '/').split('?')[0].split('#')[0];
  const cleanHost = hostname.trim().toLowerCase().replace(/:\d+$/, '');

  if (cleanPath.startsWith('/s/')) {
    const slug = cleanPath.slice(3).split('/')[0]?.trim().toLowerCase();
    if (slug) return { kind: 'shortlink', slug };
  }

  if (cleanPath.startsWith('/u/')) {
    const handle = cleanPath.slice(3).split('/')[0]?.trim().toLowerCase();
    if (handle) return { kind: 'bio', handle };
  }

  if ((cleanPath === '/' || cleanPath === '') && cleanHost) {
    const matchedBio = bioProfiles.find(
      (b) => b.customDomain && b.customDomain.trim().toLowerCase() === cleanHost
    );
    if (matchedBio) {
      return { kind: 'bio', handle: matchedBio.handle };
    }
  }

  if (isPublicShortlinkCandidatePath(cleanPath)) {
    const slug = cleanPath.replace(/^\/+|\/+$/g, '').toLowerCase();
    return { kind: 'shortlink', slug };
  }

  return { kind: 'app' };
}

/**
 * Picks the matching shortlink for an incoming slug and host.
 * If multiple links shared a slug or a customDomain is attached, prioritizes an exact domain match
 * while still allowing any matching active shortlink to resolve on same-app parked/secondary domains.
 */
export function pickBestLinkForHost<T extends { slug: string; customDomain?: string }>(
  links: T[],
  slug: string,
  requestHost: string = ''
): T | undefined {
  const targetSlug = slug.trim().toLowerCase();
  const cleanHost = requestHost.trim().toLowerCase().replace(/:\d+$/, '');
  const candidates = links.filter((l) => l.slug.toLowerCase() === targetSlug);
  if (candidates.length === 0) return undefined;
  if (cleanHost) {
    const exactHostMatch = candidates.find(
      (l) => (l.customDomain || '').trim().toLowerCase() === cleanHost
    );
    if (exactHostMatch) return exactHostMatch;
  }
  return candidates[0];
}

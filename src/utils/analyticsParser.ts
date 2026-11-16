export interface ParsedUserAgent {
  device: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  os: string;
  browser: string;
}

export interface ParsedGeoInfo {
  countryCode: string;
  country: string;
  city: string;
}

export function parseUserAgent(uaRaw?: string): ParsedUserAgent {
  const ua = (uaRaw || '').trim();
  if (!ua) {
    return { device: 'Desktop', os: 'Unknown', browser: 'Unknown' };
  }

  const lower = ua.toLowerCase();

  // Bot detection
  if (/(bot|crawler|spider|curl|wget|python-requests|postman|headless|lighthouse|slurp)/i.test(lower)) {
    return { device: 'Bot', os: 'Automated', browser: 'Crawler' };
  }

  // OS detection
  let os = 'Other';
  if (/iphone|ipad|ipod/i.test(lower)) {
    os = 'iOS';
  } else if (/android/i.test(lower)) {
    os = 'Android';
  } else if (/windows nt/i.test(lower)) {
    os = 'Windows';
  } else if (/mac os x|macintosh/i.test(lower)) {
    os = 'macOS';
  } else if (/linux/i.test(lower)) {
    os = 'Linux';
  }

  // Device type detection
  let device: ParsedUserAgent['device'] = 'Desktop';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(lower)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(lower)) {
    device = 'Mobile';
  }

  // Browser detection (order matters: Edge/Opera before Chrome, Chrome before Safari)
  let browser = 'Other';
  if (/edg\//i.test(lower) || /edge\//i.test(lower)) {
    browser = 'Edge';
  } else if (/opr\//i.test(lower) || /opera/i.test(lower)) {
    browser = 'Opera';
  } else if (/firefox\//i.test(lower)) {
    browser = 'Firefox';
  } else if (/chrome\//i.test(lower) || /crios\//i.test(lower)) {
    browser = 'Chrome';
  } else if (/safari\//i.test(lower)) {
    browser = 'Safari';
  }

  return { device, os, browser };
}

const COUNTRY_NAME_MAP: Record<string, { country: string; defaultCity: string }> = {
  ID: { country: 'Indonesia', defaultCity: 'Jakarta' },
  SG: { country: 'Singapura', defaultCity: 'Singapore' },
  MY: { country: 'Malaysia', defaultCity: 'Kuala Lumpur' },
  US: { country: 'Amerika Serikat', defaultCity: 'San Francisco' },
  JP: { country: 'Jepang', defaultCity: 'Tokyo' },
  AU: { country: 'Australia', defaultCity: 'Sydney' },
  GB: { country: 'Inggris', defaultCity: 'London' },
  DE: { country: 'Jerman', defaultCity: 'Frankfurt' },
};

export function parseGeoFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  ip?: string
): ParsedGeoInfo {
  const getHeader = (name: string): string => {
    const val = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || '';
    return val || '';
  };

  const rawCountry = (
    getHeader('x-appengine-country') ||
    getHeader('cf-ipcountry') ||
    getHeader('x-vercel-ip-country') ||
    getHeader('x-country-code')
  )
    .trim()
    .toUpperCase();

  const rawCity = (
    getHeader('x-appengine-city') ||
    getHeader('cf-ipcity') ||
    getHeader('x-vercel-ip-city')
  ).trim();

  if (rawCountry && rawCountry !== 'ZZ' && rawCountry !== 'XX') {
    const mapped = COUNTRY_NAME_MAP[rawCountry];
    if (mapped) {
      return {
        countryCode: rawCountry,
        country: mapped.country,
        city: rawCity ? capitalizeCity(rawCity) : mapped.defaultCity,
      };
    }
    return {
      countryCode: rawCountry,
      country: rawCountry,
      city: rawCity ? capitalizeCity(rawCity) : 'Metro',
    };
  }

  // Local / private IP fallback (never leak raw IP)
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { countryCode: 'ID', country: 'Indonesia', city: 'Jakarta' };
  }

  return { countryCode: 'ID', country: 'Indonesia', city: 'Bandung' };
}

function capitalizeCity(city: string): string {
  return decodeURIComponent(city)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function parseRefererSource(rawReferer?: string): string {
  if (!rawReferer || !rawReferer.trim()) {
    return 'Langsung';
  }
  try {
    const parsed = new URL(rawReferer);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('whatsapp') || host.includes('wa.me')) return 'WhatsApp';
    if (host.includes('instagram') || host.includes('l.instagram.com')) return 'Instagram';
    if (host.includes('google.')) return 'Google';
    if (host.includes('t.co') || host.includes('twitter') || host.includes('x.com')) return 'X / Twitter';
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('localhost') || host.includes('run.app')) return 'Langsung';
    return host.replace(/^www\./, '');
  } catch {
    return 'Langsung';
  }
}

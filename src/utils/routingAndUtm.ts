import type {
  AbVariantRule,
  ShortLinkItem,
  UtmParams,
  VCardData,
} from '../types/shortlink';

export function appendUtmParams(rawUrl: string, utm?: UtmParams | null): string {
  if (!rawUrl) return '';
  if (!utm) return rawUrl;
  const entries: Array<[string, string | undefined]> = [
    ['utm_source', utm.source],
    ['utm_medium', utm.medium],
    ['utm_campaign', utm.campaign],
    ['utm_term', utm.term],
    ['utm_content', utm.content],
  ];
  const hasAny = entries.some(([, v]) => Boolean(v && v.trim()));
  if (!hasAny) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    for (const [key, value] of entries) {
      if (value && value.trim()) {
        parsed.searchParams.set(key, value.trim());
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function isLinkQuotaExceeded(clickCount: number, maxClicks?: number | null): boolean {
  if (typeof maxClicks !== 'number' || !Number.isFinite(maxClicks) || maxClicks <= 0) {
    return false;
  }
  return clickCount >= maxClicks;
}

export function pickAbVariant(
  variants: AbVariantRule[],
  randomZeroToOne: number = Math.random()
): AbVariantRule | null {
  const valid = variants.filter((v) => v.targetUrl && v.weight > 0);
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight <= 0) return valid[0];

  const threshold = Math.max(0, Math.min(0.999999, randomZeroToOne)) * totalWeight;
  let acc = 0;
  for (const variant of valid) {
    acc += variant.weight;
    if (threshold < acc) {
      return variant;
    }
  }
  return valid[valid.length - 1];
}

export interface RoutingEvaluationContext {
  countryCode?: string;
  os?: string;
  nowMs?: number;
  randomValue?: number;
}

export interface ResolvedDestination {
  finalUrl: string;
  routedBy: 'time' | 'geo' | 'device' | 'ab_split' | 'default';
  variantLabel?: string;
}

export function resolveTargetDestination(
  link: Pick<
    ShortLinkItem,
    'targetUrl' | 'utm' | 'geoRules' | 'deviceRules' | 'abVariants' | 'timeRule'
  >,
  ctx: RoutingEvaluationContext = {}
): ResolvedDestination {
  const nowMs = ctx.nowMs ?? Date.now();
  let chosenUrl = link.targetUrl;
  let routedBy: ResolvedDestination['routedBy'] = 'default';
  let variantLabel: string | undefined;

  // 1. Time-based routing (flash sale / scheduled switch)
  if (link.timeRule?.switchAt && link.timeRule.afterTargetUrl) {
    const switchTs = Date.parse(link.timeRule.switchAt);
    if (!Number.isNaN(switchTs) && nowMs >= switchTs) {
      chosenUrl = link.timeRule.afterTargetUrl;
      routedBy = 'time';
    }
  }

  // 2. Geo-Targeting / Country Routing (only overrides if time rule didn't trigger, or checks match)
  if (routedBy === 'default' && ctx.countryCode && Array.isArray(link.geoRules) && link.geoRules.length > 0) {
    const codeUpper = ctx.countryCode.trim().toUpperCase();
    const match = link.geoRules.find(
      (r) => r.countryCode.trim().toUpperCase() === codeUpper && Boolean(r.targetUrl.trim())
    );
    if (match) {
      chosenUrl = match.targetUrl.trim();
      routedBy = 'geo';
    }
  }

  // 3. Device / OS Routing (iOS -> App Store, Android -> Play Store, Desktop)
  if (routedBy === 'default' && ctx.os && link.deviceRules) {
    const osLower = ctx.os.toLowerCase();
    if (osLower === 'ios' && link.deviceRules.iosUrl?.trim()) {
      chosenUrl = link.deviceRules.iosUrl.trim();
      routedBy = 'device';
    } else if (osLower === 'android' && link.deviceRules.androidUrl?.trim()) {
      chosenUrl = link.deviceRules.androidUrl.trim();
      routedBy = 'device';
    } else if (
      (osLower === 'windows' || osLower === 'macos' || osLower === 'linux') &&
      link.deviceRules.desktopUrl?.trim()
    ) {
      chosenUrl = link.deviceRules.desktopUrl.trim();
      routedBy = 'device';
    }
  }

  // 4. A/B Split Testing
  if (routedBy === 'default' && Array.isArray(link.abVariants) && link.abVariants.length > 0) {
    const picked = pickAbVariant(link.abVariants, ctx.randomValue);
    if (picked) {
      chosenUrl = picked.targetUrl.trim();
      routedBy = 'ab_split';
      variantLabel = picked.label || 'Variant';
    }
  }

  // 5. Auto-apply UTM parameters
  const finalUrl = appendUtmParams(chosenUrl, link.utm);
  return { finalUrl, routedBy, variantLabel };
}

function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildVCardPayload(vcard: VCardData): string {
  const fullName = (vcard.fullName || 'Kontak').trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(' ');

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardText(fullName)}`,
    `N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;`,
  ];

  if (vcard.organization?.trim()) {
    lines.push(`ORG:${escapeVCardText(vcard.organization.trim())}`);
  }
  if (vcard.role?.trim()) {
    lines.push(`TITLE:${escapeVCardText(vcard.role.trim())}`);
  }
  if (vcard.phone?.trim()) {
    lines.push(`TEL;TYPE=CELL:${vcard.phone.trim()}`);
  }
  if (vcard.email?.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET:${vcard.email.trim()}`);
  }
  if (vcard.website?.trim()) {
    lines.push(`URL:${vcard.website.trim()}`);
  }
  if (vcard.address?.trim()) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVCardText(vcard.address.trim())};;;;`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function escapeHtmlAttr(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizePixelId(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function buildTrackingPixelScripts(link: ShortLinkItem): string {
  const pixels = link.trackingPixels;
  if (!pixels) return '';
  const chunks: string[] = [];

  const fbId = sanitizePixelId(pixels.facebookPixelId);
  if (fbId) {
    chunks.push(`<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${fbId}');fbq('track','PageView');
</script>`);
  }

  const gaId = sanitizePixelId(pixels.googleTagId);
  if (gaId) {
    chunks.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${gaId}');
</script>`);
  }

  const ttId = sanitizePixelId(pixels.tiktokPixelId);
  if (ttId) {
    chunks.push(`<script>
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${ttId}');ttq.page();}(window,document,'ttq');
</script>`);
  }

  const liId = sanitizePixelId(pixels.linkedinPartnerId);
  if (liId) {
    chunks.push(`<script>
_linkedin_partner_id="${liId}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");
b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b,s);})(window.lintrk);
</script>`);
  }

  return chunks.join('\n');
}

export function buildRedirectBridgeHtml(options: {
  link: ShortLinkItem;
  destinationUrl: string;
  interstitialSeconds: number;
  crawlerOnly?: boolean;
}): string {
  const { link, destinationUrl, interstitialSeconds, crawlerOnly } = options;
  const ogTitle = escapeHtmlAttr(link.ogMeta?.title?.trim() || link.title || link.slug);
  const ogDesc = escapeHtmlAttr(
    link.ogMeta?.description?.trim() || `Tautan terkelola TautKilat menuju ${destinationUrl}`
  );
  const ogImage = link.ogMeta?.imageUrl?.trim() ? escapeHtmlAttr(link.ogMeta.imageUrl.trim()) : '';
  const safeDest = escapeHtmlAttr(destinationUrl);
  const destHost = (() => {
    try {
      return new URL(destinationUrl).hostname;
    } catch {
      return destinationUrl;
    }
  })();

  const pixelScripts = crawlerOnly ? '' : buildTrackingPixelScripts(link);
  const delayMs = Math.max(0, interstitialSeconds * 1000);
  const isInterstitial = interstitialSeconds > 0;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ''}
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDesc}" />
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}" />` : ''}
  ${pixelScripts}
  ${!crawlerOnly ? `<meta http-equiv="refresh" content="${isInterstitial ? interstitialSeconds : 1};url=${safeDest}" />` : ''}
  <style>
    body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{max-width:460px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-sizing:border-box}
    .brand{font-weight:700;font-size:15px;color:#0f172a;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
    .slug{font-family:monospace;font-size:12px;color:#64748b}
    h1{font-size:19px;margin:0 0 8px 0}
    p{font-size:14px;color:#475569;line-height:1.5;margin:0 0 16px 0}
    .url{font-family:monospace;font-size:12px;background:#f1f5f9;padding:10px 12px;border-radius:8px;word-break:break-all;color:#1e40af;margin-bottom:18px}
    .actions{display:flex;gap:10px;align-items:center}
    .btn{display:inline-block;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600}
    .btn-primary{background:#1e40af;color:#fff}
    .btn-secondary{background:#f1f559;background:#f1f5f9;color:#334155}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><span>TautKilat</span><span class="slug">/s/${escapeHtmlAttr(link.slug)}</span></div>
    <h1>${isInterstitial ? 'Anda sedang meninggalkan platform kami' : 'Mengarahkan ke tujuan...'}</h1>
    <p>${
      isInterstitial
        ? `Pastikan Anda mempercayai domain tujuan <strong>${escapeHtmlAttr(destHost)}</strong>. Pengalihan otomatis dalam <span id="cd">${interstitialSeconds}</span> detik.`
        : `Sedang mencatat analitik &amp; pixel retargeting sebelum melanjutkan ke <strong>${escapeHtmlAttr(destHost)}</strong>.`
    }</p>
    <div class="url">${safeDest}</div>
    <div class="actions">
      <a class="btn btn-primary" href="${safeDest}">Lanjutkan Sekarang</a>
      <a class="btn btn-secondary" href="/">Batalkan</a>
    </div>
  </main>
  ${
    crawlerOnly
      ? ''
      : `<script>
    (function(){
      var dest = ${JSON.stringify(destinationUrl)};
      var delay = ${delayMs};
      var sec = ${interstitialSeconds};
      var cd = document.getElementById('cd');
      if (sec > 0 && cd) {
        var timer = setInterval(function(){
          sec -= 1;
          if (sec >= 0) cd.textContent = String(sec);
          if (sec <= 0) clearInterval(timer);
        }, 1000);
      }
      setTimeout(function(){ window.location.replace(dest); }, delay || 350);
    })();
  </script>`
  }
</body>
</html>`;
}

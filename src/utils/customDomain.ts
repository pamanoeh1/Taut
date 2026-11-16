export interface DomainValidationResult {
  valid: boolean;
  domain: string;
  error?: string;
}

const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeAndValidateDomain(rawDomain: string): DomainValidationResult {
  let candidate = rawDomain.trim().toLowerCase();
  if (!candidate) {
    return { valid: false, domain: '', error: 'Nama domain kustom tidak boleh kosong.' };
  }

  // Strip accidental protocol or trailing slashes/paths if user pasted a URL
  candidate = candidate.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];

  if (candidate.includes(':')) {
    return { valid: false, domain: '', error: 'Jangan sertakan nomor port pada domain kustom.' };
  }
  if (candidate.length > 253) {
    return { valid: false, domain: '', error: 'Panjang nama domain maksimal 253 karakter.' };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) {
    return { valid: false, domain: '', error: 'Gunakan nama domain valid, bukan alamat IP.' };
  }

  const labels = candidate.split('.');
  if (labels.length < 2) {
    return {
      valid: false,
      domain: '',
      error: 'Format domain tidak valid. Contoh: go.mydomain.com',
    };
  }

  for (const label of labels) {
    if (!DOMAIN_LABEL_REGEX.test(label)) {
      return {
        valid: false,
        domain: '',
        error: 'Domain hanya boleh berisi huruf kecil, angka, titik (.), dan tanda hubung (-).',
      };
    }
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    return { valid: false, domain: '', error: 'Akhiran TLD domain tidak valid.' };
  }

  return { valid: true, domain: candidate };
}

export function formatShortUrl(
  slug: string,
  customDomain?: string,
  origin: string = ''
): string {
  const cleanDomain = (customDomain || '').trim();
  if (cleanDomain) {
    return `https://${cleanDomain}/${slug}`;
  }
  return origin ? `${origin}/s/${slug}` : `/s/${slug}`;
}

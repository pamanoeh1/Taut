export interface ImageValidationResult {
  valid: boolean;
  value: string;
  error?: string;
}

const MAX_DATA_URI_LENGTH = 260_000; // ~190KB binary JPEG/WebP

export function validateBioImageSource(raw: string): ImageValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, value: '' };
  }
  if (trimmed.startsWith('/')) {
    return { valid: true, value: trimmed };
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    if (trimmed.length > MAX_DATA_URI_LENGTH) {
      return {
        valid: false,
        value: '',
        error: 'Ukuran gambar terkompresi terlalu besar. Gunakan gambar lebih kecil atau URL gambar.',
      };
    }
    return { valid: true, value: trimmed };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      if (trimmed.length > 2048) {
        return { valid: false, value: '', error: 'URL gambar maksimal 2048 karakter.' };
      }
      return { valid: true, value: parsed.toString() };
    }
  } catch {
    // Invalid URL
  }
  return {
    valid: false,
    value: '',
    error: 'Gunakan URL gambar HTTP/HTTPS yang valid atau unggah file gambar dari perangkat.',
  };
}

/**
 * Compresses an image File selected by the user into a lightweight JPEG/WebP data URI
 * so it stores cleanly across Express JSON, InfinityFree PHP, and browser storage.
 */
export function compressImageFileToDataUrl(
  file: File,
  options: { maxWidth: number; maxHeight: number; quality?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (PNG, JPG, WebP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('File gambar kosong.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung oleh browser.'));
      img.onload = () => {
        const ratio = Math.min(
          1,
          options.maxWidth / Math.max(1, img.width),
          options.maxHeight / Math.max(1, img.height)
        );
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia di browser.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', options.quality ?? 0.8);
        if (out.length > MAX_DATA_URI_LENGTH) {
          resolve(canvas.toDataURL('image/jpeg', 0.6));
          return;
        }
        resolve(out);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

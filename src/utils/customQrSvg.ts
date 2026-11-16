import QRCode from 'qrcode';

export type QrDotStyle = 'square' | 'rounded' | 'dots';
export type QrEyeStyle = 'square' | 'rounded';

export interface CustomQrOptions {
  data: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  dotStyle?: QrDotStyle;
  eyeStyle?: QrEyeStyle;
  logoDataUrl?: string;
  logoText?: string;
}

function isInFinderPattern(row: number, col: number, count: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= count - 7;
  const inBottomLeft = row >= count - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function isInCenterLogoZone(row: number, col: number, count: number, hasLogo: boolean): boolean {
  if (!hasLogo) return false;
  const center = (count - 1) / 2;
  const radius = Math.max(2.6, count * 0.14);
  return Math.abs(row - center) <= radius && Math.abs(col - center) <= radius;
}

export function buildStyledQrSvg(options: CustomQrOptions): string {
  const size = options.size ?? 280;
  const fg = options.fgColor || '#0F172A';
  const bg = options.bgColor || '#FFFFFF';
  const dotStyle: QrDotStyle = options.dotStyle || 'square';
  const eyeStyle: QrEyeStyle = options.eyeStyle || 'square';
  const hasLogo = Boolean(options.logoDataUrl || options.logoText?.trim());

  const qr = QRCode.create(options.data || 'https://taut.id', {
    errorCorrectionLevel: hasLogo ? 'H' : 'M',
  });

  const count = qr.modules.size;
  const marginModules = 2;
  const totalModules = count + marginModules * 2;
  const cellSize = size / totalModules;

  const paths: string[] = [];

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.modules.get(r, c)) continue;
      if (isInFinderPattern(r, c, count)) continue;
      if (isInCenterLogoZone(r, c, count, hasLogo)) continue;

      const x = (c + marginModules) * cellSize;
      const y = (r + marginModules) * cellSize;

      if (dotStyle === 'dots') {
        const cx = (x + cellSize / 2).toFixed(2);
        const cy = (y + cellSize / 2).toFixed(2);
        const rad = (cellSize * 0.42).toFixed(2);
        paths.push(`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fg}" />`);
      } else if (dotStyle === 'rounded') {
        const rx = (cellSize * 0.28).toFixed(2);
        paths.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" rx="${rx}" fill="${fg}" />`
        );
      } else {
        paths.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize + 0.15).toFixed(2)}" height="${(cellSize + 0.15).toFixed(2)}" fill="${fg}" />`
        );
      }
    }
  }

  // Render the 3 finder eyes cleanly
  const eyeOrigins: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];
  for (const [er, ec] of eyeOrigins) {
    const ox = (ec + marginModules) * cellSize;
    const oy = (er + marginModules) * cellSize;
    const outerSize = 7 * cellSize;
    const innerCut = 5 * cellSize;
    const coreSize = 3 * cellSize;
    const outerRx = eyeStyle === 'rounded' ? cellSize * 1.4 : 0;
    const innerRx = eyeStyle === 'rounded' ? cellSize * 0.9 : 0;
    const coreRx = eyeStyle === 'rounded' ? cellSize * 0.65 : 0;

    paths.push(
      `<rect x="${ox.toFixed(2)}" y="${oy.toFixed(2)}" width="${outerSize.toFixed(2)}" height="${outerSize.toFixed(2)}" rx="${outerRx.toFixed(2)}" fill="${fg}" />`,
      `<rect x="${(ox + cellSize).toFixed(2)}" y="${(oy + cellSize).toFixed(2)}" width="${innerCut.toFixed(2)}" height="${innerCut.toFixed(2)}" rx="${innerRx.toFixed(2)}" fill="${bg}" />`,
      `<rect x="${(ox + 2 * cellSize).toFixed(2)}" y="${(oy + 2 * cellSize).toFixed(2)}" width="${coreSize.toFixed(2)}" height="${coreSize.toFixed(2)}" rx="${coreRx.toFixed(2)}" fill="${fg}" />`
    );
  }

  let logoMarkup = '';
  if (hasLogo) {
    const boxSize = size * 0.22;
    const boxPos = (size - boxSize) / 2;
    const pad = 4;
    logoMarkup += `<rect x="${boxPos.toFixed(2)}" y="${boxPos.toFixed(2)}" width="${boxSize.toFixed(2)}" height="${boxSize.toFixed(2)}" rx="10" fill="${bg}" stroke="${fg}" stroke-opacity="0.15" stroke-width="1.5" />`;
    if (options.logoDataUrl) {
      logoMarkup += `<image href="${options.logoDataUrl}" x="${(boxPos + pad).toFixed(2)}" y="${(boxPos + pad).toFixed(2)}" width="${(boxSize - pad * 2).toFixed(2)}" height="${(boxSize - pad * 2).toFixed(2)}" preserveAspectRatio="xMidYMid slice" />`;
    } else if (options.logoText?.trim()) {
      const label = options.logoText
        .trim()
        .slice(0, 4)
        .toUpperCase()
        .replace(/[<>&"]/g, '');
      logoMarkup += `<text x="${(size / 2).toFixed(2)}" y="${(size / 2 + 5).toFixed(2)}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${Math.round(boxSize * 0.34)}" fill="${fg}">${label}</text>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR Code">
  <rect width="${size}" height="${size}" fill="${bg}" rx="12" />
  ${paths.join('\n  ')}
  ${logoMarkup}
</svg>`;
}

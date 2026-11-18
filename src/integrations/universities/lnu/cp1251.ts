/**
 * Lightweight pure-TypeScript Windows-1251 (CP1251) encoder & decoder
 * compatible with both browsers and Cloudflare Workers (no Node dependencies).
 */

const CP1251_EXTRA: Record<number, number> = {
  0x0402: 0x80, // Ђ
  0x0403: 0x81, // Ѓ
  0x201a: 0x82, // ‚
  0x0453: 0x83, // ѓ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x20ac: 0x88, // €
  0x2030: 0x89, // ‰
  0x0409: 0x8a, // Љ
  0x2039: 0x8b, // ‹
  0x040a: 0x8c, // Њ
  0x040c: 0x8d, // Ќ
  0x040b: 0x8e, // Ћ
  0x040f: 0x8f, // Џ
  0x0452: 0x90, // ђ
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2122: 0x99, // ™
  0x0459: 0x9a, // љ
  0x203a: 0x9b, // ›
  0x045a: 0x9c, // њ
  0x045c: 0x9d, // ќ
  0x045b: 0x9e, // ћ
  0x045f: 0x9f, // џ
  0x00a0: 0xa0, // NBSP
  0x040e: 0xa1, // Ў
  0x045e: 0xa2, // ў
  0x0408: 0xa3, // Ј
  0x00a4: 0xa4, // ¤
  0x0490: 0xa5, // Ґ
  0x00a6: 0xa6, // ¦
  0x00a7: 0xa7, // §
  0x0401: 0xa8, // Ё
  0x00a9: 0xa9, // ©
  0x0404: 0xaa, // Є
  0x00ab: 0xab, // «
  0x00ac: 0xac, // ¬
  0x00ad: 0xad, // SHY
  0x00ae: 0xae, // ®
  0x0407: 0xaf, // Ї
  0x00b0: 0xb0, // °
  0x00b1: 0xb1, // ±
  0x0406: 0xb2, // І
  0x0456: 0xb3, // і
  0x0491: 0xb4, // ґ
  0x00b5: 0xb5, // µ
  0x00b6: 0xb6, // ¶
  0x00b7: 0xb7, // ·
  0x0451: 0xb8, // ё
  0x2116: 0xb9, // №
  0x0454: 0xba, // є
  0x00bb: 0xbb, // »
  0x0458: 0xbc, // ј
  0x0405: 0xbd, // Ѕ
  0x0455: 0xbe, // ѕ
  0x0457: 0xbf, // ї
};

function unicodeToCp1251Byte(codePoint: number): number {
  if (codePoint <= 0x7f) return codePoint;
  if (codePoint >= 0x0410 && codePoint <= 0x044f) {
    return codePoint - 0x0410 + 0xc0;
  }
  return CP1251_EXTRA[codePoint] ?? 0x3f; // '?'
}

/**
 * Percent-encodes a string into `application/x-www-form-urlencoded` using Windows-1251 bytes.
 */
export function encodeCp1251Component(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const byte = unicodeToCp1251Byte(value.charCodeAt(i));
    const isUnreserved =
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e ||
      byte === 0x7e;

    if (isUnreserved) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x20) {
      out += '+';
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

export function encodeCp1251Form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeCp1251Component(k)}=${encodeCp1251Component(v)}`)
    .join('&');
}

export function decodeCp1251(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('windows-1251').decode(view);
}

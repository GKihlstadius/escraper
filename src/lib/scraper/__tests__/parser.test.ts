import { describe, it, expect } from 'vitest';
import {
  parsePrice,
  detectBrand,
  detectCategory,
  detectColor,
  normalizeName,
  extractModelKey,
  tokenOverlapScore,
  areTypesCompatible,
  isBundle,
  parseProductPage,
} from '../parser';

// ── parsePrice ──────────────────────────────────────────────────────────────

describe('parsePrice', () => {
  it('parses "12 345,00 kr" → 12345.00', () => {
    expect(parsePrice('12 345,00 kr')).toBe(12345.00);
  });

  it('parses "12345" → 12345', () => {
    expect(parsePrice('12345')).toBe(12345);
  });

  it('parses "1 299:-" → 1299', () => {
    expect(parsePrice('1 299:-')).toBe(1299);
  });

  it('parses "4 995 SEK" → 4995', () => {
    expect(parsePrice('4 995 SEK')).toBe(4995);
  });

  it('parses "3999.00" → 3999.00', () => {
    expect(parsePrice('3999.00')).toBe(3999.00);
  });

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull();
  });

  it('returns null for "0"', () => {
    expect(parsePrice('0')).toBeNull();
  });

  it('parses "12 345,50" → 12345.50', () => {
    expect(parsePrice('12 345,50')).toBe(12345.50);
  });
});

// ── detectBrand ─────────────────────────────────────────────────────────────

describe('detectBrand', () => {
  it('detects Bugaboo', () => {
    expect(detectBrand('Bugaboo Fox 5')).toBe('Bugaboo');
  });

  it('detects Cybex', () => {
    expect(detectBrand('Cybex Sirona T')).toBe('Cybex');
  });

  it('detects Maxi-Cosi with correct capitalization', () => {
    expect(detectBrand('Maxi-Cosi Fame')).toBe('Maxi-cosi');
  });

  it('detects Silver Cross (two-word brand)', () => {
    expect(detectBrand('Silver Cross Wave')).toBe('Silver Cross');
  });

  it('returns "Okänt" for unknown brand', () => {
    expect(detectBrand('Unknown Product')).toBe('Okänt');
  });
});

// ── detectCategory ──────────────────────────────────────────────────────────

describe('detectCategory', () => {
  it('detects duovagn', () => {
    expect(detectCategory('Bugaboo Fox 5 Duovagn')).toBe('duovagn');
  });

  it('detects sittvagn from sulky', () => {
    expect(detectCategory('Cybex Libelle Sulky')).toBe('sittvagn');
  });

  it('detects bilstol type from "Bilbarnstol" via URL', () => {
    const cat = detectCategory('BeSafe iZi Turn', 'https://store.se/bilbarnstol/besafe-izi-turn');
    expect(cat).toBe('bakatvänd_bilstol');
  });

  it('detects joggingvagn', () => {
    expect(detectCategory('Thule Urban Glide Joggingvagn')).toBe('joggingvagn');
  });

  it('detects babyskydd', () => {
    expect(detectCategory('Britax Baby-Safe Babyskydd')).toBe('babyskydd');
  });

  it('detects duovagn from URL path', () => {
    expect(detectCategory('Product', 'https://store.se/barnvagnar/product')).toBe('duovagn');
  });
});

// ── detectColor ─────────────────────────────────────────────────────────────

describe('detectColor', () => {
  it('detects black from "Midnight Black"', () => {
    const color = detectColor('Bugaboo Fox 5 Midnight Black');
    expect(color).not.toBeNull();
    expect(color!.toLowerCase()).toContain('black');
  });

  it('returns null for unknown color "Autumn Gold"', () => {
    expect(detectColor('Cybex Sirona Autumn Gold')).toBeNull();
  });

  it('detects grey from "Grey Melange"', () => {
    const color = detectColor('Stokke Xplory Grey Melange');
    expect(color).not.toBeNull();
    expect(color!.toLowerCase()).toContain('grey');
  });
});

// ── normalizeName ───────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases and strips special chars from "Bugaboo Fox 5 Complete"', () => {
    const result = normalizeName('Bugaboo Fox 5 Complete');
    expect(result).toBe('bugaboo fox 5 complete');
  });

  it('strips trademark symbol from "Maxi-Cosi\u2122 Fame"', () => {
    const result = normalizeName('Maxi-Cosi\u2122 Fame');
    expect(result).toBe('maxi-cosi fame');
  });
});

// ── extractModelKey ─────────────────────────────────────────────────────────

describe('extractModelKey', () => {
  it('extracts key containing "bugaboo" and "fox" from full product name', () => {
    const key = extractModelKey('Bugaboo Fox 5 Duovagn Complete Midnight Black');
    expect(key).toContain('bugaboo');
    expect(key).toContain('fox');
  });

  it('extracts key containing "maxi-cosi" and "fame"', () => {
    const key = extractModelKey('Maxi-Cosi Fame Sittvagn Twillic Truffle');
    expect(key).toContain('maxi-cosi');
    expect(key).toContain('fame');
  });
});

// ── tokenOverlapScore ───────────────────────────────────────────────────────

describe('tokenOverlapScore', () => {
  it('returns 1.0 for identical names', () => {
    expect(tokenOverlapScore('Bugaboo Fox 5', 'Bugaboo Fox 5')).toBe(1.0);
  });

  it('returns 0.0 for completely different names', () => {
    expect(tokenOverlapScore('Bugaboo Fox', 'Cybex Sirona')).toBe(0.0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const score = tokenOverlapScore('Bugaboo Fox 5 Black', 'Bugaboo Fox 5 Grey');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

// ── areTypesCompatible ──────────────────────────────────────────────────────

describe('areTypesCompatible', () => {
  it('returns true for same product type', () => {
    expect(areTypesCompatible('Bugaboo Fox 5 Duovagn', 'Bugaboo Fox 5 Duovagn Black')).toBe(true);
  });

  it('returns false for product vs accessory (liggdel)', () => {
    expect(areTypesCompatible('Bugaboo Fox 5 Duovagn', 'Bugaboo Fox 5 Liggdel')).toBe(false);
  });

  it('returns false for bundle vs non-bundle', () => {
    expect(areTypesCompatible('Vagnspaket Cybex', 'Cybex Sittvagn')).toBe(false);
  });
});

// ── isBundle ────────────────────────────────────────────────────────────────

describe('isBundle', () => {
  it('detects barnvagnspaket as bundle', () => {
    expect(isBundle('Cybex Eos Lux Barnvagnspaket')).toBe(true);
  });

  it('does not detect plain sittvagn as bundle', () => {
    expect(isBundle('Cybex Eos Lux Sittvagn')).toBe(false);
  });
});

// ── parseProductPage ────────────────────────────────────────────────────────

describe('parseProductPage', () => {
  it('parses product from JSON-LD structured data', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Bugaboo Fox 5 Duovagn Midnight Black",
            "brand": { "@type": "Brand", "name": "Bugaboo" },
            "gtin13": "8717447448013",
            "offers": {
              "@type": "Offer",
              "price": "15995",
              "priceCurrency": "SEK",
              "availability": "https://schema.org/InStock"
            }
          }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = parseProductPage(html, 'https://store.se/barnvagnar/bugaboo-fox-5');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Bugaboo Fox 5 Duovagn Midnight Black');
    expect(result!.brand).toBe('Bugaboo');
    expect(result!.price).toBe(15995);
    expect(result!.currency).toBe('SEK');
    expect(result!.inStock).toBe(true);
    expect(result!.ean).toBe('8717447448013');
    expect(result!.category).toBe('duovagn');
    expect(result!.color!.toLowerCase()).toContain('black');
  });

  it('returns null for HTML with no product data', () => {
    const html = '<html><body><p>No product here</p></body></html>';
    expect(parseProductPage(html, 'https://store.se/page')).toBeNull();
  });
});

import { glyphRows, hasGlyph } from './font.ts';

export const FRAME_WIDTH = 680;
export const FRAME_HEIGHT = 230;
const SCALE = 3;
const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;

export const PALETTE: readonly (readonly [number, number, number])[] = [
  [90, 24, 24],
  [18, 72, 40],
  [36, 40, 48],
  [244, 244, 240],
  [230, 80, 64],
  [48, 180, 96],
  [140, 148, 160],
];

const BACKGROUND: Record<'needs_line_by_line' | 'skim_ok' | 'skip', number> = {
  needs_line_by_line: 0,
  skim_ok: 1,
  skip: 2,
};

const ACCENT: Record<'needs_line_by_line' | 'skim_ok' | 'skip', number> = {
  needs_line_by_line: 4,
  skim_ok: 5,
  skip: 6,
};

export interface DemoFrame {
  readonly title: string;
  readonly verdict: string;
  readonly lines: readonly string[];
  readonly outcome: 'needs_line_by_line' | 'skim_ok' | 'skip';
}

function setPixel(indexed: Uint8Array, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= FRAME_WIDTH || y >= FRAME_HEIGHT) {
    return;
  }
  indexed[y * FRAME_WIDTH + x] = color;
}

function fillRect(indexed: Uint8Array, x: number, y: number, width: number, height: number, color: number): void {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      setPixel(indexed, x + column, y + row, color);
    }
  }
}

export function missingGlyphs(text: string): string {
  const missing = new Set<string>();
  for (const character of text.toUpperCase()) {
    if (!hasGlyph(character)) {
      missing.add(character);
    }
  }
  return [...missing].join('');
}

function drawText(indexed: Uint8Array, text: string, x: number, y: number, color: number): void {
  let cursor = x;
  for (const character of text.toUpperCase()) {
    const rows = glyphRows(character);
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      const bits = rows[row] ?? '...';
      for (let column = 0; column < GLYPH_WIDTH; column += 1) {
        if (bits[column] !== '#') {
          continue;
        }
        fillRect(indexed, cursor + column * SCALE, y + row * SCALE, SCALE, SCALE, color);
      }
    }
    cursor += GLYPH_WIDTH * SCALE + 2;
  }
}

export function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length > maxChars && current !== '') {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current !== '') {
    lines.push(current);
  }
  return lines;
}

export function drawFrame(frame: DemoFrame): Uint8Array {
  const indexed = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT);
  indexed.fill(BACKGROUND[frame.outcome]);
  fillRect(indexed, 0, 0, 14, FRAME_HEIGHT, ACCENT[frame.outcome]);
  const textColor = 3;
  const wrapped = [frame.title, frame.verdict, ...frame.lines.flatMap((line) => wrapLine(line, 52))].slice(0, 8);
  wrapped.forEach((line, index) => {
    drawText(indexed, line, 28, 16 + index * 24, textColor);
  });
  return indexed;
}

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GIFEncoder } from 'gifenc/dist/gifenc.esm.js';
import { classify, decisionName } from './engine.ts';
import { parseFixtureInput } from './parse.ts';
import { drawFrame, FRAME_HEIGHT, FRAME_WIDTH, missingGlyphs, PALETTE, type DemoFrame } from './raster.ts';

export interface LoadedFixture {
  readonly name: string;
  readonly title: string;
  readonly snapshotText: string;
}

function titleFromName(name: string): string {
  return name
    .replace(/\.json$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function loadFixtureDirectory(directory: string): { name: string; raw: unknown }[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      name,
      raw: JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown,
    }));
}

export function framesFromFixtures(directory: string): DemoFrame[] {
  return loadFixtureDirectory(directory).map(({ name, raw }) => {
    const { snapshot, policy } = parseFixtureInput(raw);
    const decision = classify(snapshot, policy);
    const verdict = decisionName(decision);
    const lines =
      decision.outcome !== 'skip' && decision.reasons.length === 0
        ? ['No risk signals fired.']
        : decision.reasons;
    return {
      title: titleFromName(name),
      verdict,
      lines,
      outcome: decision.outcome,
    };
  });
}

export function renderSvg(frames: readonly DemoFrame[]): string {
  const width = 720;
  const rowHeight = 150;
  const height = frames.length * rowHeight;
  const rows = frames
    .map((frame, index) => {
      const fill = frame.outcome === 'needs_line_by_line' ? '#5a1818' : frame.outcome === 'skim_ok' ? '#124828' : '#242830';
      const accent = frame.outcome === 'needs_line_by_line' ? '#e65040' : frame.outcome === 'skim_ok' ? '#30b460' : '#8c94a0';
      const y = index * rowHeight;
      const reasonLines = frame.lines
        .slice(0, 3)
        .map((line, lineIndex) => `<text x="36" y="${y + 78 + lineIndex * 22}" fill="#f4f4f0" font-size="16" font-family="ui-sans-serif, sans-serif">${escapeXml(line)}</text>`)
        .join('');
      return `<g>
        <rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="${fill}"/>
        <rect x="0" y="${y}" width="12" height="${rowHeight}" fill="${accent}"/>
        <text x="36" y="${y + 36}" fill="#f4f4f0" font-size="22" font-family="ui-sans-serif, sans-serif">${escapeXml(frame.title)}</text>
        <text x="36" y="${y + 62}" fill="${accent}" font-size="16" font-family="ui-sans-serif, sans-serif">${escapeXml(frame.verdict)}</text>
        ${reasonLines}
      </g>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${rows}
</svg>
`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderGif(frames: readonly DemoFrame[]): Uint8Array {
  const missing = missingGlyphs(frames.map((frame) => `${frame.title} ${frame.verdict} ${frame.lines.join(' ')}`).join('\n'));
  if (missing !== '') {
    throw new Error(`Demo font is missing glyphs: ${missing}`);
  }
  const gif = GIFEncoder();
  const palette = PALETTE.map((color) => [...color]);
  frames.forEach((frame, index) => {
    gif.writeFrame(drawFrame(frame), FRAME_WIDTH, FRAME_HEIGHT, {
      palette,
      delay: 1400,
      repeat: index === 0 ? 0 : undefined,
      dispose: 2,
    });
  });
  gif.finish();
  return gif.bytes();
}

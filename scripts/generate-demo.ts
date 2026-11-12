import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { framesFromFixtures, renderGif, renderSvg } from '../src/demoBuild.ts';

const root = dirname(new URL(import.meta.url).pathname);
const fixtureDirectory = join(root, '..', 'test', 'fixtures');
const docsDirectory = join(root, '..', 'docs');
const frames = framesFromFixtures(fixtureDirectory);
mkdirSync(docsDirectory, { recursive: true });
writeFileSync(join(docsDirectory, 'demo.svg'), renderSvg(frames));
writeFileSync(join(docsDirectory, 'demo.gif'), renderGif(frames));
console.log(`Wrote ${frames.length} frames to docs/demo.gif and docs/demo.svg`);

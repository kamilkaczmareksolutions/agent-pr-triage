import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { framesFromFixtures, renderGif, renderSvg } from '../src/demoBuild.ts';

const root = join(import.meta.dirname, '..');

test('the committed demo is the gif and svg the fixture script writes', () => {
  const frames = framesFromFixtures(join(root, 'test', 'fixtures'));
  assert.equal(frames.length, 20);
  const gif = Buffer.from(renderGif(frames));
  const committedGif = readFileSync(join(root, 'docs', 'demo.gif'));
  assert.equal(gif.subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.ok(gif.includes(Buffer.from([0x21, 0xf9])));
  assert.deepEqual(gif, committedGif);
  assert.equal(renderSvg(frames), readFileSync(join(root, 'docs', 'demo.svg'), 'utf8'));
  for (const frame of frames) {
    assert.ok(readFileSync(join(root, 'docs', 'demo.svg'), 'utf8').includes(frame.title));
  }
});

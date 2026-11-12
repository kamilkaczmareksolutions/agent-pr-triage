import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { COMMENT_MARKER, DEFAULT_POLICY, type PullRequestSnapshot, type SignalId } from '../src/types.ts';
import { classify } from '../src/engine.ts';
import { parseFixtureInput } from '../src/parse.ts';

const fixtureDirectory = join(import.meta.dirname, 'fixtures');

interface Expectation {
  readonly outcome: 'skip' | 'needs_line_by_line' | 'skim_ok';
  readonly signals: readonly SignalId[];
  readonly commentIncludes: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExpectation(raw: unknown, name: string): Expectation {
  if (!isRecord(raw) || !isRecord(raw.expect)) {
    throw new Error(`${name} is missing expect.`);
  }
  const outcome = raw.expect.outcome;
  const signals = raw.expect.signals;
  const commentIncludes = raw.expect.commentIncludes;
  if (outcome !== 'skip' && outcome !== 'needs_line_by_line' && outcome !== 'skim_ok') {
    throw new Error(`${name} has a bad outcome.`);
  }
  if (!Array.isArray(signals) || !signals.every((signal) => typeof signal === 'string')) {
    throw new Error(`${name} has bad signals.`);
  }
  if (!Array.isArray(commentIncludes) || !commentIncludes.every((part) => typeof part === 'string')) {
    throw new Error(`${name} has bad commentIncludes.`);
  }
  return {
    outcome,
    signals: signals as SignalId[],
    commentIncludes: commentIncludes as string[],
  };
}

function file(
  path: string,
  additions: number,
  deletions = 0,
  patch = '',
  previousPath = '',
): PullRequestSnapshot['files'][number] {
  return { path, previousPath, additions, deletions, patch };
}

function cursorSnapshot(files: PullRequestSnapshot['files']): PullRequestSnapshot {
  return {
    authorLogin: 'cursoragent',
    body: 'Made with Cursor',
    commits: [
      {
        message: 'Update\n\nMade-with: Cursor',
        authorName: 'Cursor',
        authorEmail: 'cursoragent@cursor.com',
        authorLogin: 'cursoragent',
        committerName: 'Cursor',
        committerEmail: 'cursoragent@cursor.com',
        committerLogin: 'cursoragent',
      },
    ],
    files,
  };
}

test('every fixture matches the decision a reviewer would read', () => {
  const names = readdirSync(fixtureDirectory).filter((name) => name.endsWith('.json')).sort();
  assert.ok(names.length >= 12);
  for (const name of names) {
    const raw: unknown = JSON.parse(readFileSync(join(fixtureDirectory, name), 'utf8'));
    const { snapshot, policy } = parseFixtureInput(raw);
    const expected = parseExpectation(raw, name);
    const decision = classify(snapshot, policy);
    assert.equal(decision.outcome, expected.outcome, name);
    assert.deepEqual([...decision.signals], [...expected.signals], name);
    const readable = decision.comment ?? decision.reasons.join('\n');
    for (const part of expected.commentIncludes) {
      assert.ok(readable.includes(part), `${name} missing ${part}`);
    }
    if (expected.outcome === 'skip') {
      assert.equal(decision.comment, null, name);
      assert.equal(decision.label, null, name);
      continue;
    }
    assert.equal(
      decision.label,
      expected.outcome === 'needs_line_by_line' ? policy.labelNeedsReview : policy.labelSkimOk,
      name,
    );
    assert.ok(decision.comment?.includes(COMMENT_MARKER), name);
  }
});

test('size alone stays under the stack threshold, and size plus missing tests crosses it', () => {
  const under = classify(
    cursorSnapshot([
      file('src/format.ts', 390, 8),
      file('src/format.test.ts', 1),
    ]),
  );
  const over = classify(
    cursorSnapshot([
      file('src/format.ts', 390, 9),
      file('src/format.test.ts', 1),
    ]),
  );
  const stacked = classify(cursorSnapshot([file('src/format.ts', 400)]));
  assert.equal(under.outcome, 'skim_ok');
  assert.deepEqual([...under.signals], []);
  assert.equal(over.outcome, 'skim_ok');
  assert.deepEqual([...over.signals], ['large_diff']);
  assert.equal(stacked.outcome, 'needs_line_by_line');
  assert.deepEqual([...stacked.signals], ['large_diff', 'missing_tests']);
  assert.equal(DEFAULT_POLICY.stackReviewThreshold, 2);
});

test('a workflow outside .github/workflows does not count as CI', () => {
  const decision = classify(
    cursorSnapshot([file('.github/dependabot.yml', 10), file('src/format.test.ts', 1)]),
  );
  assert.equal(decision.outcome, 'skim_ok');
  assert.deepEqual([...decision.signals], []);
});

test('yaml and yml workflow files both force review', () => {
  for (const path of ['.github/workflows/ci.yaml', '.github/workflows/release.yml']) {
    const decision = classify(cursorSnapshot([file(path, 4)]));
    assert.equal(decision.outcome, 'needs_line_by_line', path);
    assert.deepEqual([...decision.signals], ['ci'], path);
  }
});

test('oauth2 and a renamed auth file still force review', () => {
  const oauth = classify(cursorSnapshot([file('src/oauth2.ts', 4), file('src/oauth2.test.ts', 2)]));
  assert.deepEqual([...oauth.signals], ['auth']);
  const renamed = classify(
    cursorSnapshot([file('src/plain.ts', 4, 1, '', 'src/auth/login.ts'), file('src/plain.test.ts', 2)]),
  );
  assert.deepEqual([...renamed.signals], ['auth']);
});

test('a Dependabot pull request stays out even when the body mentions Claude Code', () => {
  const decision = classify({
    authorLogin: 'dependabot[bot]',
    body: 'Generated with Claude Code',
    commits: [],
    files: [file('package.json', 2, 1)],
  });
  assert.equal(decision.outcome, 'skip');
  assert.equal(decision.comment, null);
});

test('a private key in a patch forces review even when the path looks harmless', () => {
  const decision = classify(
    cursorSnapshot([
      file('notes.txt', 2, 0, '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----'),
    ]),
  );
  assert.equal(decision.outcome, 'needs_line_by_line');
  assert.ok(decision.signals.includes('secrets'));
});

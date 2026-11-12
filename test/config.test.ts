import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePolicy, policyFromInputs } from '../src/config.ts';
import { httpStatus } from '../src/github.ts';
import { toSnapshot } from '../src/parse.ts';

test('blank action inputs use the documented defaults', () => {
  const policy = policyFromInputs(() => '');
  assert.equal(policy.labelNeedsReview, 'needs line-by-line review');
  assert.equal(policy.labelSkimOk, 'skim ok');
  assert.equal(policy.linesChangedThreshold, 400);
  assert.equal(policy.stackReviewThreshold, 2);
  assert.equal(policy.skipHuman, true);
  assert.equal(policy.includeDependencyBots, false);
});

test('action inputs reject bad numbers, bad booleans, and identical labels', () => {
  assert.throws(
    () => parsePolicy({
      labelNeedsReview: 'same',
      labelSkimOk: 'same',
      linesChangedThreshold: '400',
      stackReviewThreshold: '2',
      skipHuman: 'true',
      includeDependencyBots: 'false',
    }),
    /different/,
  );
  assert.throws(
    () => parsePolicy({
      labelNeedsReview: '',
      labelSkimOk: '',
      linesChangedThreshold: '0',
      stackReviewThreshold: '2',
      skipHuman: 'true',
      includeDependencyBots: 'false',
    }),
    /lines-changed-threshold/,
  );
  assert.throws(
    () => parsePolicy({
      labelNeedsReview: '',
      labelSkimOk: '',
      linesChangedThreshold: '',
      stackReviewThreshold: '',
      skipHuman: 'yes',
      includeDependencyBots: '',
    }),
    /skip-human/,
  );
});

test('GitHub file payloads become a snapshot with empty strings for missing text', () => {
  const snapshot = toSnapshot({
    authorLogin: 'octocat',
    body: null,
    files: [{ filename: 'src/app.ts', additions: 1, deletions: 0 }],
    commits: [{ message: 'hi', authorName: null, authorEmail: null }],
  });
  assert.equal(snapshot.body, '');
  assert.equal(snapshot.files[0]?.path, 'src/app.ts');
  assert.equal(snapshot.files[0]?.patch, '');
  assert.equal(snapshot.commits[0]?.authorName, '');
});

test('action.yml defaults match the policy a blank workflow gets', () => {
  const action = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
  assert.match(action, /label-needs-review:[\s\S]*default: needs line-by-line review/);
  assert.match(action, /label-skim-ok:[\s\S]*default: skim ok/);
  assert.match(action, /lines-changed-threshold:[\s\S]*default: "400"/);
  assert.match(action, /stack-review-threshold:[\s\S]*default: "2"/);
  assert.match(action, /skip-human:[\s\S]*default: "true"/);
  assert.match(action, /include-dependency-bots:[\s\S]*default: "false"/);
});

test('http status is read only from an object that has a numeric status', () => {
  assert.equal(httpStatus({ status: 422 }), 422);
  assert.equal(httpStatus(new Error('no')), undefined);
  assert.equal(httpStatus({ status: '422' }), undefined);
});

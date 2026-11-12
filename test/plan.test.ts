import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify } from '../src/engine.ts';
import { planIsEmpty, planUpdates } from '../src/plan.ts';
import { COMMENT_MARKER, DEFAULT_POLICY, type CommentRef, type PullRequestSnapshot, type RepoState, type UpdatePlan } from '../src/types.ts';

const snapshot: PullRequestSnapshot = {
  authorLogin: 'cursoragent',
  body: '',
  commits: [
    {
      message: 'Co-authored-by: Cursor <cursoragent@cursor.com>',
      authorName: 'Cursor',
      authorEmail: 'cursoragent@cursor.com',
      authorLogin: 'cursoragent',
      committerName: 'Cursor',
      committerEmail: 'cursoragent@cursor.com',
      committerLogin: 'cursoragent',
    },
  ],
  files: [{ path: 'src/auth/login.ts', previousPath: '', additions: 10, deletions: 0, patch: '' }],
};

function apply(state: RepoState, plan: UpdatePlan): RepoState {
  const removed = new Set(plan.removeLabels);
  const deleted = new Set(plan.deleteCommentIds);
  const labels = [...state.labels.filter((label) => !removed.has(label)), ...plan.addLabels];
  let comments: CommentRef[] = state.comments.filter((comment) => !deleted.has(comment.id));
  const update = plan.updateComment;
  if (update !== null) {
    comments = comments.map((comment) => (comment.id === update.id ? { id: comment.id, body: update.body } : comment));
  }
  if (plan.createComment !== null) {
    comments = [...comments, { id: 50, body: plan.createComment }];
  }
  return { labels, comments };
}

test('applying the plan twice leaves nothing to write', () => {
  const decision = classify(snapshot);
  assert.equal(decision.outcome, 'needs_line_by_line');
  const first = planUpdates({ labels: [], comments: [] }, decision, DEFAULT_POLICY);
  const afterFirst = apply({ labels: [], comments: [] }, first);
  const second = planUpdates(afterFirst, decision, DEFAULT_POLICY);
  assert.equal(planIsEmpty(second), true);
  assert.deepEqual([...afterFirst.labels], ['needs line-by-line review']);
  assert.equal(afterFirst.comments.length, 1);
  assert.ok(afterFirst.comments[0]?.body.includes(COMMENT_MARKER));
});

test('a changed decision swaps the label and rewrites the one comment', () => {
  const review = classify(snapshot);
  const skim = classify({
    ...snapshot,
    files: [{ path: 'README.md', previousPath: '', additions: 1, deletions: 0, patch: '' }],
  });
  assert.equal(skim.outcome, 'skim_ok');
  const reviewed = apply({ labels: [], comments: [] }, planUpdates({ labels: [], comments: [] }, review, DEFAULT_POLICY));
  const plan = planUpdates(reviewed, skim, DEFAULT_POLICY);
  assert.deepEqual([...plan.addLabels], ['skim ok']);
  assert.deepEqual([...plan.removeLabels], ['needs line-by-line review']);
  assert.equal(plan.createComment, null);
  assert.equal(plan.updateComment?.id, reviewed.comments[0]?.id);
  const after = apply(reviewed, plan);
  assert.deepEqual([...after.labels], ['skim ok']);
  assert.equal(planIsEmpty(planUpdates(after, skim, DEFAULT_POLICY)), true);
});

test('a human pull request with no prior mark is a no-op, and a stale mark is cleared', () => {
  const human = classify({
    authorLogin: 'octocat',
    body: 'typo',
    commits: [],
    files: [{ path: 'README.md', previousPath: '', additions: 1, deletions: 0, patch: '' }],
  });
  assert.equal(human.outcome, 'skip');
  const empty = planUpdates({ labels: [], comments: [] }, human, DEFAULT_POLICY);
  assert.equal(planIsEmpty(empty), true);
  const stale = planUpdates(
    {
      labels: ['skim ok', 'documentation'],
      comments: [
        { id: 7, body: `old\n${COMMENT_MARKER}` },
        { id: 8, body: 'a human wrote this' },
      ],
    },
    human,
    DEFAULT_POLICY,
  );
  assert.deepEqual([...stale.removeLabels], ['skim ok']);
  assert.deepEqual([...stale.deleteCommentIds], [7]);
  const after = apply(
    {
      labels: ['skim ok', 'documentation'],
      comments: [
        { id: 7, body: `old\n${COMMENT_MARKER}` },
        { id: 8, body: 'a human wrote this' },
      ],
    },
    stale,
  );
  assert.deepEqual([...after.labels], ['documentation']);
  assert.deepEqual(after.comments.map((comment) => comment.id), [8]);
});

test('duplicate marker comments collapse to one', () => {
  const decision = classify(snapshot);
  assert.ok(decision.comment !== null);
  const state: RepoState = {
    labels: ['needs line-by-line review'],
    comments: [
      { id: 1, body: decision.comment },
      { id: 2, body: `duplicate\n${COMMENT_MARKER}` },
    ],
  };
  const plan = planUpdates(state, decision, DEFAULT_POLICY);
  assert.deepEqual([...plan.deleteCommentIds], [2]);
  assert.equal(plan.updateComment, null);
  assert.equal(plan.createComment, null);
});

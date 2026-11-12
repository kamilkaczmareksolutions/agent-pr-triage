import { DEFAULT_POLICY, type Policy, type PullRequestSnapshot } from './types.ts';

export interface RawCommit {
  readonly message?: unknown;
  readonly authorName?: unknown;
  readonly authorEmail?: unknown;
  readonly authorLogin?: unknown;
  readonly committerName?: unknown;
  readonly committerEmail?: unknown;
  readonly committerLogin?: unknown;
}

export interface RawFile {
  readonly filename?: unknown;
  readonly path?: unknown;
  readonly previousFilename?: unknown;
  readonly previousPath?: unknown;
  readonly additions?: unknown;
  readonly deletions?: unknown;
  readonly patch?: unknown;
}

export interface RawPullRequest {
  readonly authorLogin: unknown;
  readonly body: unknown;
  readonly files: readonly RawFile[];
  readonly commits: readonly RawCommit[];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function toSnapshot(raw: RawPullRequest): PullRequestSnapshot {
  return {
    authorLogin: asString(raw.authorLogin),
    body: asString(raw.body),
    commits: raw.commits.map((commit) => ({
      message: asString(commit.message),
      authorName: asString(commit.authorName),
      authorEmail: asString(commit.authorEmail),
      authorLogin: asString(commit.authorLogin),
      committerName: asString(commit.committerName),
      committerEmail: asString(commit.committerEmail),
      committerLogin: asString(commit.committerLogin),
    })),
    files: raw.files.map((file, index) => {
      const path = asString(file.path, asString(file.filename));
      if (path === '') {
        throw new Error(`File ${index} is missing a path.`);
      }
      return {
        path,
        previousPath: asString(file.previousPath, asString(file.previousFilename)),
        additions: asCount(file.additions, `File ${path} additions`),
        deletions: asCount(file.deletions, `File ${path} deletions`),
        patch: asString(file.patch),
      };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalBoolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function optionalPositiveInt(value: unknown, label: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be an integer of at least 1.`);
  }
  return value;
}

function optionalLabel(value: unknown, label: string, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

export function policyFromRecord(value: unknown): Policy {
  if (value === undefined) {
    return DEFAULT_POLICY;
  }
  if (!isRecord(value)) {
    throw new Error('policy must be an object.');
  }
  const policy: Policy = {
    labelNeedsReview: optionalLabel(value.labelNeedsReview, 'labelNeedsReview', DEFAULT_POLICY.labelNeedsReview),
    labelSkimOk: optionalLabel(value.labelSkimOk, 'labelSkimOk', DEFAULT_POLICY.labelSkimOk),
    linesChangedThreshold: optionalPositiveInt(
      value.linesChangedThreshold,
      'linesChangedThreshold',
      DEFAULT_POLICY.linesChangedThreshold,
    ),
    stackReviewThreshold: optionalPositiveInt(
      value.stackReviewThreshold,
      'stackReviewThreshold',
      DEFAULT_POLICY.stackReviewThreshold,
    ),
    skipHuman: optionalBoolean(value.skipHuman, 'skipHuman', DEFAULT_POLICY.skipHuman),
    includeDependencyBots: optionalBoolean(
      value.includeDependencyBots,
      'includeDependencyBots',
      DEFAULT_POLICY.includeDependencyBots,
    ),
  };
  if (policy.labelNeedsReview === policy.labelSkimOk) {
    throw new Error('The two label names must be different.');
  }
  return policy;
}

export function parseFixtureInput(raw: unknown): { snapshot: PullRequestSnapshot; policy: Policy } {
  if (!isRecord(raw) || !isRecord(raw.snapshot)) {
    throw new Error('Fixture must be an object with a snapshot object.');
  }
  const snapshot = raw.snapshot;
  const files = snapshot.files;
  const commits = snapshot.commits;
  if (!Array.isArray(files) || !Array.isArray(commits)) {
    throw new Error('snapshot.files and snapshot.commits must be arrays.');
  }
  return {
    snapshot: toSnapshot({
      authorLogin: snapshot.authorLogin,
      body: snapshot.body,
      files: files.map((file) => {
        if (!isRecord(file)) {
          throw new Error('Each file must be an object.');
        }
        return file;
      }),
      commits: commits.map((commit) => {
        if (!isRecord(commit)) {
          throw new Error('Each commit must be an object.');
        }
        return commit;
      }),
    }),
    policy: policyFromRecord(raw.policy),
  };
}

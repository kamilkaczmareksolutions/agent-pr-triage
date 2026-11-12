export const SIGNAL_IDS = [
  'auth',
  'secrets',
  'ci',
  'dependencies',
  'large_diff',
  'missing_tests',
] as const;

export type SignalId = (typeof SIGNAL_IDS)[number];

export type Outcome = 'skip' | 'needs_line_by_line' | 'skim_ok';

export interface CommitSnapshot {
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorLogin: string;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly committerLogin: string;
  readonly message: string;
}

export interface ChangedFile {
  readonly path: string;
  readonly previousPath: string;
  readonly additions: number;
  readonly deletions: number;
  readonly patch: string;
}

export interface PullRequestSnapshot {
  readonly authorLogin: string;
  readonly body: string;
  readonly commits: readonly CommitSnapshot[];
  readonly files: readonly ChangedFile[];
}

export interface Policy {
  readonly labelNeedsReview: string;
  readonly labelSkimOk: string;
  readonly linesChangedThreshold: number;
  readonly stackReviewThreshold: number;
  readonly skipHuman: boolean;
  readonly includeDependencyBots: boolean;
}

export const DEFAULT_POLICY: Policy = {
  labelNeedsReview: 'needs line-by-line review',
  labelSkimOk: 'skim ok',
  linesChangedThreshold: 400,
  stackReviewThreshold: 2,
  skipHuman: true,
  includeDependencyBots: false,
};

export const COMMENT_MARKER = '<!-- agent-pr-triage -->';

export type Presence =
  | { readonly kind: 'human' }
  | { readonly kind: 'dependency_bot'; readonly login: string }
  | { readonly kind: 'coding_agent'; readonly names: readonly string[] };

export type Decision =
  | {
      readonly outcome: 'skip';
      readonly reasons: readonly string[];
      readonly signals: readonly SignalId[];
      readonly label: null;
      readonly comment: null;
    }
  | {
      readonly outcome: 'needs_line_by_line' | 'skim_ok';
      readonly reasons: readonly string[];
      readonly signals: readonly SignalId[];
      readonly label: string;
      readonly comment: string;
    };

export interface CommentRef {
  readonly id: number;
  readonly body: string;
}

export interface RepoState {
  readonly labels: readonly string[];
  readonly comments: readonly CommentRef[];
}

export interface UpdatePlan {
  readonly addLabels: readonly string[];
  readonly removeLabels: readonly string[];
  readonly createComment: string | null;
  readonly updateComment: { readonly id: number; readonly body: string } | null;
  readonly deleteCommentIds: readonly number[];
}

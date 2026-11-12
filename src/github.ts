import * as github from '@actions/github';
import { planUpdates } from './plan.ts';
import { toSnapshot, type RawPullRequest } from './parse.ts';
import {
  type Decision,
  type Policy,
  type PullRequestSnapshot,
  type RepoState,
} from './types.ts';

type Octokit = ReturnType<typeof github.getOctokit>;

const LABEL_COLORS: Readonly<Record<string, string>> = {
  'needs line-by-line review': 'B60205',
  'skim ok': '0E8A16',
};

export function httpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

export interface IssueClient {
  createLabel(name: string, color: string): Promise<void>;
  addLabels(names: readonly string[]): Promise<void>;
  removeLabel(name: string): Promise<void>;
  createComment(body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
  deleteComment(id: number): Promise<void>;
}

export async function applyDecision(
  client: IssueClient,
  state: RepoState,
  decision: Decision,
  policy: Policy,
): Promise<void> {
  const plan = planUpdates(state, decision, policy);
  for (const name of plan.addLabels) {
    const color = LABEL_COLORS[name] ?? 'EDEDED';
    try {
      await client.createLabel(name, color);
    } catch (error) {
      if (httpStatus(error) !== 422) {
        throw error;
      }
    }
  }
  if (plan.addLabels.length > 0) {
    await client.addLabels(plan.addLabels);
  }
  for (const name of plan.removeLabels) {
    try {
      await client.removeLabel(name);
    } catch (error) {
      if (httpStatus(error) !== 404) {
        throw error;
      }
    }
  }
  if (plan.createComment !== null) {
    await client.createComment(plan.createComment);
  }
  if (plan.updateComment !== null) {
    await client.updateComment(plan.updateComment.id, plan.updateComment.body);
  }
  for (const id of plan.deleteCommentIds) {
    await client.deleteComment(id);
  }
}

function labelName(label: string | { name?: string | null }): string {
  return typeof label === 'string' ? label : (label.name ?? '');
}

export async function loadPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ snapshot: PullRequestSnapshot; state: RepoState }> {
  const pr = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });
  const raw: RawPullRequest = {
    authorLogin: pr.data.user?.login ?? '',
    body: pr.data.body,
    files: files.map((file) => ({
      filename: file.filename,
      previousFilename: file.previous_filename,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
    })),
    commits: commits.map((commit) => ({
      message: commit.commit.message,
      authorName: commit.commit.author?.name,
      authorEmail: commit.commit.author?.email,
      authorLogin: commit.author?.login,
      committerName: commit.commit.committer?.name,
      committerEmail: commit.commit.committer?.email,
      committerLogin: commit.committer?.login,
    })),
  };
  return {
    snapshot: toSnapshot(raw),
    state: {
      labels: (pr.data.labels ?? []).map((label) => labelName(label)).filter((name) => name !== ''),
      comments: comments.map((comment) => ({ id: comment.id, body: comment.body ?? '' })),
    },
  };
}

export function issueClient(octokit: Octokit, owner: string, repo: string, pullNumber: number): IssueClient {
  return {
    async createLabel(name, color) {
      await octokit.rest.issues.createLabel({ owner, repo, name, color });
    },
    async addLabels(names) {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels: [...names],
      });
    },
    async removeLabel(name) {
      await octokit.rest.issues.removeLabel({ owner, repo, issue_number: pullNumber, name });
    },
    async createComment(body) {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
    },
    async updateComment(id, body) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: id, body });
    },
    async deleteComment(id) {
      await octokit.rest.issues.deleteComment({ owner, repo, comment_id: id });
    },
  };
}

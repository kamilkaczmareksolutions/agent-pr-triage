import * as core from '@actions/core';
import * as github from '@actions/github';
import { policyFromInputs } from './config.ts';
import { classify, decisionName } from './engine.ts';
import { applyDecision, issueClient, loadPullRequest } from './github.ts';

async function run(): Promise<void> {
  const token = core.getInput('github-token');
  if (token.trim() === '') {
    throw new Error('Input github-token is empty.');
  }
  const pullNumber = github.context.payload.pull_request?.number;
  if (typeof pullNumber !== 'number') {
    throw new Error('This action only runs on pull_request events.');
  }
  const policy = policyFromInputs((name) => core.getInput(name));
  const { owner, repo } = github.context.repo;
  const octokit = github.getOctokit(token);
  const loaded = await loadPullRequest(octokit, owner, repo, pullNumber);
  const decision = classify(loaded.snapshot, policy);
  core.setOutput('decision', decisionName(decision));
  core.setOutput('reasons', decision.reasons.join(' | '));
  await applyDecision(issueClient(octokit, owner, repo, pullNumber), loaded.state, decision, policy);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});

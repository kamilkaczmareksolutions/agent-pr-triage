import { DEFAULT_POLICY, type Policy } from './types.ts';

export interface RawActionInputs {
  readonly labelNeedsReview: string;
  readonly labelSkimOk: string;
  readonly linesChangedThreshold: string;
  readonly stackReviewThreshold: string;
  readonly skipHuman: string;
  readonly includeDependencyBots: string;
}

function requiredLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
}

function positiveInt(value: string, fallback: number, name: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(`Input ${name} must be an integer of at least 1.`);
  }
  return Number(trimmed);
}

function booleanInput(value: string, fallback: boolean, name: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return fallback;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  throw new Error(`Input ${name} must be true or false.`);
}

export function parsePolicy(raw: RawActionInputs): Policy {
  const policy: Policy = {
    labelNeedsReview: requiredLabel(raw.labelNeedsReview, DEFAULT_POLICY.labelNeedsReview),
    labelSkimOk: requiredLabel(raw.labelSkimOk, DEFAULT_POLICY.labelSkimOk),
    linesChangedThreshold: positiveInt(
      raw.linesChangedThreshold,
      DEFAULT_POLICY.linesChangedThreshold,
      'lines-changed-threshold',
    ),
    stackReviewThreshold: positiveInt(
      raw.stackReviewThreshold,
      DEFAULT_POLICY.stackReviewThreshold,
      'stack-review-threshold',
    ),
    skipHuman: booleanInput(raw.skipHuman, DEFAULT_POLICY.skipHuman, 'skip-human'),
    includeDependencyBots: booleanInput(
      raw.includeDependencyBots,
      DEFAULT_POLICY.includeDependencyBots,
      'include-dependency-bots',
    ),
  };
  if (policy.labelNeedsReview === policy.labelSkimOk) {
    throw new Error('Inputs label-needs-review and label-skim-ok must be different.');
  }
  return policy;
}

export function policyFromInputs(read: (name: string) => string): Policy {
  return parsePolicy({
    labelNeedsReview: read('label-needs-review'),
    labelSkimOk: read('label-skim-ok'),
    linesChangedThreshold: read('lines-changed-threshold'),
    stackReviewThreshold: read('stack-review-threshold'),
    skipHuman: read('skip-human'),
    includeDependencyBots: read('include-dependency-bots'),
  });
}

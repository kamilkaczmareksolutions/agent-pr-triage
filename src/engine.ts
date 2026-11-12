import {
  COMMENT_MARKER,
  DEFAULT_POLICY,
  type ChangedFile,
  type Decision,
  type Policy,
  type Presence,
  type PullRequestSnapshot,
  type SignalId,
} from './types.ts';

const DEPENDENCY_BOT_LOGINS = new Set([
  'dependabot[bot]',
  'dependabot',
  'dependabot-preview[bot]',
  'renovate[bot]',
  'renovate',
]);

interface AgentRule {
  readonly name: string;
  readonly logins: readonly string[];
  readonly emails: readonly string[];
  readonly lines: readonly RegExp[];
}

const AGENT_RULES: readonly AgentRule[] = [
  {
    name: 'Cursor',
    logins: ['cursoragent', 'cursor[bot]'],
    emails: ['cursoragent@cursor.com', 'sos@cursor.sh'],
    lines: [/co-authored-by:.*\bcursor\b/, /made-with:\s*cursor/, /made with cursor/],
  },
  {
    name: 'Claude Code',
    logins: [],
    emails: ['noreply@anthropic.com'],
    lines: [/co-authored-by:.*\bclaude\b/, /generated with \[?claude code/],
  },
  {
    name: 'GitHub Copilot',
    logins: ['copilot-swe-agent[bot]', 'copilot[bot]', 'github-copilot[bot]'],
    emails: ['copilot@github.com'],
    lines: [/co-authored-by:.*\bcopilot\b/, /agent-logs-url:/, /\d+\+copilot@users\.noreply\.github\.com/],
  },
  {
    name: 'Devin',
    logins: ['devin-ai-integration[bot]'],
    emails: ['devin@cognition.ai', 'devin@cognition-labs.com'],
    lines: [/co-authored-by:.*\bdevin\b/],
  },
  {
    name: 'Codex',
    logins: ['chatgpt-codex-connector[bot]'],
    emails: ['codex@openai.com'],
    lines: [/co-authored-by:.*\bcodex\b/],
  },
  {
    name: 'Aider',
    logins: [],
    emails: ['noreply@aider.chat', 'aider@aider.chat'],
    lines: [/co-authored-by:.*\baider\b/, /\(aider\)/],
  },
  {
    name: 'OpenHands',
    logins: [],
    emails: ['openhands@all-hands.dev'],
    lines: [/co-authored-by:.*\bopenhands\b/],
  },
  {
    name: 'Gemini',
    logins: ['gemini-code-assist[bot]', 'google-labs-jules[bot]'],
    emails: ['jules@google.com'],
    lines: [/co-authored-by:.*\bgemini\b/, /co-authored-by:.*\bjules\b/],
  },
  {
    name: 'Amazon Q',
    logins: ['amazon-q-developer[bot]'],
    emails: [],
    lines: [/co-authored-by:.*\bamazon q\b/],
  },
];

const GENERIC_AGENT_LINES = [
  /^(assisted-by|generated-by|ai-assisted-by|ai-tool):/,
  /^ai-generated:\s*true/,
];

const AUTH_PARTS = new Set([
  'login',
  'signin',
  'signup',
  'oauth',
  'oidc',
  'jwt',
  'session',
  'sessions',
  'cookie',
  'cookies',
  'csrf',
  'password',
  'passwd',
  'auth',
  'authentication',
  'sso',
  'saml',
]);

const DEPENDENCY_FILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'packages.lock.json',
  'go.mod',
  'go.sum',
  'cargo.toml',
  'cargo.lock',
  'requirements.txt',
  'poetry.lock',
  'pipfile',
  'pipfile.lock',
  'uv.lock',
  'gemfile',
  'gemfile.lock',
  'composer.json',
  'composer.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gradle.lockfile',
  'pubspec.yaml',
  'mix.exs',
  'mix.lock',
]);

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'rb',
  'java',
  'kt',
  'kts',
  'php',
  'cs',
  'scala',
  'swift',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'vue',
  'svelte',
]);

interface FiredSignal {
  readonly id: SignalId;
  readonly phrase: string;
  readonly force: boolean;
}

function pathsOf(file: ChangedFile): readonly string[] {
  if (file.previousPath !== '' && file.previousPath !== file.path) {
    return [file.path, file.previousPath];
  }
  return [file.path];
}

function pathsMatching(files: readonly ChangedFile[], predicate: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const path of pathsOf(file)) {
      if (predicate(path) && !found.includes(path)) {
        found.push(path);
      }
    }
  }
  return found;
}

function withPaths(sentence: string, paths: readonly string[]): string {
  const shown = paths.slice(0, 3).join(', ');
  const extra = paths.length - Math.min(paths.length, 3);
  const more = extra > 0 ? ` and ${extra} more` : '';
  return `${sentence} (${shown}${more}).`;
}

function textLines(snapshot: PullRequestSnapshot): string[] {
  const chunks = [snapshot.authorLogin, snapshot.body];
  for (const commit of snapshot.commits) {
    chunks.push(
      commit.authorName,
      commit.authorEmail,
      commit.authorLogin,
      commit.committerName,
      commit.committerEmail,
      commit.committerLogin,
      commit.message,
    );
  }
  return chunks.join('\n').toLowerCase().split(/\r?\n/);
}

function loginsOf(snapshot: PullRequestSnapshot): Set<string> {
  const logins = new Set<string>();
  if (snapshot.authorLogin !== '') {
    logins.add(snapshot.authorLogin.toLowerCase());
  }
  for (const commit of snapshot.commits) {
    if (commit.authorLogin !== '') {
      logins.add(commit.authorLogin.toLowerCase());
    }
    if (commit.committerLogin !== '') {
      logins.add(commit.committerLogin.toLowerCase());
    }
  }
  return logins;
}

function ruleMatches(rule: AgentRule, lines: readonly string[], logins: ReadonlySet<string>): boolean {
  if (rule.logins.some((login) => logins.has(login))) {
    return true;
  }
  const blob = lines.join('\n');
  if (rule.emails.some((email) => blob.includes(email))) {
    return true;
  }
  return lines.some((line) => rule.lines.some((pattern) => pattern.test(line)));
}

function detectPresence(snapshot: PullRequestSnapshot): Presence {
  const author = snapshot.authorLogin.toLowerCase();
  if (DEPENDENCY_BOT_LOGINS.has(author)) {
    return { kind: 'dependency_bot', login: snapshot.authorLogin };
  }
  const lines = textLines(snapshot);
  const logins = loginsOf(snapshot);
  const names = AGENT_RULES.filter((rule) => ruleMatches(rule, lines, logins)).map((rule) => rule.name);
  if (names.length === 0 && lines.some((line) => GENERIC_AGENT_LINES.some((pattern) => pattern.test(line)))) {
    names.push('a coding agent');
  }
  if (names.length > 0) {
    return { kind: 'coding_agent', names };
  }
  return { kind: 'human' };
}

function pathParts(path: string): string[] {
  return path.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 0);
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return (slash === -1 ? path : path.slice(slash + 1)).toLowerCase();
}

function isWorkflow(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.startsWith('.github/workflows/') && (lower.endsWith('.yml') || lower.endsWith('.yaml'));
}

function isDependencyFile(path: string): boolean {
  return DEPENDENCY_FILES.has(basename(path));
}

function isSecretPath(path: string): boolean {
  const base = basename(path);
  if (base === '.env' || base.startsWith('.env.')) {
    return true;
  }
  if (/\.(pem|key|p12|pfx|kdbx)$/.test(base)) {
    return true;
  }
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.|$)/.test(base) && !base.endsWith('.pub')) {
    return true;
  }
  return pathParts(path).some(
    (part) => part === 'secret' || part === 'secrets' || part === 'credential' || part === 'credentials' || part === 'vault',
  );
}

function patchHasPrivateKey(patch: string): boolean {
  return /BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY/.test(patch);
}

function isAuthPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('log-in') || lower.includes('sign-in') || lower.includes('sign-up')) {
    return true;
  }
  return pathParts(path).some((part) => {
    if (AUTH_PARTS.has(part)) {
      return true;
    }
    const stem = part.replace(/\d+$/, '');
    return stem !== part && AUTH_PARTS.has(stem);
  });
}

function isTestPath(path: string): boolean {
  const base = basename(path);
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) {
    return true;
  }
  if (/_test\.(go|rs|py)$/.test(base) || /^test_.+\.py$/.test(base)) {
    return true;
  }
  return path
    .toLowerCase()
    .split('/')
    .some((part) => part === 'test' || part === 'tests' || part === '__tests__' || part === 'spec');
}

function extensionOf(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot + 1);
}

function isProductionCode(path: string): boolean {
  return (
    CODE_EXTENSIONS.has(extensionOf(path)) &&
    !isTestPath(path) &&
    !isDependencyFile(path) &&
    !isWorkflow(path)
  );
}

function linesChanged(files: readonly ChangedFile[]): number {
  return files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
}

function collectFired(snapshot: PullRequestSnapshot, policy: Policy): FiredSignal[] {
  const fired: FiredSignal[] = [];
  const authPaths = pathsMatching(snapshot.files, isAuthPath);
  if (authPaths.length > 0) {
    fired.push({
      id: 'auth',
      phrase: withPaths('The diff touches authentication, login, session, or cookie code', authPaths),
      force: true,
    });
  }
  const secretPaths = pathsMatching(snapshot.files, isSecretPath);
  for (const file of snapshot.files) {
    if (patchHasPrivateKey(file.patch) && !secretPaths.includes(file.path)) {
      secretPaths.push(file.path);
    }
  }
  if (secretPaths.length > 0) {
    fired.push({
      id: 'secrets',
      phrase: withPaths('The diff touches secrets, credentials, or a private key', secretPaths),
      force: true,
    });
  }
  const workflowPaths = pathsMatching(snapshot.files, isWorkflow);
  if (workflowPaths.length > 0) {
    fired.push({
      id: 'ci',
      phrase: withPaths('The diff changes a GitHub Actions workflow', workflowPaths),
      force: true,
    });
  }
  const dependencyPaths = pathsMatching(snapshot.files, isDependencyFile);
  if (dependencyPaths.length > 0) {
    fired.push({
      id: 'dependencies',
      phrase: withPaths('The diff changes a dependency manifest or lockfile', dependencyPaths),
      force: false,
    });
  }
  const changed = linesChanged(snapshot.files);
  if (changed >= policy.linesChangedThreshold) {
    fired.push({
      id: 'large_diff',
      phrase: `The diff changes ${changed} lines, which is at least the ${policy.linesChangedThreshold} line threshold.`,
      force: false,
    });
  }
  const production = snapshot.files.some((file) => pathsOf(file).some(isProductionCode));
  const tests = snapshot.files.some((file) => pathsOf(file).some(isTestPath));
  if (production && !tests) {
    fired.push({
      id: 'missing_tests',
      phrase: 'Production code changed and no test file changed.',
      force: false,
    });
  }
  return fired;
}

function header(presence: Presence): string {
  switch (presence.kind) {
    case 'coding_agent':
      return `This pull request has coding-agent signals (${presence.names.join(', ')}).`;
    case 'dependency_bot':
      return `This pull request is from ${presence.login}, a dependency bot, and include-dependency-bots is on.`;
    case 'human':
      return 'skip-human is off, so this pull request was classified with no coding-agent signal.';
    default: {
      const exhaustive: never = presence;
      return exhaustive;
    }
  }
}

function renderComment(
  presence: Presence,
  outcome: 'needs_line_by_line' | 'skim_ok',
  phrases: readonly string[],
): string {
  const verdict = outcome === 'needs_line_by_line' ? 'Needs line-by-line review.' : 'Skim ok.';
  const body = phrases.length > 0 ? phrases.map((phrase) => `- ${phrase}`).join('\n') : '- No risk signals fired.';
  return `${header(presence)}\n\n${verdict}\n\n${body}\n\n${COMMENT_MARKER}`;
}

function skip(reason: string): Decision {
  return {
    outcome: 'skip',
    reasons: [reason],
    signals: [],
    label: null,
    comment: null,
  };
}

export function classify(snapshot: PullRequestSnapshot, policy: Policy = DEFAULT_POLICY): Decision {
  const presence = detectPresence(snapshot);
  if (presence.kind === 'dependency_bot' && !policy.includeDependencyBots) {
    return skip(
      'Dependabot and Renovate stay out of the coding-agent path unless include-dependency-bots is on.',
    );
  }
  if (presence.kind === 'human' && policy.skipHuman) {
    return skip('No coding-agent signal was found, so this pull request was left unchanged.');
  }

  const fired = collectFired(snapshot, policy);
  const force = fired.some((signal) => signal.force);
  const softCount = fired.filter((signal) => !signal.force).length;
  const outcome = force || softCount >= policy.stackReviewThreshold ? 'needs_line_by_line' : 'skim_ok';
  const phrases = fired.map((signal) => signal.phrase);
  const label = outcome === 'needs_line_by_line' ? policy.labelNeedsReview : policy.labelSkimOk;
  return {
    outcome,
    reasons: phrases,
    signals: fired.map((signal) => signal.id),
    label,
    comment: renderComment(presence, outcome, phrases),
  };
}

export function decisionName(decision: Decision): string {
  switch (decision.outcome) {
    case 'skip':
      return 'skip';
    case 'needs_line_by_line':
      return 'needs line-by-line review';
    case 'skim_ok':
      return 'skim ok';
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

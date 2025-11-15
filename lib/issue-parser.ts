import { GitHubWebhookPayload, ParsedIssue } from '@/types/github';

/**
 * Parses a GitHub webhook payload and extracts relevant issue information
 */
export function parseIssue(payload: GitHubWebhookPayload): ParsedIssue {
  const { issue, repository } = payload;

  return {
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body || '',
    repositoryUrl: repository.html_url,
    repositoryName: repository.name,
    repositoryOwner: repository.owner.login,
    cloneUrl: repository.clone_url,
    defaultBranch: repository.default_branch,
    issueUrl: issue.html_url,
  };
}

/**
 * Validates that the parsed issue has all required fields
 */
export function validateParsedIssue(issue: ParsedIssue): boolean {
  return (
    issue.issueNumber > 0 &&
    issue.title.length > 0 &&
    issue.repositoryName.length > 0 &&
    issue.repositoryOwner.length > 0 &&
    issue.cloneUrl.length > 0
  );
}


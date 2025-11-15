// GitHub Webhook Event Types
export interface GitHubWebhookPayload {
  action: string;
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  clone_url: string;
  html_url: string;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
}

export interface ParsedIssue {
  issueNumber: number;
  title: string;
  body: string;
  repositoryUrl: string;
  repositoryName: string;
  repositoryOwner: string;
  cloneUrl: string;
  defaultBranch: string;
  issueUrl: string;
}


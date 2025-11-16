// Daytona Workspace Types
export interface DaytonaWorkspace {
  id: string;
  name: string;
  project: {
    name: string;
    repository: {
      url: string;
    };
  };
  ideUrl?: string;
  status?: string;
  previewUrl?: string;
  previewToken?: string;
}

export interface SandboxPair {
  before: DaytonaWorkspace;
  after: DaytonaWorkspace;
}

export interface CreateWorkspaceRequest {
  name: string;
  project: {
    name: string;
    repository: {
      url: string;
    };
    image?: string;
  };
}

export interface InMemoryIssue {
  issueNumber: number;
  repositoryName: string;
  repositoryOwner: string;
  title: string;
  body: string;
  beforeWorkspaceId?: string;
  afterWorkspaceId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}


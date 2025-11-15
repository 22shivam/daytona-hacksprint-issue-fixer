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
  workspaceId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}


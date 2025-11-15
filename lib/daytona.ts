import { Daytona, Sandbox } from '@daytonaio/sdk';
import { DaytonaWorkspace } from '@/types/daytona';
import { ParsedIssue } from '@/types/github';

/**
 * Daytona API Client using the official SDK
 * Handles communication with Daytona API for workspace/sandbox management
 */
export class DaytonaClient {
  private daytona: Daytona;

  constructor(apiKey: string, apiUrl?: string) {
    const config: { apiKey: string; apiUrl?: string } = {
      apiKey,
    };
    
    if (apiUrl) {
      config.apiUrl = apiUrl;
    }

    this.daytona = new Daytona(config);
  }

  /**
   * Creates a Daytona sandbox from a GitHub repository
   * Creates the sandbox and clones the repository into it
   */
  async createWorkspace(issue: ParsedIssue, workspaceName?: string): Promise<DaytonaWorkspace> {
    const name = workspaceName || `issue-${issue.issueNumber}-${Date.now()}`;

    try {
      // Create a sandbox - you can specify language, image, etc.
      // For now, we'll create a basic sandbox and clone the repo into it
      const sandbox = await this.daytona.create({
        name,
        // You can specify language if you know the project type
        // language: 'typescript', // or 'javascript', 'python', etc.
        envVars: {
          // Add any environment variables if needed
        },
        labels: {
          issueNumber: issue.issueNumber.toString(),
          repository: issue.repositoryName,
          repositoryOwner: issue.repositoryOwner,
        },
      });

      console.log(`Sandbox created: ${sandbox.id} - ${sandbox.name}`);

      // Clone the repository into the sandbox
      // Get the working directory path
      const workDir = await sandbox.getWorkDir();
      const clonePath = workDir || '/home/user';
      
      console.log(`Cloning repository ${issue.cloneUrl} into sandbox at ${clonePath}...`);
      
      // Clone the repository - use the repository name as the directory name
      // For GitHub, we can use a token as password if available (for private repos)
      const githubToken = process.env.GITHUB_TOKEN;
      const cloneOptions: {
        branch?: string;
        username?: string;
        password?: string;
      } = {};
      
      if (githubToken && issue.cloneUrl.includes('github.com')) {
        // For GitHub, username can be anything when using token, password is the token
        cloneOptions.username = 'git';
        cloneOptions.password = githubToken;
      }
      
      await sandbox.git.clone(
        issue.cloneUrl,
        `${clonePath}/${issue.repositoryName}`,
        undefined, // branch - use default
        undefined, // commitId - use default
        cloneOptions.username,
        cloneOptions.password
      );

      // Convert Sandbox to DaytonaWorkspace format for our types
      const workspace: DaytonaWorkspace = {
        id: sandbox.id,
        name: sandbox.name,
        project: {
          name: issue.repositoryName,
          repository: {
            url: issue.cloneUrl,
          },
        },
        status: sandbox.state,
      };

      return workspace;
    } catch (error) {
      console.error('Error creating Daytona workspace:', error);
      throw error;
    }
  }

  /**
   * Gets workspace details by ID
   */
  async getWorkspace(workspaceId: string): Promise<DaytonaWorkspace> {
    try {
      const sandbox = await this.daytona.get(workspaceId);
      
      const workspace: DaytonaWorkspace = {
        id: sandbox.id,
        name: sandbox.name,
        project: {
          name: sandbox.name, // Sandbox name might be the project name
          repository: {
            url: '', // We'd need to get this from git remote if needed
          },
        },
        status: sandbox.state,
        ideUrl: sandbox.id, // You might need to construct the IDE URL based on your setup
      };

      return workspace;
    } catch (error) {
      console.error('Error fetching Daytona workspace:', error);
      throw error;
    }
  }
}


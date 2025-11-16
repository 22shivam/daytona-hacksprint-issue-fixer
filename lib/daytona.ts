import { Daytona, Sandbox } from '@daytonaio/sdk';
import { DaytonaWorkspace, SandboxPair } from '@/types/daytona';
import { ParsedIssue } from '@/types/github';

// Claude Code snapshot name (must be created using npm run create-snapshot)
const CLAUDE_SNAPSHOT_NAME = "claude-code-bugfixer:1.0.0";

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
   * Creates a single sandbox, clones the repository, and sets it up
   */
  private async createAndSetupSandbox(
    issue: ParsedIssue,
    workspaceName: string,
    labels: Record<string, string>,
    useClaudeSnapshot: boolean = false,
    anthropicApiKey?: string
  ): Promise<{ sandbox: Sandbox; workspace: DaytonaWorkspace }> {
    // Create a sandbox
    const createOptions: any = {
      name: workspaceName,
      labels,
      public: true, // Make sandbox publicly accessible,
      // user: 'claude',
    };

    // Use Claude Code snapshot (both BEFORE and AFTER use it for pre-installed packages)
    if (useClaudeSnapshot) {
      createOptions.snapshot = CLAUDE_SNAPSHOT_NAME;
      // Set ANTHROPIC_API_KEY environment variable (only for AFTER sandbox)
      if (anthropicApiKey) {
        createOptions.envVars = {
          ANTHROPIC_API_KEY: anthropicApiKey,
        };
      }
    }

    const sandbox = await this.daytona.create(createOptions);

    console.log(`Sandbox created: ${sandbox.id} - ${sandbox.name}`);
    
    // If using Claude snapshot, ensure claude user exists (should already exist in snapshot)
    if (useClaudeSnapshot) {
      try {
        await sandbox.process.executeCommand('id claude || useradd -m -s /bin/bash claude');
      } catch (error) {
        console.log('Claude user check/creation:', error);
      }
    }

    // Clone the repository into the sandbox
    const workDir = await sandbox.getWorkDir();
    const clonePath = workDir || '/home/user';
    const repoPath = `${clonePath}/${issue.repositoryName}`;
    
    console.log(`Cloning repository ${issue.cloneUrl} into sandbox at ${repoPath}...`);
    
    // Clone the repository
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken && issue.cloneUrl.includes('github.com')) {
      await sandbox.git.clone(
        issue.cloneUrl,
        repoPath,
        undefined, // branch - use default
        undefined, // commitId - use default
        'git',
        githubToken
      );
    } else {
      await sandbox.git.clone(
        issue.cloneUrl,
        repoPath,
        undefined,
        undefined
      );
    }
    
    // Files will be owned by root/default user, so we'll fix permissions later
    // when running Claude Code CLI

    // Get preview URL for port 3000
    const previewInfo = await sandbox.getPreviewLink(3000);
    
    // Print preview URL in terminal (clickable)
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Sandbox: ${sandbox.name}`);
    console.log(`🔗 Preview URL: ${previewInfo.url}`);
    console.log(`🔑 Preview Token: ${previewInfo.token}`);
    console.log(`${'='.repeat(60)}\n`);
    
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
      previewUrl: previewInfo.url,
      previewToken: previewInfo.token,
    };

    return { sandbox, workspace };
  }

  /**
   * Creates BEFORE and AFTER sandboxes from a GitHub repository
   * Both use Claude Code snapshot (with pre-installed packages for faster pnpm install)
   * AFTER sandbox has ANTHROPIC_API_KEY set for Claude Code CLI
   */
  async createSandboxPair(issue: ParsedIssue, anthropicApiKey: string): Promise<SandboxPair> {
    const timestamp = Date.now();
    const baseName = `issue-${issue.issueNumber}`;

    try {
      // Create BEFORE sandbox (from snapshot, but no API key needed)
      console.log('Creating BEFORE sandbox (from snapshot)...');
      const beforeResult = await this.createAndSetupSandbox(
        issue,
        `${baseName}-before-${timestamp}`,
        {
          issueNumber: issue.issueNumber.toString(),
          repository: issue.repositoryName,
          repositoryOwner: issue.repositoryOwner,
          type: 'before',
        },
        true, // Use snapshot for BEFORE (has pre-installed packages)
        undefined // No API key needed for BEFORE
      );

      // Create AFTER sandbox (from snapshot with Claude Code CLI support)
      console.log('Creating AFTER sandbox (from snapshot with Claude Code CLI)...');
      const afterResult = await this.createAndSetupSandbox(
        issue,
        `${baseName}-after-${timestamp}`,
        {
          issueNumber: issue.issueNumber.toString(),
          repository: issue.repositoryName,
          repositoryOwner: issue.repositoryOwner,
          type: 'after',
        },
        true, // Use snapshot for AFTER
        anthropicApiKey // Pass API key for env var (needed for Claude Code CLI)
      );

      return {
        before: beforeResult.workspace,
        after: afterResult.workspace,
      };
    } catch (error) {
      console.error('Error creating sandbox pair:', error);
      throw error;
    }
  }

  /**
   * Runs Claude Code CLI in the AFTER sandbox to fix the issue
   * @param sandboxId - The AFTER sandbox ID (must be created from Claude Code snapshot)
   * @param repoName - Name of the repository (used to construct repo path)
   * @param issueTitle - GitHub issue title
   * @param issueBody - GitHub issue body
   * @returns Claude Code CLI response with result and changes
   */
  async runClaudeCodeInSandbox(
    sandboxId: string,
    repoName: string,
    issueTitle: string,
    issueBody: string
  ): Promise<{ result: string; changes?: any }> {
    const sandbox = await this.daytona.get(sandboxId);
    const workDir = await sandbox.getWorkDir();
    const repoPath = `${workDir || '/home/user'}/${repoName}`;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 Starting Claude Code CLI in sandbox ${sandboxId}`);
    console.log(`📁 Repository path: ${repoPath}`);
    console.log(`${'='.repeat(80)}\n`);

    // Build comprehensive prompt from issue
    const prompt = `Fix the following GitHub issue. Do it quick, dont take too long.:

Title: ${issueTitle}

Description:
${issueBody}

Please:
1. Implement the fix or thing asked in the issue title and description
2. Make the necessary file changes directly`;

    // Base64 encode prompt to avoid shell escaping
    const promptBase64 = Buffer.from(prompt).toString('base64');

    // Fix permissions: Change ownership of repo directory to claude user
    // This allows Claude Code CLI to write files without prompts
    console.log('🔧 Fixing permissions: Changing ownership of repo to claude user...');
    try {
      await sandbox.process.executeCommand(`chown -R claude:claude ${repoPath}`);
      console.log('✅ Permissions fixed - repo is now owned by claude user');
    } catch (error) {
      console.warn('⚠️  Could not change ownership:', error);
      // Continue anyway - might still work
    }

    // Build Claude Code CLI command (NO --continue flag)
    // Run as claude user with --dangerously-skip-permissions to avoid prompts
    // Match nightona's working approach exactly
    const claudeCommand = `su claude -c "cd ${repoPath} && claude --dangerously-skip-permissions -p \\"\\$(echo '${promptBase64}' | base64 -d)\\" --output-format json"`;

    console.log('\n📝 Executing Claude Code CLI...');
    console.log(`📂 Working directory: ${repoPath}`);
    console.log(`\n📋 Full Prompt:`);
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80));
    console.log();

    // Execute command with timeout and better error handling
    // Note: For now using executeCommand with periodic status updates
    // Streaming will be added once we verify the command works
    console.log('⏳ Executing Claude Code CLI (this may take 2-5 minutes)...');
    console.log('💡 Tip: Claude Code CLI is analyzing the codebase and making changes\n');
    console.log('💡 To check if Claude is running in the sandbox, use: `ps aux | grep claude`\n');

    let commandResult: any;
    const startTime = Date.now();

    try {
      // Add a progress indicator with process check
      const progressInterval = setInterval(async () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
        // Check if claude process is running (every 10 seconds)
        if (elapsed % 10 === 0) {
          try {
            const processCheck = await sandbox.process.executeCommand(`ps aux | grep -E '[c]laude.*--output-format' || echo 'NOT_RUNNING'`);
            const isRunning = !processCheck.result.includes('NOT_RUNNING') && processCheck.result.trim().length > 0;
            const status = isRunning ? 'RUNNING' : 'NOT_FOUND';
            process.stdout.write(`\r⏱️  Elapsed: ${elapsed}s - Claude Code CLI ${status} (running as root)...`);
          } catch {
            process.stdout.write(`\r⏱️  Elapsed: ${elapsed}s - Claude Code CLI is working (running as root)...`);
          }
        } else {
          process.stdout.write(`\r⏱️  Elapsed: ${elapsed}s - Claude Code CLI is working (running as root)...`);
        }
      }, 5000);

      // Execute the command with a longer timeout (10 minutes)
      const response = await sandbox.process.executeCommand(claudeCommand, repoPath, undefined, 600000);

      clearInterval(progressInterval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear progress line

      commandResult = response;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`\n✅ Command completed in ${elapsed} seconds\n`);

      // Display output and debug info
      console.log(`\n📊 Command Result:`);
      console.log(`   Exit Code: ${response.exitCode}`);
      console.log(`   Result length: ${response.result?.length || 0} chars`);
      
      if (response.artifacts) {
        console.log(`   Artifacts:`, JSON.stringify(response.artifacts, null, 2));
      }

      // Display full output (no truncation)
      if (response.result && response.result.trim()) {
        console.log('\n📄 Claude Code CLI Full Output:');
        console.log('='.repeat(80));
        console.log(response.result);
        console.log('='.repeat(80));
      } else {
        console.warn('\n⚠️  WARNING: No output received from Claude Code CLI!');
        console.warn('   This could mean:');
        console.warn('   1. The command failed silently');
        console.warn('   2. Claude Code CLI is not installed in the sandbox');
        console.warn('   3. The working directory is incorrect');
        console.warn('   4. There was an error that was not captured');
        
        // Try to verify the setup
        console.log('\n🔍 Debugging: Checking if claude command exists...');
        try {
          const checkCmd = await sandbox.process.executeCommand('which claude', repoPath);
          console.log('   Claude path:', checkCmd.result || 'NOT FOUND');
        } catch (e) {
          console.error('   Could not check claude command:', e);
        }
        
        // Check if directory exists
        console.log('🔍 Debugging: Checking if repo directory exists...');
        try {
          const dirCheck = await sandbox.process.executeCommand(`test -d ${repoPath} && echo "EXISTS" || echo "NOT FOUND"`, repoPath);
          console.log('   Directory status:', dirCheck.result || 'UNKNOWN');
        } catch (e) {
          console.error('   Could not check directory:', e);
        }
      }

      if (response.exitCode !== 0) {
        console.warn(`\n⚠️  Command exited with code: ${response.exitCode}`);
        if (response.artifacts) {
          console.error('Error artifacts:', JSON.stringify(response.artifacts, null, 2));
        }
      }
    } catch (error) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.error(`\n❌ Error after ${elapsed} seconds:`, error);
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          console.error('⏱️  Command timed out. Claude Code CLI may need more time.');
          console.error('💡 Consider increasing the timeout or checking if the command is stuck.');
        } else if (error.message.includes('sandbox')) {
          console.error('🔌 Sandbox connection issue. The sandbox may have been stopped.');
        }
      }
      
      throw error;
    }

    // Parse JSON response
    let result;
    const outputToParse = commandResult.result || '';
    
    try {
      // Try to extract JSON from output (might have logs before/after JSON)
      const jsonMatch = outputToParse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        console.log('✅ Successfully parsed Claude Code CLI JSON response');
      } else {
        throw new Error('No JSON found in output');
      }
    } catch (error) {
      // If JSON parsing fails, return raw result
      console.warn('⚠️  Could not parse Claude Code CLI JSON response:', error);
      console.log('📄 Raw output (first 500 chars):', outputToParse.substring(0, 500));
      result = { 
        result: outputToParse, 
        warning: "Could not parse JSON response",
        exitCode: commandResult.exitCode,
      };
    }

    // Revert ownership back to root after Claude Code CLI completes
    console.log('🔧 Reverting ownership back to root...');
    try {
      await sandbox.process.executeCommand(`chown -R root:root ${repoPath}`);
      console.log('✅ Ownership reverted to root');
    } catch (error) {
      console.warn('⚠️  Could not revert ownership:', error);
      // Continue anyway - not critical
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✨ Claude Code CLI execution complete in sandbox ${sandboxId}`);
    console.log(`${'='.repeat(80)}\n`);

    return result;
  }

  /**
   * Creates a branch, commits changes, pushes to GitHub, and creates a PR
   * All operations happen inside the AFTER sandbox
   */
  async createBranchAndPR(
    sandboxId: string,
    repoName: string,
    issueNumber: number,
    issueTitle: string,
    repositoryOwner: string,
    repositoryName: string,
    defaultBranch: string,
    githubToken: string,
    beforePreviewUrl: string,
    afterPreviewUrl: string,
    beforePreviewToken: string,
    afterPreviewToken: string
  ): Promise<{ branchName: string; prUrl: string; prNumber: number }> {
    const sandbox = await this.daytona.get(sandboxId);
    const workDir = await sandbox.getWorkDir();
    const repoPath = `${workDir || '/home/user'}/${repoName}`;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 Creating branch and PR for issue #${issueNumber}`);
    console.log(`${'='.repeat(80)}\n`);

    // Generate branch name from issue title
    const branchName = `autofix/issue-${issueNumber}-${issueTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)}`;

    console.log(`📝 Branch name: ${branchName}`);

    // Configure git user (needed for commits)
    console.log('⚙️  Configuring git...');
    await sandbox.process.executeCommand(
      `git config user.name "AutoFixer Bot" && git config user.email "autofixer@daytona.io"`,
      repoPath
    );

    // Ensure we're on the default branch first
    console.log(`🔄 Checking out default branch: ${defaultBranch}...`);
    try {
      await sandbox.process.executeCommand(`git checkout ${defaultBranch}`, repoPath);
    } catch (error) {
      console.log('Default branch checkout failed, trying to fetch first...');
      await sandbox.process.executeCommand('git fetch origin', repoPath);
      await sandbox.process.executeCommand(`git checkout ${defaultBranch}`, repoPath);
    }

    // Check git status
    console.log('📊 Checking git status...');
    const statusResult = await sandbox.process.executeCommand('git status --short', repoPath);
    const hasChanges = statusResult.result && statusResult.result.trim().length > 0;

    // Create and checkout new branch
    console.log(`🌿 Creating branch: ${branchName}...`);
    await sandbox.process.executeCommand(
      `git checkout -b ${branchName}`,
      repoPath
    );

    if (!hasChanges) {
      console.log('⚠️  No changes detected. Creating PR with note about no changes.');
    } else {
      console.log('📋 Changes detected:');
      console.log(statusResult.result);

      // Stage all changes
      console.log('📦 Staging changes...');
      await sandbox.process.executeCommand('git add -A', repoPath);

      // Commit changes
      console.log('💾 Committing changes...');
      const commitMessage = `AutoFix: ${issueTitle}\n\nFixes #${issueNumber}\n\nThis PR was automatically generated by AutoFixer.`;
      const commitMessageEscaped = commitMessage.replace(/'/g, "'\\''");
      await sandbox.process.executeCommand(
        `git commit -m '${commitMessageEscaped}'`,
        repoPath
      );
    }

    // Push to GitHub
    console.log('📤 Pushing to GitHub...');
    const remoteUrl = `https://${githubToken}@github.com/${repositoryOwner}/${repositoryName}.git`;
    
    try {
      // Set remote if not exists or update it
      await sandbox.process.executeCommand(
        `git remote set-url origin ${remoteUrl} || git remote add origin ${remoteUrl}`,
        repoPath
      );

      // Push branch (create it on remote)
      await sandbox.process.executeCommand(
        `git push -u origin ${branchName}`,
        repoPath
      );
      console.log('✅ Branch pushed successfully');
    } catch (error) {
      console.error('❌ Error pushing to GitHub:', error);
      throw error;
    }

    // Get git diff for PR description
    let changesSummary = '';
    if (hasChanges) {
      try {
        const diffResult = await sandbox.process.executeCommand(
          `git diff ${defaultBranch}..${branchName} --stat`,
          repoPath
        );
        changesSummary = diffResult.result || 'Changes made (see diff)';
      } catch (error) {
        changesSummary = 'Changes made (unable to generate diff summary)';
      }
    } else {
      changesSummary = 'No code changes detected. This PR was created to track the issue resolution process.';
    }

    // Create PR using GitHub API (via script in sandbox)
    console.log('🔨 Creating pull request...');
    
    // Use JSON.stringify to safely embed all variables and prevent syntax errors
    const prScript = `
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: ${JSON.stringify(githubToken)},
});

async function createPR() {
  try {
    const prTitle = 'AutoFix: ' + ${JSON.stringify(issueTitle)};
    const beforePreviewUrl = ${JSON.stringify(beforePreviewUrl)};
    const beforePreviewToken = ${JSON.stringify(beforePreviewToken)};
    const afterPreviewUrl = ${JSON.stringify(afterPreviewUrl)};
    const afterPreviewToken = ${JSON.stringify(afterPreviewToken)};
    const changesSummary = ${JSON.stringify(changesSummary)};
    
    const prBody = \`## 🤖 AutoFixer Pull Request

This PR was automatically generated to address issue #${issueNumber}.

### 📋 Summary of Changes

\`\`\`
\${changesSummary}
\`\`\`

### 🔗 Preview Sandboxes

**🔴 BEFORE Sandbox (Original State)**
- Preview URL: \${beforePreviewUrl}
- Access Token: \`\${beforePreviewToken}\`
- Access with: \`curl -H "x-daytona-preview-token: \${beforePreviewToken}" \${beforePreviewUrl}\`

**🟢 AFTER Sandbox (With Fixes Applied)**
- Preview URL: \${afterPreviewUrl}
- Access Token: \`\${afterPreviewToken}\`
- Access with: \`curl -H "x-daytona-preview-token: \${afterPreviewToken}" \${afterPreviewUrl}\`

### 📝 Issue
Closes #${issueNumber}

---
*This PR was automatically created by AutoFixer. Please review the changes and sandbox previews before merging.*
\`;

    const { data } = await octokit.rest.pulls.create({
      owner: ${JSON.stringify(repositoryOwner)},
      repo: ${JSON.stringify(repositoryName)},
      title: prTitle,
      body: prBody,
      head: ${JSON.stringify(branchName)},
      base: ${JSON.stringify(defaultBranch)},
    });

    console.log(JSON.stringify({
      prNumber: data.number,
      prUrl: data.html_url,
      branchName: ${JSON.stringify(branchName)},
    }));
  } catch (error) {
    console.error('Error creating PR:', error.message);
    process.exit(1);
  }
}

createPR();
`;

    // Write PR script to sandbox
    const prScriptPath = `${repoPath}/.create-pr.js`;
    const prScriptBuffer = Buffer.from(prScript, 'utf-8');
    await sandbox.fs.uploadFile(prScriptBuffer, prScriptPath);

    // @octokit/rest is now pre-installed in the Docker image, so no need to install at runtime
    // The package will be available from the pnpm cache when the project runs pnpm install
    // // Install @octokit/rest if needed
    // console.log('📦 Installing @octokit/rest...');
    // try {
    //   await sandbox.process.executeCommand('npm install @octokit/rest', repoPath);
    // } catch (error) {
    //   console.log('Trying with pnpm...');
    //   await sandbox.process.executeCommand('pnpm add @octokit/rest', repoPath);
    // }

    // Execute PR creation script
    const prResult = await sandbox.process.executeCommand(
      `node ${prScriptPath}`,
      repoPath
    );
    
    // Parse PR result
    let prData;
    try {
      const output = prResult.result || '';
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        prData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON in output');
      }
    } catch (error) {
      console.error('❌ Failed to parse PR creation result:', error);
      console.log('Raw output:', prResult.result);
      throw new Error('Failed to create PR');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ Pull Request Created Successfully!');
    console.log(`${'='.repeat(80)}`);
    console.log(`📝 PR #${prData.prNumber}: ${prData.prUrl}`);
    console.log(`🌿 Branch: ${prData.branchName}`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      branchName: prData.branchName,
      prUrl: prData.prUrl,
      prNumber: prData.prNumber,
    };
  }

  /**
   * Sets up and runs the web app in a sandbox (pnpm install && pnpm dev)
   */
  async setupAndRunApp(sandboxId: string, repoName: string): Promise<void> {
    const sandbox = await this.daytona.get(sandboxId);
    const workDir = await sandbox.getWorkDir();
    const repoPath = `${workDir || '/home/user'}/${repoName}`;

    console.log(`Setting up app in sandbox ${sandboxId} at ${repoPath}...`);

    // Check if pnpm is available, if not install it or use npm
    console.log('Checking for pnpm...');
    let usePnpm = false;
    try {
      const pnpmCheck = await sandbox.process.executeCommand('which pnpm', repoPath);
      if (pnpmCheck.result && pnpmCheck.result.trim()) {
        usePnpm = true;
        console.log('pnpm found, using pnpm');
      }
    } catch (error) {
      console.log('pnpm not found, attempting to install...');
    }

    // If pnpm not found, try to install it using corepack (comes with Node.js)
    if (!usePnpm) {
      try {
        console.log('Installing pnpm using corepack...');
        await sandbox.process.executeCommand('corepack enable', repoPath);
        await sandbox.process.executeCommand('corepack prepare pnpm@latest --activate', repoPath);
        usePnpm = true;
        console.log('pnpm installed successfully');
      } catch (error) {
        console.log('Failed to install pnpm, falling back to npm');
        usePnpm = false;
      }
    }

    const packageManager = usePnpm ? 'pnpm' : 'npm';

    // Install dependencies
    console.log(`Running ${packageManager} install...`);
    const installResult = await sandbox.process.executeCommand(
      `${packageManager} install`,
      repoPath
    );
    console.log('Install output:', installResult.artifacts?.stdout || installResult.result);

    // Start dev server in background (using nohup or similar)
    console.log(`Starting ${packageManager} dev in background...`);
    // Use nohup to run in background and redirect output
    await sandbox.process.executeCommand(
      `nohup ${packageManager} dev > /tmp/dev-server.log 2>&1 &`,
      repoPath
    );

    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`App setup complete for sandbox ${sandboxId}`);
  }

  /**
   * Gets a sandbox by ID
   */
  async getSandbox(sandboxId: string): Promise<Sandbox> {
    return await this.daytona.get(sandboxId);
  }

  /**
   * Gets preview URL for a sandbox on a specific port
   */
  async getPreviewUrl(sandboxId: string, port: number = 3000): Promise<{ url: string; token: string }> {
    const sandbox = await this.daytona.get(sandboxId);
    const previewInfo = await sandbox.getPreviewLink(port);
    return {
      url: previewInfo.url,
      token: previewInfo.token,
    };
  }

  /**
   * Gets workspace details by ID
   */
  async getWorkspace(workspaceId: string): Promise<DaytonaWorkspace> {
    try {
      const sandbox = await this.daytona.get(workspaceId);
      const previewInfo = await sandbox.getPreviewLink(3000);
      
      const workspace: DaytonaWorkspace = {
        id: sandbox.id,
        name: sandbox.name,
        project: {
          name: sandbox.name,
          repository: {
            url: '',
          },
        },
        status: sandbox.state,
        previewUrl: previewInfo.url,
        previewToken: previewInfo.token,
      };

      return workspace;
    } catch (error) {
      console.error('Error fetching Daytona workspace:', error);
      throw error;
    }
  }
}


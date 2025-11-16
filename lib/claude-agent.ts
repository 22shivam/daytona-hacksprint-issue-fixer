import Anthropic from '@anthropic-ai/sdk';
import { Sandbox } from '@daytonaio/sdk';
import { ParsedIssue } from '@/types/github';

/**
 * Claude Agent for analyzing issues and implementing fixes/features
 */
export class ClaudeAgent {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * Analyzes the issue and generates a plan for implementation
   */
  async analyzeIssue(issue: ParsedIssue, codeContext: string): Promise<string> {
    const systemPrompt = `You are an autonomous bug-fixing and feature-implementation agent. 
Your task is to analyze GitHub issues and implement the requested changes.

When given an issue:
1. If it's a bug report: Identify the root cause and fix it
2. If it's a feature request: Implement the requested feature

You should:
- Write clean, maintainable code
- Follow the existing code style and patterns
- Add appropriate comments
- Consider edge cases
- Ensure the implementation is complete and functional

Respond with a detailed implementation plan first, then provide the actual code changes.`;

    const userPrompt = `Issue Title: ${issue.title}

Issue Description:
${issue.body}

Code Context:
${codeContext}

Please analyze this issue and provide:
1. A detailed plan of what needs to be done
2. The specific code changes needed (in diff format if possible)
3. Any additional considerations or edge cases to handle`;

    try {
      const message = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const response = message.content[0];
      if (response.type === 'text') {
        return response.text;
      }
      throw new Error('Unexpected response type from Claude');
    } catch (error) {
      console.error('Error analyzing issue with Claude:', error);
      throw error;
    }
  }

  /**
   * Gets code context from the sandbox (file tree and key files)
   */
  async getCodeContext(sandbox: Sandbox, repoPath: string): Promise<string> {
    try {
      // Get file tree
      const fileList = await sandbox.fs.listFiles(repoPath);
      
      // Get key files (package.json, README, main source files)
      const keyFiles: string[] = [];
      
      // Find important files
      for (const file of fileList) {
        const fileName = file.name || '';
        if (
          fileName.includes('package.json') ||
          fileName.includes('README') ||
          fileName.includes('src/') ||
          fileName.includes('app/') ||
          fileName.includes('pages/') ||
          fileName.endsWith('.tsx') ||
          fileName.endsWith('.ts') ||
          fileName.endsWith('.jsx') ||
          fileName.endsWith('.js')
        ) {
          // FileInfo has 'name' property, construct path from repoPath + name
          keyFiles.push(`${repoPath}/${fileName}`);
        }
      }

      // Read key files (limit to first 10 to avoid token limits)
      let context = `File Structure:\n${fileList.slice(0, 50).map((f) => f.name).join('\n')}\n\n`;

      // Read important files using downloadFile
      for (const filePath of keyFiles.slice(0, 10)) {
        try {
          const content = await sandbox.fs.downloadFile(filePath);
          context += `\n--- File: ${filePath} ---\n${content.toString('utf-8')}\n`;
        } catch (error) {
          // Skip files that can't be read
          console.warn(`Could not read file ${filePath}:`, error);
        }
      }

      return context;
    } catch (error) {
      console.error('Error getting code context:', error);
      return 'Unable to retrieve code context';
    }
  }

  /**
   * Implements the fix/feature in the sandbox based on Claude's analysis
   */
  async implementChanges(
    sandbox: Sandbox,
    repoPath: string,
    issue: ParsedIssue,
    analysis: string
  ): Promise<void> {
    try {
      // Extract code changes from Claude's response
      // This is a simplified version - in production, you'd want more sophisticated parsing
      const codeBlocks = this.extractCodeBlocks(analysis);
      
      console.log(`Implementing changes based on Claude's analysis...`);
      console.log(`Found ${codeBlocks.length} code blocks to apply`);

      // For now, we'll use Claude's instructions to guide manual implementation
      // In a more advanced version, we could parse and apply diffs automatically
      
      // Save the analysis to a file in the sandbox for reference
      const analysisContent = Buffer.from(`# AutoFixer Analysis for Issue #${issue.issueNumber}\n\n${analysis}`, 'utf-8');
      await sandbox.fs.uploadFile(
        analysisContent,
        `${repoPath}/.autofixer-analysis.md`
      );

      // Execute the implementation plan
      // This is a simplified approach - Claude's response should include specific commands
      // or code changes that can be applied
      console.log('Claude analysis saved. Manual implementation may be required.');
      console.log('Analysis:', analysis.substring(0, 500) + '...');
    } catch (error) {
      console.error('Error implementing changes:', error);
      throw error;
    }
  }

  /**
   * Extracts code blocks from Claude's response
   */
  private extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
    const codeBlocks: Array<{ language: string; code: string }> = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2],
      });
    }

    return codeBlocks;
  }
}


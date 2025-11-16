import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyGitHubSignature, parseWebhookPayload, isIssueOpenedEvent } from '@/lib/github-webhook';
import { parseIssue, validateParsedIssue } from '@/lib/issue-parser';
import { DaytonaClient } from '@/lib/daytona';
import { db } from '@/lib/db';
import { InMemoryIssue } from '@/types/daytona';

export const config = {
  api: {
    bodyParser: false, // We need raw body for signature verification
  },
};

// Helper to read raw body from request
function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Get the raw body for signature verification
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-hub-signature-256'] as string;

    // Verify GitHub signature
    const isValid = verifyGitHubSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the webhook payload
    const body = JSON.parse(rawBody);
    const payload = parseWebhookPayload(body);

    // Check if this is an issue opened event
    if (!isIssueOpenedEvent(payload)) {
      console.log(`Ignoring event: ${payload.action}`);
      return res.status(200).json({ message: 'Event ignored' });
    }

    console.log(`Received issue opened event: #${payload.issue.number} - ${payload.issue.title}`);

    // Parse the issue
    const parsedIssue = parseIssue(payload);
    
    // Validate parsed issue
    if (!validateParsedIssue(parsedIssue)) {
      console.error('Invalid issue data:', parsedIssue);
      return res.status(400).json({ error: 'Invalid issue data' });
    }

    // Store issue in memory DB
    const issueRecord: InMemoryIssue = {
      issueNumber: parsedIssue.issueNumber,
      repositoryName: parsedIssue.repositoryName,
      repositoryOwner: parsedIssue.repositoryOwner,
      title: parsedIssue.title,
      body: parsedIssue.body,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.saveIssue(issueRecord);

    // Initialize clients
    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    const daytonaApiUrl = process.env.DAYTONA_API_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!daytonaApiKey) {
      console.error('DAYTONA_API_KEY is not set');
      db.updateIssue(parsedIssue.issueNumber, { status: 'failed' });
      return res.status(500).json({ error: 'Daytona API key not configured' });
    }

    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY is not set');
      db.updateIssue(parsedIssue.issueNumber, { status: 'failed' });
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    const daytonaClient = new DaytonaClient(daytonaApiKey, daytonaApiUrl);

    // Update issue status to processing
    db.updateIssue(parsedIssue.issueNumber, { status: 'processing' });

    // Step 1: Create BEFORE and AFTER sandboxes
    console.log(`Creating BEFORE and AFTER sandboxes for issue #${parsedIssue.issueNumber}...`);
    const sandboxPair = await daytonaClient.createSandboxPair(parsedIssue, anthropicApiKey);
    
    console.log(`BEFORE sandbox: ${sandboxPair.before.id}`);
    console.log(`AFTER sandbox: ${sandboxPair.after.id}`);

    // Step 2: Setup and run app in BEFORE sandbox
    console.log('Setting up app in BEFORE sandbox...');
    await daytonaClient.setupAndRunApp(sandboxPair.before.id, parsedIssue.repositoryName);

    // Step 3: Run Claude Code CLI inside AFTER sandbox to analyze and implement fixes
    console.log('Running Claude Code CLI inside AFTER sandbox...');
    const claudeResult = await daytonaClient.runClaudeCodeInSandbox(
      sandboxPair.after.id,
      parsedIssue.repositoryName,
      parsedIssue.title,
      parsedIssue.body
    );
    console.log('Claude Code CLI execution complete in AFTER sandbox');
    console.log('Claude result:', claudeResult.result?.substring(0, 200) || 'No result');

    // Step 4: Setup and run app in AFTER sandbox
    console.log('Setting up app in AFTER sandbox...');
    await daytonaClient.setupAndRunApp(sandboxPair.after.id, parsedIssue.repositoryName);

    // Step 5: Get preview URLs (refresh them to ensure they're current)
    console.log('\n📋 Getting preview URLs for both sandboxes...');
    const beforePreview = await daytonaClient.getPreviewUrl(sandboxPair.before.id, 3000);
    const afterPreview = await daytonaClient.getPreviewUrl(sandboxPair.after.id, 3000);

    // Update sandbox pair with preview URLs
    sandboxPair.before.previewUrl = beforePreview.url;
    sandboxPair.before.previewToken = beforePreview.token;
    sandboxPair.after.previewUrl = afterPreview.url;
    sandboxPair.after.previewToken = afterPreview.token;

    // Step 6: Create branch, push changes, and create PR
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error('⚠️  GITHUB_TOKEN not set, skipping PR creation');
    } else {
      console.log('\n📝 Creating branch and pull request...');
      try {
        const prResult = await daytonaClient.createBranchAndPR(
          sandboxPair.after.id,
          parsedIssue.repositoryName,
          parsedIssue.issueNumber,
          parsedIssue.title,
          parsedIssue.repositoryOwner,
          parsedIssue.repositoryName,
          parsedIssue.defaultBranch,
          githubToken,
          beforePreview.url,
          afterPreview.url,
          beforePreview.token,
          afterPreview.token
        );
        console.log(`✅ PR created: ${prResult.prUrl}`);
      } catch (error) {
        console.error('❌ Failed to create PR:', error);
        // Continue even if PR creation fails
      }
    }

    // Print preview URLs in a clear, clickable format
    console.log('\n' + '='.repeat(80));
    console.log('🎉 ISSUE PROCESSING COMPLETE!');
    console.log('='.repeat(80));
    console.log(`\n📝 Issue #${parsedIssue.issueNumber}: ${parsedIssue.title}`);
    console.log('\n' + '-'.repeat(80));
    console.log('🔴 BEFORE SANDBOX (Original State)');
    console.log('-'.repeat(80));
    console.log(`   Sandbox ID: ${sandboxPair.before.id}`);
    console.log(`   🔗 Preview URL: ${beforePreview.url}`);
    console.log(`   🔑 Token: ${beforePreview.token}`);
    console.log(`   📋 Access: curl -H "x-daytona-preview-token: ${beforePreview.token}" ${beforePreview.url}`);
    console.log('\n' + '-'.repeat(80));
    console.log('🟢 AFTER SANDBOX (With Fixes Applied)');
    console.log('-'.repeat(80));
    console.log(`   Sandbox ID: ${sandboxPair.after.id}`);
    console.log(`   🔗 Preview URL: ${afterPreview.url}`);
    console.log(`   🔑 Token: ${afterPreview.token}`);
    console.log(`   📋 Access: curl -H "x-daytona-preview-token: ${afterPreview.token}" ${afterPreview.url}`);
    console.log('\n' + '='.repeat(80) + '\n');

    // Update issue with sandbox IDs
    db.updateIssue(parsedIssue.issueNumber, {
      beforeWorkspaceId: sandboxPair.before.id,
      afterWorkspaceId: sandboxPair.after.id,
      status: 'completed',
    });

    // Return success response
    return res.status(200).json({
      message: 'Issue processed successfully',
      issue: parsedIssue,
      sandboxes: {
        before: {
          id: sandboxPair.before.id,
          name: sandboxPair.before.name,
          previewUrl: sandboxPair.before.previewUrl,
          previewToken: sandboxPair.before.previewToken,
        },
        after: {
          id: sandboxPair.after.id,
          name: sandboxPair.after.name,
          previewUrl: sandboxPair.after.previewUrl,
          previewToken: sandboxPair.after.previewToken,
        },
      },
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Try to update issue status if we have the issue number
    // Note: We can't access req.body here since bodyParser is disabled
    // This is a fallback that may not always work

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}


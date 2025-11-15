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

    // Initialize Daytona client
    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    const daytonaApiUrl = process.env.DAYTONA_API_URL;
    
    if (!daytonaApiKey) {
      console.error('DAYTONA_API_KEY is not set');
      db.updateIssue(parsedIssue.issueNumber, { status: 'failed' });
      return res.status(500).json({ error: 'Daytona API key not configured' });
    }

    const daytonaClient = new DaytonaClient(daytonaApiKey, daytonaApiUrl);

    // Update issue status to processing
    db.updateIssue(parsedIssue.issueNumber, { status: 'processing' });

    // Create Daytona sandbox
    console.log(`Creating Daytona workspace for issue #${parsedIssue.issueNumber}...`);
    const workspace = await daytonaClient.createWorkspace(
      parsedIssue,
      `issue-${parsedIssue.issueNumber}-${parsedIssue.repositoryName}`
    );

    console.log(`Workspace created: ${workspace.id} - ${workspace.name}`);

    // Update issue with workspace ID
    db.updateIssue(parsedIssue.issueNumber, {
      workspaceId: workspace.id,
      status: 'completed',
    });

    // Return success response
    return res.status(200).json({
      message: 'Issue processed and workspace created',
      issue: parsedIssue,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ideUrl: workspace.ideUrl,
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


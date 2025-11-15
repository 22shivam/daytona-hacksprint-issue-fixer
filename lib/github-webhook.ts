import crypto from 'crypto';
import { GitHubWebhookPayload } from '@/types/github';

/**
 * Verifies the HMAC signature of a GitHub webhook payload
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

/**
 * Parses the raw request body to extract the webhook payload
 */
export function parseWebhookPayload(body: any): GitHubWebhookPayload {
  return body as GitHubWebhookPayload;
}

/**
 * Validates that the webhook event is an issue creation event
 */
export function isIssueOpenedEvent(payload: GitHubWebhookPayload): boolean {
  return payload.action === 'opened' && payload.issue !== undefined;
}

